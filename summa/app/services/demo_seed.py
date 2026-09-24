"""Opt-in demo provisioning. Never touches an existing real household."""

import hashlib
import uuid
from datetime import timedelta

from .clock import local_today
from .personalization import derive_household


def seed_demo(repository, email, reset=False):
    uid = "demo-" + hashlib.sha256(email.strip().lower().encode()).hexdigest()[:24]
    if repository.remote:
        from firebase_admin import auth

        user = auth.get_user_by_email(email)
        uid = user.uid
    previous = repository.get(f"usuarios/{uid}")
    if previous and previous.get("hogarId"):
        home = repository.get(f"hogares/{previous['hogarId']}") or {}
        if not home.get("esDemo"):
            raise ValueError("Esta cuenta pertenece a un hogar real; usa una cuenta aparte.")
        if not reset:
            return uid, previous["hogarId"]
        connections = repository.list(f"hogares/{previous['hogarId']}/conexiones")
        if connections:
            raise ValueError("Desconecta los bancos del hogar de ensayo antes de restablecerlo.")
        members = repository.list(f"hogares/{previous['hogarId']}/integrantes")
        if any(m["id"] != uid and repository.get("usuarios/" + m["id"]) for m in members):
            raise ValueError("El ensayo tiene otras cuentas vinculadas; no se restablecerá automáticamente.")
        # Delete only this demo household and all of its known collections.
        from .privacy import HOUSEHOLD_COLLECTIONS

        for collection in HOUSEHOLD_COLLECTIONS:
            for doc in repository.list(f"hogares/{previous['hogarId']}/{collection}"):
                repository.delete(f"hogares/{previous['hogarId']}/{collection}/{doc['id']}")
        repository.delete(f"hogares/{previous['hogarId']}")
    import json
    from pathlib import Path

    fixture = json.loads((Path(__file__).resolve().parents[2] / "data/demo.json").read_text())
    hid = uuid.uuid4().hex
    member = dict(
        fixture["member"],
        id=uid,
        uid=uid,
        proximaFechaIngreso=(local_today() + timedelta(days=7)).isoformat(),
    )
    home = derive_household(
        dict(fixture["home"], esDemo=True, codigoInvitacion=uuid.uuid4().hex[:8].upper()), [member]
    )
    repository.batch_put(
        {
            f"usuarios/{uid}": dict(
                nombre=member["nombre"], email=email, hogarId=hid, rol="admin", personalizacionCompleta=True
            ),
            f"hogares/{hid}": home,
            f"hogares/{hid}/integrantes/{uid}": member,
        }
    )
    from .movements import save_movement

    for payment in fixture.get("payments", []):
        repository.add(
            f"hogares/{hid}/pagosFijos",
            dict(payment, proximaFecha=(local_today() + timedelta(days=3)).isoformat()),
        )
    for movement in fixture.get("movements", []):
        save_movement(repository, hid, uid, dict(movement, fecha=local_today().isoformat()), deduplicate=True)
    return uid, hid
