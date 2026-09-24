"""One Admin SDK initialization per process, using a file or environment ADC."""

from pathlib import Path
from threading import Lock

_lock = Lock()


def initialize(config):
    import firebase_admin
    from firebase_admin import credentials

    project = config.get("FIREBASE_PROJECT_ID")
    if not project:
        raise ValueError("Falta FIREBASE_PROJECT_ID en .env.")
    with _lock:
        try:
            existing = firebase_admin.get_app()
        except ValueError:
            existing = None
        if existing is not None:
            if existing.project_id != project:
                raise ValueError("Firebase ya está inicializado para otro proyecto; reinicia el proceso.")
            return existing
        path = config.get("GOOGLE_APPLICATION_CREDENTIALS")
        try:
            if path:
                path = Path(path).expanduser()
                if not path.is_absolute():
                    path = Path(config["ENV_FILE_PATH"]).parent / path
                credential = credentials.Certificate(str(path))
                if credential.project_id != project:
                    raise ValueError("El proyecto del archivo de credenciales no coincide.")
            else:
                credential = credentials.ApplicationDefault()
            return firebase_admin.initialize_app(
                credential, options={"projectId": project, "httpTimeout": 15}
            )
        except Exception:
            # Provider exceptions can contain private keys or file content; never forward them.
            raise ValueError(
                "No se pudo inicializar Firebase Admin. Revisa el archivo de credenciales o ADC, sus permisos y FIREBASE_PROJECT_ID."
            ) from None
