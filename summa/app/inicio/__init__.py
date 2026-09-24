import secrets
import uuid
from datetime import date, timedelta

from flask import Blueprint, flash, g, redirect, render_template, request

from app.auth import login_required
from app.services.budget import daily_budget, health_score
from app.services.clock import local_today
from app.services.firestore_repo import repo, visible_movements
from app.services.seasonal import upcoming

bp = Blueprint("inicio", __name__)


@bp.get("/")
@login_required
def index():
    base = f"hogares/{g.hogar_id}"
    from app.services.planning import refresh_plan

    refresh_plan(repo(), g.hogar_id)
    from app.services.streaks import evaluate, snapshot

    snapshot(repo(), g.hogar_id)
    evaluate(repo(), g.hogar_id)
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
        donation_prompt=__import__("app.services.donations", fromlist=["eligible"]).eligible(
            repo(), g.hogar_id, g.user
        ),
        household=household,
        goal=repo().get(base + "/metas/motivacion") or {},
        streak=repo().get(base + "/racha/estado") or {},
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
            ("Agrega tus pagos fijos", bool(payments), "/perfil/personalizacion/pagos"),
            ("Conecta tu banco (opcional)", bool(repo().list(base + "/conexiones")), "/perfil"),
        ],
    )


@bp.route("/onboarding", methods=["GET", "POST"])
@bp.route("/perfil/personalizacion", methods=["GET", "POST"])
@login_required
def onboarding():
    from app.services.personalization import amount, derive_household, parse_members, parse_payments

    existing = repo().get(f"hogares/{g.hogar_id}") if g.hogar_id else {}
    members = repo().list(f"hogares/{g.hogar_id}/integrantes") if g.hogar_id else []
    # Keep authenticated member first without deleting other account memberships.
    members.sort(key=lambda m: m["id"] != g.user["uid"])
    if g.hogar_id and g.user.get("rol") != "admin":
        from flask import abort

        abort(403)
    if request.method == "POST":
        try:
            if not request.form.get("privacy"):
                raise ValueError("Acepta el aviso de privacidad para continuar.")
            code = request.form.get("code", "").strip().upper()
            role = "admin"
            if code and not g.hogar_id:
                matches = [h for h in repo().list("hogares") if h.get("codigoInvitacion") == code]
                if not matches:
                    raise ValueError("No encontramos ese código.")
                hid = matches[0]["id"]
                role = "integrante"
                repo().put(
                    f"hogares/{hid}/integrantes/{g.user['uid']}",
                    {"nombre": g.user["nombre"], "uid": g.user["uid"], "rol": role},
                )
            else:
                parsed = parse_members(request.form, g.user["uid"])
                hid = g.hogar_id or uuid.uuid4().hex
                home = dict(existing or {})
                for key in ("nombre", "estado", "municipio", "codigoPostal"):
                    home[key] = request.form.get(key, "").strip()[:100]
                if not all(home[k] for k in ("nombre", "estado", "municipio")):
                    raise ValueError("Completa nombre, estado y municipio de tu hogar.")
                home["ciudad"] = home["municipio"]
                home.setdefault("esDemo", False)
                home.setdefault("codigoInvitacion", secrets.token_hex(4).upper())
                home.setdefault("creadoEn", local_today().isoformat())
                if (
                    request.form.get("location_consent")
                    and request.form.get("lat")
                    and request.form.get("lng")
                ):
                    lat, lng = float(request.form["lat"]), float(request.form["lng"])
                    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
                        raise ValueError("Ubicación inválida.")
                    home["ubicacion"] = dict(lat=lat, lng=lng)
                else:
                    home.pop("ubicacion", None)
                derive_household(home, parsed)
                documents = {f"hogares/{hid}": home}
                old_ids = {m["id"] for m in members}
                for member in parsed:
                    mid = member["id"]
                    if "/" in mid or not mid:
                        raise ValueError("Integrante inválido.")
                    if g.hogar_id and mid not in old_ids and mid == g.user["uid"]:
                        raise ValueError("Integrante no válido.")
                    documents[f"hogares/{hid}/integrantes/{mid}"] = member
                goal_name = request.form.get("goal_name", "").strip()
                if goal_name:
                    goal_amount = amount(request.form.get("goal_amount"))
                    goal_date = date.fromisoformat(request.form.get("goal_date", ""))
                    if goal_date <= local_today() or not goal_amount:
                        raise ValueError("Confirma el monto y una fecha futura para tu meta.")
                    old = repo().get(f"hogares/{hid}/metas/motivacion") or {}
                    documents[f"hogares/{hid}/metas/motivacion"] = dict(
                        nombre=goal_name[:100],
                        motivacion=request.form.get("motivation", "")[:100],
                        montoObjetivo=goal_amount,
                        fechaObjetivo=goal_date.isoformat(),
                        ahorrado=old.get("ahorrado", 0),
                        activa=True,
                        emoji="✦",
                    )
                payments = parse_payments(request.form)
                for payment in payments:
                    documents[f"hogares/{hid}/pagosFijos/{uuid.uuid4().hex}"] = payment
                repo().batch_put(documents)
            user = dict(g.user)
            user.pop("uid", None)
            user.update(
                hogarId=hid,
                rol=role,
                personalizacionCompleta=True,
                consentimientos=dict(
                    iaDatos=bool(request.form.get("ai_consent")),
                    openBanking=user.get("consentimientos", {}).get("openBanking", False),
                    ubicacion=bool(request.form.get("location_consent")),
                    fecha=local_today().isoformat(),
                ),
            )
            repo().put(f"usuarios/{g.user['uid']}", user)
            from app.services.calendar_seed import seed_calendar

            seed_calendar(repo())
            flash("Tu personalización quedó guardada.")
            return redirect("/")
        except (ValueError, KeyError) as error:
            flash(str(error))
    goal = repo().get(f"hogares/{g.hogar_id}/metas/motivacion") or {}
    import json
    from pathlib import Path

    templates = json.loads((Path(__file__).resolve().parents[2] / "data/pagos.json").read_text())
    from app.services.categorizer import CATEGORIES

    return render_template(
        "onboarding.html",
        household=existing or {},
        members=members,
        goal=goal,
        payment_templates=templates,
        categories=CATEGORIES,
    )


