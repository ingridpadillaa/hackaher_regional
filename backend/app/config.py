"""Load the existing root .env without copying it or logging configuration values."""

import json
import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

APP_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = APP_DIR.parent
WEB_FIELDS = {
    "FIREBASE_WEB_API_KEY": "apiKey",
    "FIREBASE_WEB_AUTH_DOMAIN": "authDomain",
    "FIREBASE_WEB_PROJECT_ID": "projectId",
    "FIREBASE_WEB_APP_ID": "appId",
    "FIREBASE_WEB_MESSAGING_SENDER_ID": "messagingSenderId",
    "FIREBASE_WEB_STORAGE_BUCKET": "storageBucket",
    "FIREBASE_WEB_MEASUREMENT_ID": "measurementId",
}
REQUIRED_ENV = ("FLASK_SECRET_KEY", "FIREBASE_PROJECT_ID", "GEMINI_API_KEY", "GEMINI_MODEL", "ENCRYPTION_KEY")
REQUIRED_WEB = ("apiKey", "authDomain", "projectId", "appId")


def env_path():
    explicit = os.getenv("ENV_FILE")
    if explicit:
        return Path(explicit).expanduser().resolve()
    return next(
        (p for p in (REPO_DIR / ".env", REPO_DIR.parent / ".env", APP_DIR / ".env") if p.is_file()),
        REPO_DIR / ".env",
    )


def load_environment():
    path = env_path()
    if path.is_file():
        load_dotenv(path, override=False, verbose=False)
    return path


def web_config():
    # Backwards compatibility; only public Firebase web fields can reach HTML.
    try:
        legacy = json.loads(os.getenv("FIREBASE_WEB_CONFIG") or "{}")
    except (ValueError, TypeError):
        legacy = {}
    if not isinstance(legacy, dict):
        legacy = {}
    config = {field: str(legacy[field]) for field in WEB_FIELDS.values() if legacy.get(field)}
    for name, field in WEB_FIELDS.items():
        if os.getenv(name):
            config[field] = os.environ[name]
    if not config.get("projectId") and os.getenv("FIREBASE_PROJECT_ID"):
        config["projectId"] = os.environ["FIREBASE_PROJECT_ID"]
    return config


def settings(load_file=True):
    path = load_environment() if load_file else env_path()
    local = os.getenv("LOCAL_MODE", "false").lower() == "true"
    production = os.getenv("APP_ENV", "development").lower() == "production" or bool(os.getenv("K_SERVICE"))
    return dict(
        SECRET_KEY=os.getenv("FLASK_SECRET_KEY") or os.getenv("SECRET_KEY") or secrets.token_hex(32),
        SECRET_KEY_CONFIGURED=bool(os.getenv("FLASK_SECRET_KEY") or os.getenv("SECRET_KEY")),
        ENV_FILE_PATH=path,
        FIREBASE_PROJECT_ID=os.getenv("FIREBASE_PROJECT_ID"),
        GOOGLE_APPLICATION_CREDENTIALS=os.getenv("GOOGLE_APPLICATION_CREDENTIALS"),
        LOCAL_MODE=local,
        DEMO_MODE=os.getenv("DEMO_MODE", "false").lower() == "true",
        DATA_BACKEND="sqlite" if local else "firestore",
        MAX_CONTENT_LENGTH=10 * 1024 * 1024,
        MAX_FORM_MEMORY_SIZE=10 * 1024 * 1024,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=production,
        FIREBASE_WEB_CONFIG=web_config(),
    )
