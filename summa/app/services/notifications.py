import hashlib
from datetime import timedelta

from .clock import local_today
from .planning import refresh_plan

ALLOWED_ROUTES = {
    "/",
    "/movimientos",
    "/movimientos/reportes",
    "/perfil/personalizacion",
    "/perfil/personalizacion/pagos",
    "/calendario",
    "/mandado",
}


def notify(repository, hid, kind, title, message, route="/", severity="info", key=None):
    if route not in ALLOWED_ROUTES:
        route = "/"
    base = f"hogares/{hid}/notificaciones"
    today = local_today().isoformat()
    key = key or hashlib.sha256((kind + title + today).encode()).hexdigest()
    path = base + "/" + key
    quota = f"hogares/{hid}/limitesNotificaciones/{today}"

    def write(current):
        count = (current[quota] or {}).get("cantidad", 0)
        if current[path] or count >= 3:
            return {}, False
        value = dict(
            tipo=kind,
            titulo=title,
            mensaje=message,
            severidad=severity,
            accion={"ruta": route},
            leida=False,
            creadaEn=today,
        )
        return {path: value, quota: {"cantidad": count + 1}}, True

    return repository.atomic([path, quota], write)


def refresh(repository, hid):
    base = f"hogares/{hid}"
    plan = refresh_plan(repository, hid)
    today = local_today()
    movements = [
        m for m in repository.list(base + "/movimientos") if not m.get("privado") and m["tipo"] == "gasto"
    ]
    for category, budget in plan["porCategoria"].items():
        spent = sum(
            m["monto"]
            for m in movements
            if m["fecha"][:7] == today.isoformat()[:7] and m["categoria"] == category
        )
        ratio = spent / budget if budget else 0
        if ratio >= 0.8 or (today.day <= 10 and ratio > 0.5):
            level = "100" if ratio >= 1 else "80" if ratio >= 0.8 else "ritmo"
            notify(
                repository,
                hid,
                "presupuesto",
                f"Revisa {category}",
                f"Llevas {ratio:.0%} del presupuesto sugerido de {category}.",
                "/movimientos/reportes",
                "danger" if ratio >= 1 else "warning",
                f"budget-{today:%Y-%m}-{category}-{level}",
            )
    for payment in repository.list(base + "/pagosFijos"):
        due = payment["proximaFecha"]
        days = 5 if payment.get("tipo") == "tarjeta_credito" else 3
        if today.isoformat() <= due <= (today + timedelta(days=days)).isoformat():
            notify(
                repository,
                hid,
                "pago",
                "Se acerca un pago",
                f"{payment['nombre']} vence el {due}.",
                "/perfil/personalizacion/pagos",
                "warning",
                f"payment-{payment['id']}-{due}",
            )
    from .alerts import refresh_alerts

    refresh_alerts(repository, hid)
    for alert in repository.list(base + "/alertas"):
        notify(
            repository,
            hid,
            "alerta",
            "Revisa tu hogar",
            alert["mensaje"],
            "/movimientos",
            key="alert-" + alert["id"],
        )
