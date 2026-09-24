"""Shared model selection, timeouts and safe startup diagnostics."""

import os
import re

UNAVAILABLE = "Jami no está disponible en este momento. Puedes capturar a mano."


def client(vision=False):
    import logging

    for name in ("httpx", "httpcore", "google.genai"):
        logging.getLogger(name).setLevel(logging.WARNING)
    from google import genai
    from google.genai import types

    if not os.getenv("GEMINI_API_KEY"):
        raise ValueError(UNAVAILABLE)
    return genai.Client(
        api_key=os.environ["GEMINI_API_KEY"],
        http_options=types.HttpOptions(
            timeout=30000 if vision else 15000, retry_options=types.HttpRetryOptions(attempts=1)
        ),
    )


def model_name():
    value = os.getenv("GEMINI_MODEL", "").removeprefix("models/").strip()
    if not value:
        raise ValueError("Falta GEMINI_MODEL en .env. " + UNAVAILABLE)
    return value


def inspect_models():
    if not os.getenv("GEMINI_API_KEY"):
        return dict(ok=False, models=[], message="Falta GEMINI_API_KEY en .env. " + UNAVAILABLE)
    try:
        with client() as api:
            models = sorted(
                {
                    m.name.removeprefix("models/")
                    for m in api.models.list()
                    if m.name
                    and re.fullmatch(r"models/[A-Za-z0-9._-]+", m.name)
                    and "generateContent" in (m.supported_actions or [])
                }
            )
        chosen = os.getenv("GEMINI_MODEL", "").removeprefix("models/").strip()
        if not chosen or chosen not in models:
            return dict(
                ok=False,
                models=models,
                message="GEMINI_MODEL falta o no está disponible para generateContent. Modelos disponibles: "
                + (", ".join(models) or "ninguno")
                + ". "
                + UNAVAILABLE,
            )
        return dict(ok=True, models=models, message="Gemini: modelo configurado disponible.")
    except Exception:
        return dict(
            ok=False,
            models=[],
            message="No se pudo listar modelos de Gemini. Revisa llave, permisos y conexión. " + UNAVAILABLE,
        )