@bp.get("/pagos-fijos")
@login_required
def old_payments():
    return redirect("/perfil/personalizacion/pagos")


@bp.get("/api/inicio/desglose")
@login_required
def breakdown():
    base = f"hogares/{g.hogar_id}"
    home = repo().get(base)
    movements = visible_movements(g.hogar_id, g.user["uid"])
    events = upcoming(repo().list("eventosTemporada"), home, movements)
    return daily_budget(
        home,
        movements,
        repo().list(base + "/pagosFijos"),
        seasonal_weekly=events[0]["weekly"] if events else 0,
    )


@bp.get("/notificaciones")
@login_required
def notifications():
    from app.services.notifications import refresh

    refresh(repo(), g.hogar_id)
    return render_template(
        "notifications.html",
        notifications=sorted(
            repo().list(f"hogares/{g.hogar_id}/notificaciones"), key=lambda n: n["creadaEn"], reverse=True
        ),
    )


@bp.post("/notificaciones/<notification_id>/leer")
@login_required
def read_notification(notification_id):
    from flask import abort

    path = f"hogares/{g.hogar_id}/notificaciones/{notification_id}"
    item = repo().get(path)
    if not item:
        abort(404)
    item["leida"] = True
    repo().put(path, item)
    return redirect("/notificaciones")


@bp.post("/progreso/cerrar-dia")
@login_required
def close_day():
    from app.services.streaks import snapshot

    snapshot(repo(), g.hogar_id)
    path = f"hogares/{g.hogar_id}/evidenciaRacha/" + local_today().isoformat()
    record = repo().get(path)
    if record:
        record["confirmado"] = True
        repo().put(path, record)
        flash("Confirmaste que tus gastos de hoy están registrados. La racha se evalúa mañana.")
    return redirect("/")


@bp.post("/progreso/aportar")
@login_required
def contribute():
    from app.services.notifications import notify
    from app.services.personalization import amount

    path = f"hogares/{g.hogar_id}/metas/motivacion"
    try:
        value = amount(request.form.get("amount"))
        if not value:
            raise ValueError("Indica un aporte mayor a cero.")

        def update(current):
            goal = current[path]
            if not goal:
                raise ValueError("Primero crea una meta.")
            goal["ahorrado"] = round(goal.get("ahorrado", 0) + value, 2)
            return {path: goal}, goal

        goal = repo().atomic([path], update)
        if goal["ahorrado"] >= goal["montoObjetivo"]:
            notify(
                repo(),
                g.hogar_id,
                "meta",
                "¡Meta alcanzada!",
                "Llegaste al monto de tu meta.",
                "/",
                key="meta-motivacion-" + goal["fechaObjetivo"],
            )
        flash("Aporte registrado. Summa no mueve dinero; anota solo lo que ya apartaste.")
    except ValueError as error:
        flash(str(error))
    return redirect("/")
