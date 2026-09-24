"""Evidence-based daily streaks. Missing days never count as saving days."""

from datetime import timedelta

from .budget import daily_budget
from .clock import local_today
from .notifications import notify
from .planning import ESSENTIAL


def snapshot(repository, hid, today=None):
    today = today or local_today()
    base = f"hogares/{hid}"
    path = base + "/evidenciaRacha/" + today.isoformat()
    if repository.get(path):
        return
    home = repository.get(base)
    movements = [m for m in repository.list(base + "/movimientos") if not m.get("privado")]
    budget = daily_budget(home, movements, repository.list(base + "/pagosFijos"), today)
    if not budget["has_income"]:
        return
    accounts = repository.list(base + "/cuentas")
    repository.put(
        path,
        dict(
            disponible=budget["daily"],
            saldo=sum(a.get("saldo", 0) for a in accounts) if accounts else None,
            fecha=today.isoformat(),
        ),
    )


def evaluate(repository, hid, today=None):
    today = today or local_today()
    yesterday = today - timedelta(days=1)
    base = f"hogares/{hid}"
    path = base + "/racha/estado"
    old = repository.get(path) or {}
    if old.get("ultimoDiaEvaluado", "") >= yesterday.isoformat():
        return old
    evidence = repository.get(base + "/evidenciaRacha/" + yesterday.isoformat())
    movements = [
        m
        for m in repository.list(base + "/movimientos")
        if m["fecha"] == yesterday.isoformat() and not m.get("privado")
    ]
    # A recorded movement or an explicit end-of-day check is required in manual mode.
    known = bool(evidence and (movements or evidence.get("confirmado")))
    discretionary = sum(
        m["monto"]
        for m in movements
        if m["tipo"] == "gasto" and m["categoria"] not in ESSENTIAL and not m.get("pagoFijoId")
    )
    fulfilled = (
        known and discretionary <= evidence["disponible"] and not any(m.get("atipico") for m in movements)
    )
    connections = repository.list(base + "/conexiones")
    if connections:
        current = repository.get(base + "/evidenciaRacha/" + today.isoformat())
        verified = all(
            c.get("ultimaSincronizacion") and c["ultimaSincronizacion"][:10] >= today.isoformat()
            for c in connections
        )
        fulfilled = bool(
            fulfilled
            and verified
            and current
            and current.get("saldo") is not None
            and evidence.get("saldo") is not None
            and evidence["saldo"] - current["saldo"] <= evidence["disponible"]
        )
        if any(
            not d.get("confirmed") and d.get("origin") == "banco"
            for d in repository.list(base + "/borradores")
        ):
            fulfilled = False
    week = f"{yesterday.isocalendar().year}-{yesterday.isocalendar().week}"

    def apply(state):
        current = state[path] or {}
        if current.get("ultimoDiaEvaluado", "") >= yesterday.isoformat():
            return {}, current
        streak = (
            current.get("diasActuales", 0)
            if current.get("ultimoDiaEvaluado") == (yesterday - timedelta(days=1)).isoformat()
            else 0
        )
        wildcard = 1 if current.get("semana") != week else current.get("comodinesDisponibles", 1)
        protected = bool(known and not fulfilled and wildcard and streak)
        days = streak + 1 if fulfilled else streak if protected else 0
        result = dict(
            diasActuales=days,
            mejorRacha=max(current.get("mejorRacha", 0), days),
            ultimoDiaEvaluado=yesterday.isoformat(),
            comodinesDisponibles=wildcard - int(protected),
            semana=week,
            historial=(
                current.get("historial", [])
                + [
                    dict(
                        fecha=yesterday.isoformat(),
                        cumplido=bool(fulfilled),
                        motivo="Ahorro comprobado"
                        if fulfilled
                        else "Comodín semanal"
                        if protected
                        else "Sin evidencia suficiente"
                        if not known
                        else "Se superó el disponible",
                    )
                ]
            )[-60:],
        )
        return {path: result}, result

    result = repository.atomic([path], apply)
    if result["diasActuales"] in (3, 7, 14, 30, 60) and fulfilled:
        notify(
            repository,
            hid,
            "racha",
            "¡Un paso más!",
            f"Llevas {result['diasActuales']} días de ahorro.",
            "/",
            key=f"racha-{yesterday}-{result['diasActuales']}",
        )
    return result
