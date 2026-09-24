"""Startup diagnostics: missing services never create synthetic data."""
import os
import sqlite3
from pathlib import Path


def check(app):
    issues = []
    if not app.config.get("TESTING"):
        for key in ("FLASK_SECRET_KEY", "GEMINI_API_KEY", "ENCRYPTION_KEY"):
            if not os.getenv(key):
                issues.append(f"Falta la variable {key} en .env")
        if not app.config.get("LOCAL_MODE"):
            if not os.getenv("FIREBASE_PROJECT_ID"):
                issues.append("Falta la variable FIREBASE_PROJECT_ID en .env")
            if not app.config.get("FIREBASE_WEB_CONFIG"):
                issues.append("Falta FIREBASE_WEB_CONFIG (apiKey, authDomain, projectId, appId)")
    repository = app.extensions.get("repo")
    connected = False
    if repository:
        try:
            if repository.remote:
                repository.db.document("diagnostico/conexion").get(timeout=5)
            connected = True
        except Exception:
            issues.append("No se pudo leer Firestore. Revisa credenciales ADC y permisos.")
    else:
        issues.append("Firestore no está disponible: configura GOOGLE_APPLICATION_CREDENTIALS o ADC.")
    path = Path(app.root_path).parent / "data/precios.db"
    latest = None
    if path.exists():
        try:
            with sqlite3.connect(path) as db:
                latest = db.execute("SELECT fecha FROM profeco_meta ORDER BY fecha DESC LIMIT 1").fetchone()
        except sqlite3.Error:
            issues.append("La base de PROFECO necesita una carga válida.")
    else:
        issues.append("No hay precios PROFECO. Ejecuta flask profeco-sync --file RUTA.")
    app.extensions["health"] = dict(ready=connected, local=app.config.get("LOCAL_MODE", False), issues=issues, profeco=latest)
    for issue in issues:
        app.logger.warning(issue)
    return app.extensions["health"]
