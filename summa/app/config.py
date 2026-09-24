import json
import os
import secrets

from dotenv import load_dotenv


def settings():
    load_dotenv()
    local = os.getenv("LOCAL_MODE", "false").lower() == "true"
    return dict(
        SECRET_KEY=os.getenv("FLASK_SECRET_KEY") or secrets.token_hex(32),
        LOCAL_MODE=local,
        DEMO_MODE=os.getenv("DEMO_MODE", "false").lower() == "true",
        DATA_BACKEND="sqlite" if local else "firestore",
        MAX_CONTENT_LENGTH=10 * 1024 * 1024,
        MAX_FORM_MEMORY_SIZE=10 * 1024 * 1024,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=not local,
        FIREBASE_WEB_CONFIG=json.loads(os.getenv("FIREBASE_WEB_CONFIG") or "{}"),
    )
