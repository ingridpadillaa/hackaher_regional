from datetime import date

from app.services.firestore_repo import visible_movements
from app.services.movements import save_movement
from tests.conftest import csrf


def test_private_movements_scope(app):
    with app.app_context():
        repository = app.extensions["repo"]
        save_movement(
            repository,
            "one",
            "alice",
            dict(
                monto=100,
                fecha=date.today().isoformat(),
                descripcion="Privado Alice",
                categoria="Salud",
                privado=True,
            ),
        )
        save_movement(
            repository,
            "two",
            "bob",
            dict(monto=20, fecha=date.today().isoformat(), descripcion="Otro hogar", categoria="Otros"),
        )
        assert len(visible_movements("one", "alice")) == 1
        assert visible_movements("one", "bob") == []


def test_jobs_require_secret(client, monkeypatch):
    assert client.post("/jobs/daily-alerts").status_code == 403
    monkeypatch.setenv("CRON_SECRET", "test-secret")
    assert client.post("/jobs/daily-alerts", headers={"X-Cron-Secret": "wrong"}).status_code == 403
    assert client.post("/jobs/daily-alerts", headers={"X-Cron-Secret": "test-secret"}).status_code == 200


def test_export_and_delete(logged, app):
    exported = logged.get("/perfil/exportar")
    assert exported.status_code == 200
    assert all(m["integranteId"] == exported.json["perfil"]["uid"] for m in exported.json["movimientos"])
    household_id = exported.json["perfil"]["hogarId"]
    token = csrf(logged, "/perfil")
    assert (
        logged.post("/perfil/borrar", data={"csrf_token": token, "confirmation": "BORRAR"}).status_code == 302
    )
    assert app.extensions["repo"].get("hogares/" + household_id) is None
    assert logged.get("/").status_code == 302


def test_cannot_access_other_draft(logged, app):
    profile = logged.get("/perfil/exportar").json["perfil"]
    draft = app.extensions["repo"].add(f"hogares/{profile['hogarId']}/borradores", {"uid": "someone-else"})
    assert logged.get("/movimientos/confirmar/" + draft).status_code == 404


def test_uploaded_file_limit(logged):
    token = csrf(logged, "/")
    assert (
        logged.post(
            "/movimientos/importar/foto",
            data=b"x" * (10 * 1024 * 1024 + 1),
            headers={"X-CSRF-Token": token, "Content-Type": "application/octet-stream"},
        ).status_code
        == 413
    )


def test_flash_uses_only_forwarded_session_cookie(logged):
    token = csrf(logged, "/perfil")
    response = logged.post("/perfil/consentimientos", data={"csrf_token": token, "ai": "1"})
    assert not response.headers.getlist("Set-Cookie")
    assert "Tus preferencias quedaron guardadas." in logged.get("/perfil").text
