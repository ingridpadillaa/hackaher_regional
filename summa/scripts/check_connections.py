"""Safe live checks. Never prints .env values, SDK responses or exception bodies."""

import logging
import os
import sqlite3
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import dotenv_values

from app.config import APP_DIR, REQUIRED_ENV, REQUIRED_WEB, WEB_FIELDS, env_path, settings
from app.services.firebase_admin_client import initialize
from app.services.gemini_connection import client, inspect_models, model_name


def emit(ok, label, detail=""):
    print(("OK" if ok else "FALLA") + " · " + label + (" · " + detail if detail else ""))
    return ok


def compare_env(path):
    expected = dotenv_values(APP_DIR / ".env.example", interpolate=False)
    if not path.is_file():
        emit(
            False,
            "Archivo .env",
            "No se encontró. Indica su ruta con ENV_FILE; no pegues claves en la terminal.",
        )
        return
    actual = dotenv_values(path, interpolate=False)
    emit(True, "Archivo .env", "Se leyó sin mostrar valores.")
    print(
        "Variables no declaradas respecto a .env.example (incluye opcionales): "
        + (", ".join(sorted(set(expected) - set(actual))) or "ninguna")
    )
    print(
        "Variables adicionales respecto a .env.example: "
        + (", ".join(sorted(set(actual) - set(expected))) or "ninguna")
    )
    print(
        "Variables declaradas sin valor: "
        + (", ".join(sorted(k for k, v in actual.items() if not v)) or "ninguna")
    )


def firestore_probe(admin_app):
    from firebase_admin import firestore

    db = firestore.client(app=admin_app)
    doc = db.document("_healthcheck/prueba")
    marker = uuid.uuid4().hex
    created = False
    success = True
    try:
        # create() refuses an existing document; never overwrite real data.
        doc.create({"probe": marker}, timeout=15, retry=None)
        created = True
        emit(True, "Firestore: escribir _healthcheck/prueba")
        saved = doc.get(timeout=15, retry=None)
        success = emit(
            saved.exists and saved.to_dict() == {"probe": marker}, "Firestore: leer _healthcheck/prueba"
        )
    except Exception:
        emit(
            False,
            "Firestore: escribir/leer",
            "Revisa IAM, base predeterminada y red. Si el documento ya existe, se conserva intacto.",
        )
        success = False
    finally:
        if created:
            try:
                saved = doc.get(timeout=15, retry=None)
                if saved.exists and saved.to_dict() == {"probe": marker}:
                    # Optimistic precondition protects another writer after this read.
                    doc.delete(
                        option=db.write_option(last_update_time=saved.update_time), timeout=15, retry=None
                    )
                    emit(True, "Firestore: borrar _healthcheck/prueba")
                else:
                    emit(
                        False,
                        "Firestore: borrar",
                        "El documento cambió; se conservó para evitar borrar datos ajenos.",
                    )
                    success = False
            except Exception:
                emit(
                    False,
                    "Firestore: borrar",
                    "No se pudo limpiar el documento de prueba; revisa permisos y conexión.",
                )
                success = False
    return success


def main():
    # Libraries may log URLs or payloads when DEBUG is enabled externally.
    logging.disable(logging.CRITICAL)
    config = settings()
    compare_env(env_path())
    missing = [
        key
        for key in REQUIRED_ENV
        if not os.getenv(key) and not (key == "FLASK_SECRET_KEY" and os.getenv("SECRET_KEY"))
    ]
    for field in REQUIRED_WEB:
        if not config["FIREBASE_WEB_CONFIG"].get(field):
            missing.append(next(key for key, value in WEB_FIELDS.items() if value == field))
    ok = emit(
        not missing,
        "Variables obligatorias",
        "Faltan: " + ", ".join(missing) if missing else "Presentes; valores ocultos.",
    )
    admin = None
    try:
        admin = initialize(config)
        emit(True, "Firebase Admin", "Archivo de credenciales o ADC inicializado.")
    except Exception:
        emit(False, "Firebase Admin", "Revisa FIREBASE_PROJECT_ID y GOOGLE_APPLICATION_CREDENTIALS o ADC.")
        ok = False
    if admin:
        ok = firestore_probe(admin) and ok
        try:
            from firebase_admin import auth

            next(auth.list_users(max_results=1, app=admin).iterate_all(), None)
            emit(
                True,
                "Firebase Auth: listar un usuario",
                "Permisos de lectura verificados; no se imprimen datos personales.",
            )
        except Exception:
            emit(
                False, "Firebase Auth: listar un usuario", "Revisa permisos IAM, API de Authentication y red."
            )
            ok = False
    else:
        emit(False, "Firestore: escribir/leer/borrar", "Sin Admin SDK disponible; no se intentó.")
        emit(False, "Firebase Auth: listar un usuario", "Sin Admin SDK disponible; no se intentó.")
    status = inspect_models()
    ok = emit(status["ok"], "Gemini: modelo disponible", status["message"]) and ok
    if status["ok"]:
        try:
            from google.genai import types

            with client() as api:
                response = api.models.generate_content(
                    model=model_name(),
                    contents="responde OK",
                    config=types.GenerateContentConfig(temperature=0, max_output_tokens=128),
                )
            # Do not print model content: even diagnostics never echo unknown responses.
            ok = (
                emit(
                    (response.text or "").strip().strip(".").upper() == "OK",
                    "Gemini: llamada de texto mínima",
                    "Respuesta comprobada sin imprimirla.",
                )
                and ok
            )
        except Exception:
            emit(
                False, "Gemini: llamada de texto mínima", "Revisa la llave, modelo, cuota, facturación y red."
            )
            ok = False
    else:
        emit(
            False,
            "Gemini: llamada de texto mínima",
            "No se intentó porque el modelo no está configurado/disponible.",
        )
    path = APP_DIR / "data/precios.db"
    if not path.is_file():
        print("AVISO · SQLite PROFECO · No existe data/precios.db; no impide usar la app.")
    else:
        try:
            with sqlite3.connect(f"file:{path}?mode=ro", uri=True) as db:
                row = db.execute("SELECT fecha FROM profeco_meta ORDER BY fecha DESC LIMIT 1").fetchone()
            # Print only a validated date, never arbitrary database contents.
            from datetime import datetime

            latest = datetime.fromisoformat(row[0]).isoformat() if row else "sin cargas"
            emit(True, "SQLite PROFECO", "Última carga: " + latest)
        except Exception:
            print(
                "AVISO · SQLite PROFECO · No se pudo consultar la última carga; conserva el resto de la app."
            )
    return 0 if ok else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        emit(
            False,
            "Verificación",
            "Error de configuración o dependencia; no se muestran detalles que pudieran contener secretos.",
        )
        sys.exit(1)
