import hashlib
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation

from app.services.clock import local_today

from .categorizer import CATEGORIES, is_card_payment, normalize


def validate_movement(data):
    try:
        amount = Decimal(str(data.get("monto", "0"))).quantize(Decimal(".01"))
        if not amount.is_finite() or not 0 < amount <= 100000000:
            raise ValueError()
        day = date.fromisoformat(data.get("fecha", ""))
        if day > local_today():
            raise ValueError()
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError("Revisa el monto y la fecha del movimiento.") from exc
    kind, method, category = (
        data.get("tipo", "gasto"),
        data.get("metodoPago", "efectivo"),
        data.get("categoria", "Otros"),
    )
    if (
        kind not in ("gasto", "ingreso", "transferencia")
        or method not in ("efectivo", "debito", "credito", "transferencia")
        or category not in CATEGORIES
    ):
        raise ValueError("Revisa el tipo, categoría y método de pago.")
    description = str(data.get("descripcion", "")).strip()[:160] or category
    if is_card_payment(description):
        kind = "transferencia"
    return dict(
        monto=float(amount.quantize(Decimal(".01"))),
        fecha=day.isoformat(),
        tipo=kind,
        categoria=category,
        metodoPago=method,
        descripcion=description,
        comercio=str(data.get("comercio") or description)[:160],
        privado=bool(data.get("privado", False)),
        cuentaId=str(data.get("cuentaId", ""))[:80],
    )


def save_movement(repository, household_id, uid, data, origin="manual", deduplicate=False):
    movement = validate_movement(data)
    digest = hashlib.sha256(
        f"{movement['fecha']}|{movement['monto']:.2f}|{normalize(movement['descripcion'])}|{movement['cuentaId']}".encode()
    ).hexdigest()
    doc_id = digest if deduplicate else uuid.uuid4().hex
    base = f"hogares/{household_id}"
    path = f"{base}/movimientos/{doc_id}"
    summary_path = f"{base}/resumenes/{movement['fecha'][:7]}"
    movement.update(integranteId=uid, origen=origin, hashDedup=digest, creadoEn=datetime.now(UTC).isoformat())
    for key in ("pagoFijoId", "pagoFecha", "externalId", "conexionId", "esPrueba"):
        if data.get(key):
            movement[key] = data[key]

    def update(current):
        if current[path]:
            return {}, False
        summary = current[summary_path] or {"ingresos": 0, "egresos": 0, "porCategoria": {}}
        amount = movement["monto"]
        if movement["tipo"] == "ingreso":
            summary["ingresos"] = round(summary["ingresos"] + amount, 2)
        elif movement["tipo"] == "gasto":
            summary["egresos"] = round(summary["egresos"] + amount, 2)
            category = movement["categoria"]
            summary["porCategoria"][category] = round(summary["porCategoria"].get(category, 0) + amount, 2)
        return {path: movement, summary_path: summary}, True

    return repository.atomic([path, summary_path], update)


def delete_movement(repository, household_id, movement):
    base = f"hogares/{household_id}"
    path = f"{base}/movimientos/{movement['id']}"
    summary_path = f"{base}/resumenes/{movement['fecha'][:7]}"

    def update(current):
        item = current[path]
        if not item:
            return {}, None
        summary = current[summary_path] or {"ingresos": 0, "egresos": 0, "porCategoria": {}}
        if item["tipo"] in ("gasto", "ingreso"):
            key = "egresos" if item["tipo"] == "gasto" else "ingresos"
            summary[key] = round(summary[key] - item["monto"], 2)
            if item["tipo"] == "gasto":
                cat = item["categoria"]
                summary["porCategoria"][cat] = round(summary["porCategoria"].get(cat, 0) - item["monto"], 2)
        return {path: None, summary_path: summary}, None

    repository.atomic([path, summary_path], update)


def edit_movement(repository, household_id, uid, movement_id, data):
    base = f"hogares/{household_id}"
    path = f"{base}/movimientos/{movement_id}"
    original = repository.get(path)
    if not original or original["integranteId"] != uid:
        raise ValueError("No puedes editar este movimiento.")
    if original.get("pagoFijoId"):
        raise ValueError("Este movimiento está vinculado a un pago fijo; corrígelo desde Pagos fijos.")
    updated = dict(original, **validate_movement(data))
    updated["hashDedup"] = hashlib.sha256(
        f"{updated['fecha']}|{updated['monto']:.2f}|{normalize(updated['descripcion'])}|{updated['cuentaId']}".encode()
    ).hexdigest()
    old_summary = f"{base}/resumenes/{original['fecha'][:7]}"
    new_summary = f"{base}/resumenes/{updated['fecha'][:7]}"

    def apply(current):
        if current[path] != original:
            raise ValueError("El movimiento cambió. Recarga antes de editar.")
        summaries = {
            key: current[key] or {"ingresos": 0, "egresos": 0, "porCategoria": {}}
            for key in (old_summary, new_summary)
        }
        for item, key, sign in ((original, old_summary, -1), (updated, new_summary, 1)):
            if item["tipo"] == "transferencia":
                continue
            summary = summaries[key]
            field = "egresos" if item["tipo"] == "gasto" else "ingresos"
            summary[field] = round(summary[field] + sign * item["monto"], 2)
            if item["tipo"] == "gasto":
                category = item["categoria"]
                summary["porCategoria"][category] = round(
                    summary["porCategoria"].get(category, 0) + sign * item["monto"], 2
                )
        return {path: updated, **summaries}, True

    return repository.atomic(list(dict.fromkeys([path, old_summary, new_summary])), apply)
