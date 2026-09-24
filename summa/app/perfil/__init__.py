from datetime import UTC, datetime

from flask import Blueprint, abort, current_app, flash, g, redirect, render_template, request

from app.auth import login_required
from app.connectors.base import ProviderUnavailable
from app.services.bank_sync import connect_bank, disconnect, queue_sync
from app.services.firestore_repo import repo

bp = Blueprint("perfil", __name__)


@bp.get("/perfil")
@login_required
def index():
    base = f"hogares/{g.hogar_id}"
    return render_template(
        "perfil.html",
        household=repo().get(base),
        members=repo().list(base + "/integrantes"),
        connections=repo().list(base + "/conexiones"),
        providers=[
            dict(repo().get(f"estadoProveedores/{name}") or {}, name=name)
            for name in ("syncfy", "finerio", "simulated")
        ],
        alerts=repo().list(base + "/alertas"),
        automation="Banco"
        if repo().list(base + "/conexiones")
        else "PDF"
        if any(m.get("origen") == "pdf" for m in repo().list(base + "/movimientos"))
        else "Manual",
    )


@bp.post("/perfil/conectar")
@login_required
def connect():
    if not request.form.get("consent"):
        flash("Autoriza la conexión para continuar.")
        return redirect("/perfil")
    user = dict(g.user)
    user.pop("uid", None)
    user.setdefault("consentimientos", {}).update(openBanking=True, fecha=datetime.now(UTC).isoformat())
    repo().put(f"usuarios/{g.user['uid']}", user)
    try:
        connection_id = connect_bank(g.hogar_id, g.user["uid"])
        queue_sync(g.hogar_id, connection_id)
        flash("Conexión creada. La sincronización está en proceso; actualiza la página en unos segundos.")
    except ProviderUnavailable as error:
        flash(str(error))
    return redirect("/perfil")


@bp.post("/perfil/conexiones/<connection_id>/<action>")
@login_required
def connection_action(connection_id, action):
    connection = repo().get(f"hogares/{g.hogar_id}/conexiones/{connection_id}")
    if not connection or connection.get("uid") != g.user["uid"]:
        abort(403)
    try:
        if action == "desconectar":
            disconnect(g.hogar_id, connection_id, bool(request.form.get("delete")))
        elif action == "sincronizar":
            queue_sync(g.hogar_id, connection_id)
        else:
            abort(404)
    except ProviderUnavailable:
        flash("No pudimos revocar la conexión con el proveedor. Reintenta cuando esté disponible.")
    return redirect("/perfil")


@bp.post("/perfil/proveedores/<name>/fallo")
@login_required
def force_failure(name):
    if not current_app.config["DEMO_MODE"] or name not in ("syncfy", "finerio", "simulated"):
        abort(404)
    path = f"estadoProveedores/{name}"
    state = repo().get(path) or {}
    state.update(
        forced=not state.get("forced", False), circuitoAbiertoHasta=0, fallosConsecutivos=0, probeUntil=0
    )
    repo().put(path, state)
    flash("Fallo simulado activado." if state["forced"] else "Proveedor simulado restaurado.")
    return redirect("/perfil")


@bp.post("/perfil/consentimientos")
@login_required
def consent():
    user = dict(g.user)
    user.pop("uid", None)
    user.setdefault("consentimientos", {}).update(
        iaDatos=bool(request.form.get("ai")), fecha=datetime.now(UTC).isoformat()
    )
    repo().put(f"usuarios/{g.user['uid']}", user)
    flash("Tus preferencias quedaron guardadas.")
    return redirect("/perfil")


@bp.get("/privacidad")
def privacy():
    return render_template("privacy.html")


