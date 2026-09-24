"""Safe startup diagnostics. Optional AI failure never disables manual capture."""

import os
import sqlite3

from .config import REQUIRED_WEB


def check(app):
    issues = []
    core_ok = True
    testing = app.config.get("TESTING")
    if not testing:
        for key in ("FLASK_SECRET_KEY", "GEMINI_API_KEY", "GEMINI_MODEL", "ENCRYPTION_KEY"):
            present = app.config.get("SECRET_KEY_CONFIGURED") if key == "FLASK_SECRET_KEY" else os.getenv(key)
            if not present:
                issues.append(f"Falta la variable {key} en .env")
        if not app.config.get("LOCAL_MODE"):
            if not app.config.get("SECRET_KEY_CONFIGURED"):
                core_ok = False
            if not app.config.get("FIREBASE_PROJECT_ID"):
                issues.append("Falta FIREBASE_PROJECT_ID en .env")
                core_ok = False
            config = app.config.get("FIREBASE_WEB_CONFIG", {})
            for key in REQUIRED_WEB:
                if not config.get(key):
                    issues.append("Falta configurar Firebase Web: " + key)
                    core_ok = False
            if config.get("projectId") and config["projectId"] != app.config.get("FIREBASE_PROJECT_ID"):
                issues.append("Los proyectos de Firebase Web y Firebase Admin no coinciden.")
                core_ok = False
    repository = app.extensions.get("repo")
    connected = False
    if repository:
        try:
            if repository.remote:
                repository.db.document("diagnostico/conexion").get(timeout=5, retry=None)
            connected = True
        except Exception:
            issues.append(
                "No se pudo leer Firestore. Revisa credenciales ADC, permisos y la base de datos predeterminada."
            )
    else:
        issues.append("Firestore no está disponible: configura GOOGLE_APPLICATION_CREDENTIALS o ADC.")
    from .services.price_db import database_path

    path = database_path(repository)
    latest = None
    if path.exists():
        try:
            with sqlite3.connect(f"file:{path}?mode=ro", uri=True) as db:
                latest = db.execute("SELECT fecha FROM profeco_meta ORDER BY fecha DESC LIMIT 1").fetchone()
        except sqlite3.Error:
            issues.append("La base de PROFECO necesita una carga válida.")
    else:
        issues.append("No hay precios PROFECO. Ejecuta flask profeco-sync --file RUTA.")
    providers = {}
    if connected:
        try:
            providers = {
                name: repository.get("estadoProveedores/" + name) or {"estado": "sin configurar"}
                for name in ("syncfy", "finerio", "simulated")
            }
        except Exception:
            issues.append("No se pudo leer el estado de proveedores.")
    if not testing:
        from .services.gemini_connection import inspect_models

        status = inspect_models()
        app.extensions["gemini_status"] = status
        if not status["ok"]:
            issues.append(status["message"])
    app.extensions["health"] = dict(
        ready=connected and core_ok,
        local=app.config.get("LOCAL_MODE", False),
        issues=issues,
        profeco=latest,
        providers=providers,
        gemini=app.extensions.get("gemini_status", {}),
    )
    for issue in issues:
        app.logger.warning(issue)
    return app.extensions["health"]
