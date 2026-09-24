"""Idempotent demo seed scoped to a household."""

import random
import secrets
from datetime import timedelta

from app.services.clock import local_today
from app.services.movements import save_movement


def seed_household(repository, uid, reset=False):
    household_id = f"demo-{uid}"
    base = f"hogares/{household_id}"
    if repository.get(base) and not reset:
        return household_id
    if reset:
        for collection in (
            "movimientos",
            "pagosFijos",
            "tickets",
            "cuentas",
            "conexiones",
            "alertas",
            "resumenes",
            "mandado",
            "reglasCategoria",
            "borradores",
            "integrantes",
        ):
            for item in repository.list(f"{base}/{collection}"):
                repository.delete(f"{base}/{collection}/{item['id']}")
    today = local_today()
    repository.put(
        base,
        dict(
            nombre="Hogar Medina",
            ciudad="Monterrey",
            estado="NUEVO LEON",
            periodicidadIngreso="quincenal",
            ingresoEstimado=12000,
            ingresoVariable=False,
            ultimaFechaIngreso=(today - timedelta(days=7)).isoformat(),
            proximaFechaIngreso=(today + timedelta(days=8)).isoformat(),
            codigoInvitacion=secrets.token_hex(4).upper(),
            fondoEmergencia=4200,
            creadoEn=(today - timedelta(days=120)).isoformat(),
        ),
    )
    user = repository.get(f"usuarios/{uid}") or {"nombre": "Rosy", "email": ""}
    user.update(
        hogarId=household_id,
        rol="admin",
        consentimientos={"openBanking": False, "iaDatos": False, "fecha": today.isoformat()},
    )
    repository.put(f"usuarios/{uid}", user)
    repository.put(f"{base}/integrantes/{uid}", {"nombre": user["nombre"], "rol": "admin"})
    rng = random.Random(2026)
    for offset in range(120, -1, -1):
        day = today - timedelta(days=offset)
        entries = []
        if offset % 15 == 7:
            entries.append((12000, "Sueldo", "Nómina quincenal", "ingreso", "debito"))
        if day.day == 3:
            entries.append((499, "Servicios", "Telmex", "gasto", "debito"))
        if day.day == 5:
            entries.append((219 if offset > 30 else 249, "Suscripciones", "Netflix", "gasto", "debito"))
        if day.day == 8:
            entries.append((129, "Suscripciones", "Spotify", "gasto", "debito"))
        if day.day == 10:
            entries.append((1600, "Educación", "Colegiatura", "gasto", "debito"))
        if day.day == 12 and day.month % 2 == 0:
            entries.append((850, "Servicios", "CFE", "gasto", "debito"))
        if day.day == 28:
            entries.append((2100, "Créditos", "PAGO TARJETA", "transferencia", "debito"))
        if offset % 7 == 0:
            entries.append((rng.randint(420, 750), "Súper", "Súper del barrio", "gasto", "debito"))
        if offset % 9 == 0:
            entries.append((350, "Transporte", "Gasolina", "gasto", "credito"))
        if offset % 17 == 0:
            entries.append((180, "Salud", "Farmacia", "gasto", "efectivo"))
        if offset % 3 == 0:
            entries.append(
                (rng.choice([45, 65, 85]), "Comida fuera", "Tacos de la esquina", "gasto", "efectivo")
            )
        for amount, category, description, kind, method in entries:
            save_movement(
                repository,
                household_id,
                uid,
                dict(
                    monto=amount,
                    categoria=category,
                    descripcion=description,
                    tipo=kind,
                    metodoPago=method,
                    fecha=day.isoformat(),
                ),
                deduplicate=True,
            )
    for name, amount, kind, days, category in [
        ("Telmex", 499, "servicio", 4, "Servicios"),
        ("Netflix", 249, "suscripcion", 6, "Suscripciones"),
        ("Spotify", 129, "suscripcion", 11, "Suscripciones"),
        ("Colegiatura", 1600, "renta_colegiatura", 7, "Educación"),
        ("CFE", 850, "servicio", 12, "Servicios"),
        ("Págate a ti primero", 500, "ahorro", 1, "Ahorro"),
    ]:
        payment = dict(
            nombre=name,
            monto=amount,
            tipo=kind,
            periodicidad="mensual",
            proximaFecha=(today + timedelta(days=days)).isoformat(),
            categoria=category,
            origen="manual",
        )
        if name == "CFE":
            payment["datosServicio"] = {
                "kwhUltimo": 410,
                "historial": [
                    {"periodo": "anterior", "kwh": 390, "monto": 810},
                    {"periodo": "actual", "kwh": 410, "monto": 850},
                ],
            }
        repository.put(f"{base}/pagosFijos/{name.replace(' ', '-')}", payment)
    products = [
        ("Aceite 1 L", 38),
        ("Huevo 12 piezas", 42),
        ("Arroz 1 kg", 29),
        ("Frijol 1 kg", 36),
        ("Leche 1 L", 27),
        ("Detergente 1 kg", 45),
    ]
    for index in range(14):
        day = today - timedelta(days=98 - index * 7)
        repository.put(
            f"{base}/tickets/ticket-{index}",
            {
                "tienda": "Súper del barrio",
                "fecha": day.isoformat(),
                "total": 217,
                "productos": [
                    {
                        "nombreOriginal": name.upper(),
                        "nombreNormalizado": name,
                        "cantidad": 1,
                        "precio": price,
                    }
                    for name, price in products
                ],
            },
        )
    for si, store in enumerate(["Súper del barrio", "Mercado local", "Tienda de la esquina"]):
        for index, (name, price) in enumerate(products):
            repository.put(
                f"precios/demo-{si}-{index}",
                dict(
                    producto=name,
                    presentacion="",
                    marca="",
                    categoria="Súper",
                    tienda=store,
                    cadena=store,
                    municipio="MONTERREY",
                    estado="NUEVO LEON",
                    precio=price + si * 3 - index % 2,
                    fuente="demo",
                    fecha=today.isoformat(),
                ),
            )
    from app.services.calendar_seed import seed_calendar

    seed_calendar(repository)
    return household_id


if __name__ == "__main__":
    import argparse

    from app import create_app

    parser = argparse.ArgumentParser()
    parser.add_argument("--uid", default="demo-cli")
    parser.add_argument("--reset", action="store_true")
    args = parser.parse_args()
    app = create_app()
    if not app.config["DEMO_MODE"]:
        raise SystemExit("El seed solo está habilitado en modo demo")
    with app.app_context():
        print(seed_household(app.extensions["repo"], args.uid, args.reset))
