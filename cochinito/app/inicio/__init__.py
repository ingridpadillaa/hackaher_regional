import secrets
import uuid
from datetime import date, timedelta

from flask import Blueprint, flash, g, redirect, render_template, request

from app.auth import login_required
from app.services.budget import add_period, daily_budget, health_score
from app.services.clock import local_today
from app.services.firestore_repo import repo, visible_movements
from app.services.seasonal import upcoming

bp = Blueprint("inicio", __name__)


@bp.get("/")
@login_required
def index():
    base = f"hogares/{g.hogar_id}"
    household = repo().get(base)
    movements = visible_movements(g.hogar_id, g.user["uid"])
    payments = repo().list(base + "/pagosFijos")
    events = upcoming(repo().list("eventosTemporada"), household, movements)
    season = events[0] if events else None
    budget = daily_budget(household, movements, payments, seasonal_weekly=season["weekly"] if season else 0)
    next_payments = sorted(
        [
            p
            for p in payments
            if local_today().isoformat()
            <= p["proximaFecha"]
            <= (local_today() + timedelta(days=15)).isoformat()
            and not p.get("pagado")
        ],
        key=lambda p: p["proximaFecha"],
    )
    expenses = sum(m["monto"] for m in movements if m["tipo"] == "gasto")
    monthly = expenses / max(
        1,
        (
            local_today()
            - date.fromisoformat(min([m["fecha"] for m in movements] or [local_today().isoformat()]))
        ).days
        / 30,
    )
    return render_template(
        "inicio.html",
        household=household,
        budget=budget,
        score=health_score(household, movements, payments),
        payments=next_payments,
        season=season,
        monthly=monthly,
        cushion_progress=min(100, household.get("fondoEmergencia", 0) / max(1, monthly) * 100),
        alerts=repo().list(base + "/alertas"),
        checklist=[
            ("Registra tu primer gasto", bool(movements), "/movimientos/nuevo"),
            ("Sube un ticket", bool(repo().list(base + "/tickets")), "/movimientos/importar/foto"),
            ("Agrega tus pagos fijos", bool(payments), "/pagos-fijos"),
            ("Conecta tu banco (opcional)", bool(repo().list(base + "/conexiones")), "/perfil"),
        ],
    )


@bp.route("/onboarding", methods=["GET", "POST"])
@login_required
def onboarding():
    if g.hogar_id:
        return redirect("/")
    if request.method == "POST":
        if not request.form.get("privacy"):
            flash("Acepta el aviso de privacidad para continuar.")
            return redirect("/onboarding")
        code = request.form.get("code", "").strip().upper()
        if code:
            matches = [h for h in repo().list("hogares") if h.get("codigoInvitacion") == code]
            if not matches:
                flash("No encontramos ese código.")
                return redirect("/onboarding")
            household_id = matches[0]["id"]
            role = "integrante"
        else:
            try:
                income = float(request.form["income"])
                next_day = date.fromisoformat(request.form["next_date"])
                periodicity = request.form["periodicity"]
                if (
                    not 0 < income < 100000000
                    or next_day <= local_today()
                    or periodicity not in ("semanal", "quincenal", "mensual")
                ):
                    raise ValueError()
            except (ValueError, KeyError):
                flash("Revisa tu ingreso y la próxima fecha de cobro.")
                return redirect("/onboarding")
            household_id = uuid.uuid4().hex
            role = "admin"
            repo().put(
                f"hogares/{household_id}",
                dict(
                    nombre=request.form.get("name", "Mi hogar")[:80],
                    ciudad=request.form.get("city", "Monterrey")[:80],
                    estado=request.form.get("state", "NUEVO LEON")[:80],
                    periodicidadIngreso=periodicity,
                    ingresoEstimado=income,
                    ingresoVariable=bool(request.form.get("variable")),
                    proximaFechaIngreso=next_day.isoformat(),
                    ultimaFechaIngreso=add_period(next_day, periodicity, -1).isoformat(),
                    codigoInvitacion=secrets.token_hex(4).upper(),
                    fondoEmergencia=0,
                    creadoEn=local_today().isoformat(),
                ),
            )
            for name in request.form.getlist("payments"):
                if name in (
                    "Luz",
                    "Agua",
                    "Gas",
                    "Internet",
                    "Celular",
                    "Renta",
                    "Colegiatura",
                    "Suscripciones",
                ):
                    repo().add(
                        f"hogares/{household_id}/pagosFijos",
                        dict(
                            nombre=name,
                            monto=0,
                            tipo="servicio",
                            periodicidad="mensual",
                            proximaFecha=next_day.isoformat(),
                            categoria="Servicios",
                            origen="manual",
                        ),
                    )
        user = dict(g.user)
        user.pop("uid", None)
        user.update(
            hogarId=household_id,
            rol=role,
            consentimientos={
                "iaDatos": bool(request.form.get("ai_consent")),
                "openBanking": False,
                "fecha": local_today().isoformat(),
            },
        )
        repo().put(f"usuarios/{g.user['uid']}", user)
        repo().put(
            f"hogares/{household_id}/integrantes/{g.user['uid']}", {"nombre": user["nombre"], "rol": role}
        )
        from app.services.calendar_seed import seed_calendar

        seed_calendar(repo())
        flash("¡Tu hogar está listo! Ajusta los montos de tus pagos fijos cuando quieras.")
        return redirect("/")
    return render_template("onboarding.html", next_date=(local_today() + timedelta(days=7)).isoformat())