@bp.get("/perfil/exportar")
@login_required
def export():
    from flask import jsonify

    base = f"hogares/{g.hogar_id}"
    # Export only the requesting person's movements, never another member's private data.
    data = {
        "perfil": g.user,
        "hogar": repo().get(base),
        "movimientos": [m for m in repo().list(base + "/movimientos") if m["integranteId"] == g.user["uid"]],
        "pagosFijos": repo().list(base + "/pagosFijos"),
    }
    response = jsonify(data)
    response.headers["Content-Disposition"] = 'attachment; filename="summa-mis-datos.json"'
    return response


@bp.post("/perfil/borrar")
@login_required
def delete_account():

    from app.services.movements import delete_movement

    if request.form.get("confirmation") != "BORRAR":
        flash("Escribe BORRAR para confirmar la eliminación.")
        return redirect("/perfil")
    base = f"hogares/{g.hogar_id}"
    members = repo().list(base + "/integrantes")
    sole = len(members) == 1
    try:
        for connection in repo().list(base + "/conexiones"):
            if sole or connection.get("uid") == g.user["uid"]:
                disconnect(g.hogar_id, connection["id"], True)
    except ProviderUnavailable:
        flash(
            "No se borró tu cuenta: falta revocar una conexión. Reintenta cuando su proveedor esté disponible."
        )
        return redirect("/perfil")
    for movement in repo().list(base + "/movimientos"):
        if sole or movement["integranteId"] == g.user["uid"]:
            delete_movement(repo(), g.hogar_id, movement)
    for draft in repo().list(base + "/borradores"):
        if sole or draft.get("uid") == g.user["uid"]:
            repo().delete(base + "/borradores/" + draft["id"])
    for collection in ("tickets", "preciosTicket"):
        for item in repo().list(base + "/" + collection):
            if sole or item.get("integranteId") == g.user["uid"]:
                repo().delete(f"{base}/{collection}/{item['id']}")
    if sole:
        for collection in (
            "integrantes",
            "pagosFijos",
            "cuentas",
            "conexiones",
            "tickets",
            "preciosTicket",
            "mandado",
            "reglasCategoria",
            "alertas",
            "resumenes",
        ):
            for item in repo().list(base + "/" + collection):
                repo().delete(f"{base}/{collection}/{item['id']}")
        repo().delete(base)
    else:
        repo().delete(base + "/integrantes/" + g.user["uid"])
        if g.user["rol"] == "admin":
            successor = next(m for m in members if m["id"] != g.user["uid"])
            successor["rol"] = "admin"
            repo().put(base + "/integrantes/" + successor["id"], successor)
            user = repo().get("usuarios/" + successor["id"])
            if user:
                user["rol"] = "admin"
                repo().put("usuarios/" + successor["id"], user)
        from app.services.alerts import refresh_alerts

        refresh_alerts(repo(), g.hogar_id)
    if not current_app.config["DEMO_MODE"]:
        from firebase_admin import auth

        auth.delete_user(g.user["uid"])
    repo().delete("usuarios/" + g.user["uid"])
    from flask import session

    session.clear()
    response = redirect("/auth/login")
    response.delete_cookie("__session")
    return response


@bp.get("/perfil/invitacion.svg")
@login_required
def invitation_qr():
    import io

    import qrcode
    import qrcode.image.svg
    from flask import Response

    code = repo().get(f"hogares/{g.hogar_id}")["codigoInvitacion"]
    image = qrcode.make(code, image_factory=qrcode.image.svg.SvgPathImage)
    output = io.BytesIO()
    image.save(output)
    return Response(output.getvalue(), mimetype="image/svg+xml")


@bp.post("/perfil/datos")
@login_required
def edit_profile():
    name = request.form.get("name", "").strip()[:80]
    if not name:
        flash("Escribe tu nombre.")
        return redirect("/perfil")
    user = dict(g.user)
    user.pop("uid", None)
    user["nombre"] = name
    repo().put("usuarios/" + g.user["uid"], user)
    repo().put(f"hogares/{g.hogar_id}/integrantes/{g.user['uid']}", {"nombre": name, "rol": user["rol"]})
    flash("Perfil actualizado.")
    return redirect("/perfil")
