import time
from types import SimpleNamespace

import pytest

from app import create_app
from app.config import WEB_FIELDS, settings, web_config
from app.services import firebase_admin_client, gemini_connection
from app.services.llm import ExtractionUnavailable, GeminiClient
from scripts.check_connections import firestore_probe
from tests.conftest import csrf


@pytest.fixture
def isolated_env(monkeypatch):
    for key in (
        *WEB_FIELDS,
        "FIREBASE_WEB_CONFIG",
        "FIREBASE_PROJECT_ID",
        "FLASK_SECRET_KEY",
        "SECRET_KEY",
        "GEMINI_API_KEY",
        "GEMINI_MODEL",
        "APP_ENV",
        "K_SERVICE",
        "LOCAL_MODE",
        "ENV_FILE",
        "GOOGLE_APPLICATION_CREDENTIALS",
    ):
        monkeypatch.delenv(key, raising=False)
    return monkeypatch


def test_root_env_loaded_without_copy(tmp_path, isolated_env):
    path = tmp_path / ".env"
    path.write_text(
        "FLASK_SECRET_KEY=fake-test-only\nFIREBASE_WEB_API_KEY=public-test-only\nFIREBASE_PROJECT_ID=test-project\n"
    )
    isolated_env.setenv("ENV_FILE", str(path))
    config = settings()
    assert config["SECRET_KEY"] == "fake-test-only"
    assert config["FIREBASE_WEB_CONFIG"]["projectId"] == "test-project"
    assert list(tmp_path.iterdir()) == [path]


def test_frontend_only_receives_allowlisted_public_fields(isolated_env):
    isolated_env.setenv(
        "FIREBASE_WEB_CONFIG",
        '{"apiKey":"public-test","private_key":"must-not-leak","GEMINI_API_KEY":"must-not-leak"}',
    )
    isolated_env.setenv("FIREBASE_WEB_AUTH_DOMAIN", "test.invalid")
    assert web_config() == {"apiKey": "public-test", "authDomain": "test.invalid"}
    assert settings(load_file=False)["SESSION_COOKIE_SECURE"] is False
    isolated_env.setenv("APP_ENV", "production")
    assert settings(load_file=False)["SESSION_COOKIE_SECURE"] is True


def test_admin_initializes_once_and_resolves_relative_path(tmp_path, monkeypatch):
    import firebase_admin
    from firebase_admin import credentials

    state = {}
    seen = []

    def get_app():
        if not state:
            raise ValueError("not initialized")
        return state["app"]

    def initialize(credential, options):
        seen.append(options)
        state["app"] = SimpleNamespace(project_id=options["projectId"])
        return state["app"]

    paths = []
    monkeypatch.setattr(firebase_admin, "get_app", get_app)
    monkeypatch.setattr(firebase_admin, "initialize_app", initialize)
    monkeypatch.setattr(
        credentials,
        "Certificate",
        lambda path: paths.append(path) or SimpleNamespace(project_id="test-project"),
    )
    config = dict(
        FIREBASE_PROJECT_ID="test-project",
        GOOGLE_APPLICATION_CREDENTIALS="service.json",
        ENV_FILE_PATH=tmp_path / ".env",
    )
    assert firebase_admin_client.initialize(config) is firebase_admin_client.initialize(config)
    assert len(seen) == 1 and seen[0]["projectId"] == "test-project"
    assert paths == [str(tmp_path / "service.json")]


def test_admin_adc_and_no_project_failure(monkeypatch):
    import firebase_admin
    from firebase_admin import credentials

    monkeypatch.setattr(firebase_admin, "get_app", lambda: (_ for _ in ()).throw(ValueError()))
    calls = []
    monkeypatch.setattr(credentials, "ApplicationDefault", lambda: calls.append("adc") or object())
    monkeypatch.setattr(firebase_admin, "initialize_app", lambda credential, options: options)
    result = firebase_admin_client.initialize({"FIREBASE_PROJECT_ID": "test-project"})
    assert calls == ["adc"] and result["projectId"] == "test-project"
    with pytest.raises(ValueError, match="FIREBASE_PROJECT_ID"):
        firebase_admin_client.initialize({})


def test_admin_errors_never_echo_secret(monkeypatch):
    import firebase_admin
    from firebase_admin import credentials

    monkeypatch.setattr(firebase_admin, "get_app", lambda: (_ for _ in ()).throw(ValueError()))
    monkeypatch.setattr(
        credentials, "ApplicationDefault", lambda: (_ for _ in ()).throw(ValueError("private-test-secret"))
    )
    with pytest.raises(ValueError) as error:
        firebase_admin_client.initialize({"FIREBASE_PROJECT_ID": "test-project"})
    assert "private-test-secret" not in str(error.value)


