import os
from urllib.parse import urlparse


def donation_url():
    url = os.getenv("DONATION_URL", "")
    parsed = urlparse(url)
    return url if parsed.scheme == "https" and parsed.hostname and not parsed.username else None


def eligible(repository, hid, user):
    if user.get("ocultarDonativos") or not donation_url():
        return False
    base = f"hogares/{hid}"
    if any(
        n.get("tipo") == "presupuesto" and not n.get("leida")
        for n in repository.list(base + "/notificaciones")
    ):
        return False
    goal = repository.get(base + "/metas/motivacion") or {}
    streak = repository.get(base + "/racha/estado") or {}
    return bool(
        (goal.get("montoObjetivo") and goal.get("ahorrado", 0) >= goal["montoObjetivo"])
        or streak.get("diasActuales") in (7, 30)
    )
