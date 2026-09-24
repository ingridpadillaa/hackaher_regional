import json
import os
import secrets

from dotenv import load_dotenv


def settings():
    load_dotenv()
    demo = os.getenv("DEMO_MODE", "true").lower() == "true"
    secret = os.getenv("SECRET_KEY")
    if demo and not secret:
        from pathlib import Path

        directory = Path(__file__).resolve().parent.parent / "instance"
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / "session.key"
        try:
            with path.open("x") as stream:
                stream.write(secrets.token_hex(32))
            path.chmod(0o600)
        except FileExistsError:
            pass
        secret = path.read_text()
    if not demo and not secret:
        raise RuntimeError("SECRET_KEY es obligatorio fuera del modo demo")
    return dict(
        SECRET_KEY=secret or secrets.token_hex(32),
        DEMO_MODE=demo,
        DATA_BACKEND=os.getenv("DATA_BACKEND", "sqlite" if demo else "firestore"),
        MAX_CONTENT_LENGTH=10 * 1024 * 1024,
        SESSION_COOKIE_NAME="local_state",
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=not demo,
        FIREBASE_WEB_CONFIG=json.loads(os.getenv("FIREBASE_WEB_CONFIG") or "{}"),
    )
