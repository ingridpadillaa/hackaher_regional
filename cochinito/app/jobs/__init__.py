import hmac
import os
import time
from datetime import UTC, datetime

from flask import Blueprint, abort, current_app, request

from app.connectors.base import ProviderUnavailable
from app.connectors.router import ProviderRouter
from app.services.alerts import refresh_alerts
from app.services.bank_sync import sync_connection
from app.services.firestore_repo import repo

bp = Blueprint("jobs", __name__, url_prefix="/jobs")


@bp.before_request
def authenticate():
    expected = os.getenv("CRON_SECRET", "")
    if not expected or not hmac.compare_digest(request.headers.get("X-Cron-Secret", ""), expected):
        abort(403)


@bp.post("/<job>")
def run(job):
    if job not in ("profeco-sync", "sync-banks", "provider-health", "daily-alerts"):
        abort(404)
    start = time.monotonic()
    path = "jobLocks/" + job

    def acquire(current):
        state = current[path] or {}
        if state.get("until", 0) > time.time():
            return {}, False
        return {path: {"until": time.time() + 290}}, True

    if not repo().atomic([path], acquire):
        return {"status": "already-running"}, 202
    count = 0
    try:
        if job == "profeco-sync":
            from app.services.profeco_etl import sync_prices

            result = sync_prices(repo())
            return result
        if job == "provider-health":
            router = ProviderRouter(repo(), current_app.config["DEMO_MODE"])
            for name in router.order:
                try:

                    def check(provider):
                        if not provider.health_check():
                            raise ProviderUnavailable("Sin disponibilidad")
                        return True

                    router.call(name, check)
                except ProviderUnavailable:
                    pass
                count += 1
        else:
            if job == "daily-alerts":
                for ui_session in repo().list("uiSessions"):
                    if ui_session.get("expires", 0) < time.time():
                        repo().delete("uiSessions/" + ui_session["id"])
            for household in repo().list("hogares"):
                if time.monotonic() - start > 240:
                    return {"status": "partial", "processed": count}, 202
                if job == "sync-banks":
                    for connection in repo().list(f"hogares/{household['id']}/conexiones"):
                        if time.monotonic() - start > 240:
                            return {"status": "partial", "processed": count}, 202
                        sync_connection(household["id"], connection["id"])
                        count += 1
                else:
                    refresh_alerts(repo(), household["id"])
                    count += 1
        return {"status": "ok", "processed": count}
    except ValueError:
        return {
            "status": "pending",
            "message": "La fuente externa no respondió o su formato cambió. Se conservan los datos anteriores.",
        }, 503
    finally:
        repo().put(path, {"until": 0, "lastRun": datetime.now(UTC).isoformat()})
