import os

from flask import Blueprint, abort, g, request

from app.auth import login_required
from app.mandado import shopping_data
from app.services.categorizer import normalize
from app.services.firestore_repo import repo, visible_movements
from app.services.llm import redact

from .tools import TOOL_NAMES, ToolArgs, execute, render_fact

bp = Blueprint("copiloto", __name__, url_prefix="/copiloto")


def choose_tools(message):
    text = normalize(message)
    if "clases" in text or "temporada" in text:
        return [("proxima_temporada", {}), ("hoy_puedo_gastar", {})]
    if "dinero" in text or "gaste" in text or "gastos" in text:
        return [("obtener_resumen", {})]
    if "mandado" in text or "super" in text:
        return [("lista_mandado", {})]
    if "pago" in text or "venc" in text:
        return [("proximos_pagos", {})]
    if "prestamo" in text or "credito" in text:
        return []
    return [("hoy_puedo_gastar", {})]


def gemini_calls(message):
    from google import genai
    from google.genai import types

    specs = {
        "obtener_resumen": {"periodo": {"type": "STRING", "enum": ["semana", "quincena", "mes"]}},
        "gastos_por_categoria": {
            "categoria": {"type": "STRING"},
            "periodo": {"type": "STRING", "enum": ["semana", "quincena", "mes"]},
        },
        "hoy_puedo_gastar": {},
        "proximos_pagos": {"dias": {"type": "INTEGER"}},
        "simular_compra_a_meses": {
            "monto": {"type": "NUMBER"},
            "meses": {"type": "INTEGER"},
            "tasa_anual": {"type": "NUMBER"},
        },
        "costo_real_credito": {
            "monto": {"type": "NUMBER"},
            "pago": {"type": "NUMBER"},
            "numero_pagos": {"type": "INTEGER"},
            "periodicidad": {"type": "STRING", "enum": ["semanal", "quincenal", "mensual"]},
        },
        "lista_mandado": {"presupuesto": {"type": "NUMBER"}},
        "proxima_temporada": {},
    }
    specs.update(
        {
            name: {}
            for name in (
                "resumen_periodo",
                "presupuesto_vs_real",
                "estado_meta",
                "estado_racha",
                "comparar_carrito",
                "sugerencias_mandado",
            )
        }
    )
    specs["navegar"] = {
        "ruta": {
            "type": "STRING",
            "enum": [
                "/",
                "/movimientos",
                "/mandado",
                "/movimientos/reportes",
                "/perfil/personalizacion",
                "/calendario",
            ],
        }
    }
    declarations = [
        types.FunctionDeclaration(
            name=name,
            description=name.replace("_", " "),
            parameters=types.Schema(type="OBJECT", properties=props),
        )
        for name, props in specs.items()
    ]
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"], http_options=types.HttpOptions(timeout=8000))
    # Model selects read-only functions. All displayed figures are rendered by Python,
    # so generated prose cannot fabricate financial values.
    response = client.models.generate_content(
        model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
        contents=message,
        config=types.GenerateContentConfig(
            system_instruction="Selecciona herramientas para responder en español. No inventes parámetros faltantes. No pidas contraseñas ni recomiendes productos de inversión. No tienes identidad ni cuentas del usuario.",
            tools=[types.Tool(function_declarations=declarations)],
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            temperature=0,
        ),
    )
    calls = []
    for call in (response.function_calls or [])[:3]:
        if call.name in TOOL_NAMES:
            args = dict(call.args or {})
            ToolArgs.model_validate(args)
            calls.append((call.name, args))
    return calls


@bp.post("/chat")
@login_required
def chat():
    payload = request.get_json(silent=True) or {}
    message = payload.get("message", "")
    if not isinstance(message, str) or not 0 < len(message) <= 500:
        abort(400)
    message = redact(message.replace(g.user.get("nombre", ""), "[persona]"))
    base = f"hogares/{g.hogar_id}"
    context = dict(
        household=repo().get(base),
        movements=visible_movements(g.hogar_id, g.user["uid"]),
        payments=repo().list(base + "/pagosFijos"),
        events=repo().list("eventosTemporada"),
        shopping=shopping_data(g.hogar_id),
        school="clases" in normalize(message),
    )
    context["goal"] = repo().get(base + "/metas/motivacion")
    context["streak"] = repo().get(base + "/racha/estado")
    if any(word in normalize(message) for word in ("llevame", "abrir", "ir a", "ver mi")):
        destinations = {
            "mandado": "/mandado",
            "reporte": "/movimientos/reportes",
            "movimiento": "/movimientos",
            "perfil": "/perfil/personalizacion",
            "calendario": "/calendario",
            "inicio": "/",
        }
        route = next((route for word, route in destinations.items() if word in normalize(message)), None)
        if route:
            return {
                "answer": "Abre la pantalla con este botón.",
                "mode": "navegacion",
                "tools": ["navegar"],
                "actions": [{"ruta": route, "label": "Abrir pantalla"}],
            }
    unavailable = {
        "answer": "Jami no está disponible en este momento. Puedes consultar tus cifras en Inicio y Reportes o registrar un gasto manual.",
        "mode": "unavailable",
        "tools": [],
    }
    if not os.getenv("GEMINI_API_KEY") or not g.user.get("consentimientos", {}).get("iaDatos"):
        return unavailable
    try:
        calls = gemini_calls(message)
        mode = "gemini"
    except Exception:
        return unavailable
    if not calls:
        return {
            "answer": "Para comparar el préstamo necesito el monto que recibirías, cuánto pagarías cada vez, la periodicidad y el número de pagos. También considera comisiones y seguros.",
            "mode": mode,
            "tools": [],
        }
    actions = []
    facts = []
    used = []
    for name, args in calls:
        try:
            result = execute(name, args, context)
            facts.append(render_fact(name, result))
            if name == "navegar":
                actions.append({"ruta": result["ruta"], "label": "Abrir pantalla"})
            used.append(name)
        except ValueError:
            facts.append("Faltan datos válidos para ese cálculo.")
    return {"answer": "\n\n".join(facts), "mode": mode, "tools": used, "actions": actions}


@bp.post("/simular")
@login_required
def simulate():
    payload = request.get_json(silent=True) or {}
    name = payload.get("tool")
    if name not in ("simular_compra_a_meses", "costo_real_credito"):
        abort(400)
    try:
        result = execute(name, payload.get("args", {}), dict(household={}, movements=[], payments=[]))
        return {"answer": render_fact(name, result), "result": result}
    except ValueError:
        abort(400)
