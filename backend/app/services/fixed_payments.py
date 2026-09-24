"""Record a payment, advance its due date and update balances in one transaction."""

import hashlib
from datetime import date

from app.services.clock import local_today

from .budget import add_period
from .categorizer import normalize


def record_payment(repository, household_id, uid, payment_id, expected_due):
    base = f"hogares/{household_id}"
    payment_path = f"{base}/pagosFijos/{payment_id}"
    today = local_today().isoformat()
    key = hashlib.sha256((payment_id + "|" + expected_due).encode()).hexdigest()
    movement_path = f"{base}/movimientos/payment-{key}"
    summary_path = f"{base}/resumenes/{today[:7]}"

    def update(current):
        payment = current[payment_path]
        if not payment or payment["proximaFecha"] != expected_due or current[movement_path]:
            return {}, False
        amount = payment.get("datosTarjeta", {}).get("pagoSinIntereses", payment["monto"])
        if amount <= 0:
            raise ValueError("Agrega un monto antes de marcarlo pagado.")
        kind = "transferencia" if payment["tipo"] in ("tarjeta_credito", "ahorro") else "gasto"
        description = ("PAGO TARJETA " if payment["tipo"] == "tarjeta_credito" else "") + payment["nombre"]
        movement = dict(
            monto=amount,
            fecha=today,
            descripcion=description,
            comercio=payment["nombre"],
            tipo=kind,
            categoria=payment["categoria"],
            metodoPago="debito",
            pagoFijoId=payment_id,
            pagoFecha=expected_due,
            integranteId=uid,
            privado=False,
            origen="manual",
            cuentaId="",
            creadoEn=today,
            hashDedup=hashlib.sha256(f"{today}|{amount:.2f}|{normalize(description)}|".encode()).hexdigest(),
        )
        summary = current[summary_path] or {"ingresos": 0, "egresos": 0, "porCategoria": {}}
        if kind == "gasto":
            summary["egresos"] = round(summary["egresos"] + amount, 2)
            category = payment["categoria"]
            summary["porCategoria"][category] = round(summary["porCategoria"].get(category, 0) + amount, 2)
        cadence = payment["periodicidad"]
        due = date.fromisoformat(expected_due)
        next_day = (
            add_period(add_period(due, "mensual"), "mensual")
            if cadence == "bimestral"
            else add_period(due, cadence)
        )
        payment["proximaFecha"] = next_day.isoformat()
        if payment.get("datosCredito"):
            payment["datosCredito"]["pagosRestantes"] = max(0, payment["datosCredito"]["pagosRestantes"] - 1)
            payment["datosCredito"]["saldo"] = max(0, payment["datosCredito"]["saldo"] - amount)
        changes = {payment_path: payment, movement_path: movement, summary_path: summary}
        if payment["tipo"] == "ahorro":
            home = current[base]
            home["fondoEmergencia"] = round(home.get("fondoEmergencia", 0) + amount, 2)
            changes[base] = home
        return changes, True

    return repository.atomic([payment_path, movement_path, summary_path, base], update)
