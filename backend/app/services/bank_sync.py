import os
from datetime import UTC, datetime, timedelta

from cryptography.fernet import Fernet
from flask import current_app

from app.connectors.base import ProviderUnavailable
from app.connectors.router import ProviderRouter
from app.services.clock import local_today

from .categorizer import categorize, is_card_payment
from .firestore_repo import repo
from .movements import delete_movement


def cipher():
    key = os.getenv("ENCRYPTION_KEY")
    if not key:
        if not current_app.config["DEMO_MODE"]:
            raise RuntimeError("ENCRYPTION_KEY es obligatorio")
        # Persist a local demo key outside git, shared by local workers.
        from pathlib import Path

        path = Path(current_app.instance_path) / "demo.key"
        if not path.exists():
            try:
                with path.open("xb") as stream:
                    stream.write(Fernet.generate_key())
                path.chmod(0o600)
            except FileExistsError:
                pass
        key = path.read_bytes()
    return Fernet(key)


def connect_bank(household_id, uid):
    router = ProviderRouter(repo(), current_app.config["DEMO_MODE"])
    name, session = router.connect(uid)
    connection_id = repo().add(
        f"hogares/{household_id}/conexiones",
        dict(
            proveedor=name,
            estado="pendiente",
            uid=uid,
            ultimaSincronizacion=None,
            created=datetime.now(UTC).isoformat(),
        ),
    )
    repo().put(
        f"secretosConexion/{connection_id}",
        dict(proveedor=name, externalLinkId=cipher().encrypt(session["link_id"].encode()).decode()),
    )
    return connection_id


def sync_connection(household_id, connection_id):
    base = f"hogares/{household_id}"
    connection = repo().get(f"{base}/conexiones/{connection_id}")
    if not connection:
        return False
    secret = repo().get(f"secretosConexion/{connection_id}")
    if not secret:
        return False
    link = cipher().decrypt(secret["externalLinkId"].encode()).decode()
    router = ProviderRouter(repo(), current_app.config["DEMO_MODE"])
    try:

        def fetch(provider):
            return (
                provider.list_accounts(link),
                provider.list_transactions(link, local_today() - timedelta(days=120)),
                provider.list_credit_cards(link),
            )

        accounts, transactions, cards = router.call(connection["proveedor"], fetch)
        for account in accounts:
            repo().put(f"{base}/cuentas/{account.id}", dict(account.model_dump(), conexionId=connection_id))
        for card in cards:
            data = card.model_dump(mode="json")
            repo().put(
                f"{base}/pagosFijos/{card.id}",
                dict(
                    nombre="Tarjeta · Banco de prueba"
                    if current_app.config["DEMO_MODE"]
                    else "Tarjeta de crédito",
                    tipo="tarjeta_credito",
                    monto=card.pagoSinIntereses,
                    periodicidad="mensual",
                    proximaFecha=data["fechaLimite"],
                    categoria="Créditos",
                    origen="banco",
                    datosTarjeta=data,
                    conexionId=connection_id,
                ),
            )
        for tx in transactions:
            import hashlib

            draft_id = "bank-" + hashlib.sha256((connection_id + tx.externalId).encode()).hexdigest()
            draft_path = f"{base}/borradores/{draft_id}"
            if repo().get(draft_path):
                continue
            movement = dict(
                monto=abs(tx.monto),
                fecha=tx.fecha.isoformat(),
                descripcion=tx.descripcion,
                comercio=tx.descripcion,
                tipo="transferencia"
                if is_card_payment(tx.descripcion)
                else "ingreso"
                if tx.monto > 0
                else "gasto",
                metodoPago=tx.metodoPago,
                categoria=categorize(tx.descripcion, provider_category=tx.categoriaProveedor),
                cuentaId=tx.cuentaId,
                externalId=tx.externalId,
                conexionId=connection_id,
            )
            movement["esPrueba"] = connection["proveedor"] == "simulated"
            repo().put(
                draft_path,
                dict(
                    uid=connection["uid"],
                    origin="banco",
                    movements=[movement],
                    receipt=None,
                    demo=movement["esPrueba"],
                    created=datetime.now(UTC).isoformat(),
                ),
            )
        connection.update(estado="activa", ultimaSincronizacion=datetime.now(UTC).isoformat(), error=None)
        repo().put(f"{base}/conexiones/{connection_id}", connection)
        from .alerts import refresh_alerts

        refresh_alerts(repo(), household_id)
        return True
    except ProviderUnavailable:
        connection.update(
            estado="pendiente", error="Conservamos tus datos. Reintentaremos con tu proveedor original."
        )
        repo().put(f"{base}/conexiones/{connection_id}", connection)
        return False


def queue_sync(household_id, connection_id):
    if current_app.config["DEMO_MODE"] and not current_app.config.get("TESTING"):
        from threading import Thread

        app = current_app._get_current_object()

        def work():
            with app.app_context():
                sync_connection(household_id, connection_id)

        Thread(target=work, daemon=True).start()
    # The sync-banks CLI drains pending connections; views read stored data only.


def disconnect(household_id, connection_id, delete_imported=False):
    base = f"hogares/{household_id}"
    connection = repo().get(f"{base}/conexiones/{connection_id}")
    if not connection:
        return
    secret = repo().get(f"secretosConexion/{connection_id}")
    if secret:
        router = ProviderRouter(repo(), current_app.config["DEMO_MODE"])
        router.call(
            connection["proveedor"],
            lambda p: p.delete_link(cipher().decrypt(secret["externalLinkId"].encode()).decode()),
        )
    if delete_imported:
        for item in repo().list(base + "/movimientos"):
            if item.get("conexionId") == connection_id:
                delete_movement(repo(), household_id, item)
    for collection in ("cuentas", "pagosFijos"):
        for item in repo().list(base + "/" + collection):
            if item.get("conexionId") == connection_id:
                repo().delete(f"{base}/{collection}/{item['id']}")
    repo().delete(f"secretosConexion/{connection_id}")
    repo().delete(f"{base}/conexiones/{connection_id}")