class FakeGemini:
    def __init__(self):
        self.models = self

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def list(self):
        return [
            SimpleNamespace(name="models/available-test", supported_actions=["generateContent"]),
            SimpleNamespace(name="models/embedding-test", supported_actions=["embedContent"]),
        ]


def test_gemini_validates_configured_model(isolated_env):
    isolated_env.setenv("GEMINI_API_KEY", "fake-only")
    isolated_env.setenv("GEMINI_MODEL", "unavailable-test")
    isolated_env.setattr(gemini_connection, "client", lambda **kwargs: FakeGemini())
    result = gemini_connection.inspect_models()
    assert not result["ok"] and result["models"] == ["available-test"]
    assert "fake-only" not in str(result)
    isolated_env.setenv("GEMINI_MODEL", "models/available-test")
    assert gemini_connection.inspect_models()["ok"]


def test_gemini_timeouts_and_no_fixed_model(isolated_env):
    from google import genai

    isolated_env.setenv("GEMINI_API_KEY", "fake-only")
    seen = []
    isolated_env.setattr(genai, "Client", lambda **kwargs: seen.append(kwargs) or object())
    gemini_connection.client()
    gemini_connection.client(vision=True)
    assert [v["http_options"].timeout for v in seen] == [15000, 30000]
    with pytest.raises(ValueError, match="GEMINI_MODEL"):
        gemini_connection.model_name()


def test_gemini_failure_returns_manual_fallback(isolated_env):
    from pydantic import BaseModel

    class Result(BaseModel):
        value: str

    isolated_env.setenv("GEMINI_API_KEY", "fake-only")
    isolated_env.setenv("GEMINI_MODEL", "test-model")

    class Failed:
        models = None

        def __init__(self):
            self.models = self
            self.closed = False
            self.attempts = 0

        def generate_content(self, **kwargs):
            self.attempts += 1
            raise TimeoutError("private-test-secret")

        def close(self):
            self.closed = True

    failed = Failed()
    isolated_env.setattr(gemini_connection, "client", lambda **kwargs: failed)
    with pytest.raises(ExtractionUnavailable, match="captura manual") as error:
        GeminiClient().extract("test", Result)
    assert failed.closed and failed.attempts == 2
    assert "private-test-secret" not in str(error.value)


def test_firebase_session_flow(tmp_path, monkeypatch):
    from firebase_admin import auth

    app = create_app(
        dict(
            TESTING=True,
            TEST_FIREBASE_AUTH=True,
            LOCAL_MODE=False,
            DEMO_MODE=False,
            DATA_BACKEND="sqlite",
            DATABASE=str(tmp_path / "test.sqlite"),
            SECRET_KEY="test",
            SESSION_COOKIE_SECURE=False,
        )
    )
    monkeypatch.setattr(
        auth,
        "verify_id_token",
        lambda token, check_revoked: dict(uid="test-user", name="Test", auth_time=time.time()),
    )
    monkeypatch.setattr(auth, "create_session_cookie", lambda token, expires_in: "verified-cookie")
    monkeypatch.setattr(auth, "verify_session_cookie", lambda token, check_revoked: dict(uid="test-user"))
    client = app.test_client()
    response = client.post(
        "/auth/session", json={"token": "fake-token"}, headers={"X-CSRF-Token": csrf(client)}
    )
    assert response.json["next"] == "/onboarding"
    cookie = response.headers["Set-Cookie"]
    assert "__session=" in cookie and "HttpOnly" in cookie and "SameSite=Lax" in cookie
    assert "Secure;" not in cookie
    assert client.get("/").location.endswith("/onboarding")
    repository = app.extensions["repo"]
    user = repository.get("usuarios/test-user")
    repository.put("usuarios/test-user", dict(user, hogarId="home", personalizacionCompleta=True))
    repository.put("hogares/home/integrantes/test-user", {"nombre": "Test"})
    app.config["SESSION_COOKIE_SECURE"] = True
    response = client.post(
        "/auth/session", json={"token": "fake-token"}, headers={"X-CSRF-Token": csrf(client)}
    )
    assert response.json["next"] == "/" and "Secure;" in response.headers["Set-Cookie"]
    response = client.post("/auth/logout", data={"csrf_token": csrf(client)})
    assert "Max-Age=0" in response.headers["Set-Cookie"]


def test_probe_preserves_existing_document(monkeypatch, capsys):
    from firebase_admin import firestore

    class Existing:
        def create(self, *args, **kwargs):
            raise RuntimeError("private-test-secret")

        def delete(self, *args, **kwargs):
            pytest.fail("Existing document must not be deleted")

    monkeypatch.setattr(
        firestore, "client", lambda **kwargs: SimpleNamespace(document=lambda path: Existing())
    )
    assert not firestore_probe(object())
    output = capsys.readouterr().out
    assert "private-test-secret" not in output and "FALLA" in output
