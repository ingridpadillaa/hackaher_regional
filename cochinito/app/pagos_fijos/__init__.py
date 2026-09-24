import os
from datetime import date

from flask import Blueprint, abort, flash, g, redirect, render_template, request

from app.auth import login_required
from app.services.alerts import refresh_alerts
from app.services.firestore_repo import repo, visible_movements
from app.services.recurrence import detect_recurrences

bp = Blueprint("pagos_fijos", __name__, url_prefix="/pagos-fijos")


@bp.route("", methods=["GET", "POST"])
@login_required
def index():
    base = f"hogares/{g.hogar_id}"
    if request.method == "POST":
        try:
            amount = float(request.form["amount"])
            due = date.fromisoformat(request.form["due"])
            kind = request.form["kind"]
            cadence = request.form.get("cadence", "mensual")
            if (
                not 0 <= amount < 100000000
                or kind
                not in (
                    "servicio",
                    "suscripcion",
                    "renta_colegiatura",
                    "credito",
                    "tarjeta_credito",
                    "ahorro",
                )
                or cadence not in ("semanal", "quincenal", "mensual", "bimestral")
            ):
                raise ValueError()
            payment = dict(
                nombre=request.form["name"][:100],
                monto=amount,
                tipo=kind,
                periodicidad=cadence,
                proximaFecha=due.isoformat(),
                categoria="Ahorro"
                if kind == "ahorro"
                else "Suscripciones"
                if kind == "suscripcion"
                else "Servicios",
                origen="manual",
            )
            if kind == "tarjeta_credito":
                limit = float(request.form.get("limit") or 0)
                available = float(request.form.get("available") or 0)
                minimum = float(request.form.get("minimum") or 0)
                if not 0 <= available <= limit or not 0 <= minimum <= amount:
                    raise ValueError()
                payment["datosTarjeta"] = dict(
                    limite=limit,
                    disponible=available,
                    pagoMinimo=minimum,
                    pagoSinIntereses=amount,
                    fechaLimite=due.isoformat(),
                )
            if kind == "credito":
                payment["datosCredito"] = dict(
                    saldo=float(request.form.get("balance") or 0),
                    pagosRestantes=int(request.form.get("remaining") or 0),
                    fechaFin=request.form.get("end_date") or "",
                )
            repo().add(base + "/pagosFijos", payment)
            refresh_alerts(repo(), g.hogar_id)
            flash("Pago fijo agregado.")
        except (ValueError, KeyError):
            flash("Revisa los datos del pago fijo.")
        return redirect("/pagos-fijos")
    payments = repo().list(base + "/pagosFijos")
    recurrences = detect_recurrences(visible_movements(g.hogar_id, g.user["uid"]))
    return render_template(
        "payments.html",
        payments=payments,
        recurrences=recurrences,
        dac=float(os.getenv("DAC_UMBRAL_KWH_MES", "850")),
    )


@bp.post("/<payment_id>/pagar")
@login_required
def paid(payment_id):
    base = f"hogares/{g.hogar_id}"
    path = f"{base}/pagosFijos/{payment_id}"
    payment = repo().get(path)
    if not payment:
        abort(404)
    if request.form.get("due") != payment["proximaFecha"]:
        flash("Este pago ya cambió. Revisa su próxima fecha.")
        return redirect("/pagos-fijos")
    from app.services.fixed_payments import record_payment

    try:
        saved = record_payment(repo(), g.hogar_id, g.user["uid"], payment_id, request.form.get("due", ""))
        refresh_alerts(repo(), g.hogar_id)
        flash("Pago registrado y próxima fecha actualizada." if saved else "Este pago ya fue registrado.")
    except ValueError as error:
        flash(str(error))
    return redirect("/pagos-fijos")


@bp.post("/<payment_id>/editar")
@login_required
def edit(payment_id):
    path = f"hogares/{g.hogar_id}/pagosFijos/{payment_id}"
    payment = repo().get(path)
    if not payment:
        abort(404)
    try:
        amount = float(request.form["amount"])
        due = date.fromisoformat(request.form["due"]).isoformat()
        if not 0 <= amount < 100000000:
            raise ValueError()
        payment.update(monto=amount, proximaFecha=due)
        if payment.get("datosTarjeta"):
            payment["datosTarjeta"].update(pagoSinIntereses=amount, fechaLimite=due)
        repo().put(path, payment)
    except (ValueError, KeyError):
        flash("Revisa el monto y la fecha.")
    return redirect("/pagos-fijos")
