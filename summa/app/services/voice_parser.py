import re
from datetime import date, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field

from .categorizer import CATEGORIES, categorize, normalize
from .llm import get_llm, redact


class VoiceMovement(BaseModel):
    tipo: Literal["gasto", "ingreso", "transferencia"] = "gasto"
    monto: float | None = Field(default=None, gt=0, le=100000000)
    categoria: str = "Otros"
    descripcion: str = Field(max_length=160)
    fecha: date
    metodo_pago: Literal["efectivo", "debito", "credito", "transferencia"] | None = None
    integrante: str | None = None


class VoiceResult(BaseModel):
    movimientos: list[VoiceMovement] = Field(max_length=30)
    faltantes: list[str] = Field(default_factory=list)


def parse_voice(text, allow_ai=False, demo=False, today=None):
    today = today or datetime.now(ZoneInfo("America/Monterrey")).date()
    text = redact(text[:2000]).strip()
    if not text:
        raise ValueError("Escribe o dicta un movimiento.")
    if allow_ai and not demo:
        result = get_llm().extract(
            f"Extrae movimientos sin inventar montos. Si falta monto usa null. Hoy {today}, zona America/Monterrey. Categorías {list(CATEGORIES)}. Texto: {text}",
            VoiceResult,
        )
        return [
            dict(
                tipo=m.tipo,
                monto=m.monto,
                categoria=m.categoria if m.categoria in CATEGORIES else "Otros",
                descripcion=m.descripcion,
                fecha=m.fecha.isoformat(),
                metodoPago=m.metodo_pago or "efectivo",
            )
            for m in result.movimientos
        ]
    # Offline grammar for the demo, with missing amounts explicitly confirmed by the user.
    day = today - timedelta(days=1) if "ayer" in normalize(text) else today
    weekdays = {"lunes": 0, "martes": 1, "miercoles": 2, "jueves": 3, "viernes": 4, "sabado": 5, "domingo": 6}
    for name, number in weekdays.items():
        if name in normalize(text):
            day = today - timedelta(days=(today.weekday() - number) % 7)
    result = []
    for phrase in re.split(r"\s+y\s+(?=\d)", text, flags=re.IGNORECASE):
        normalized = normalize(phrase)
        match = re.search(r"(\d[\d,]*(?:\.\d{1,2})?)\s*(mil)?", normalized)
        amount = float(match[1].replace(",", "")) * (1000 if match[2] else 1) if match else None
        kind = "ingreso" if re.search("me cayo|recibi|ingreso|nomina|sueldo", normalized) else "gasto"
        method = (
            "debito"
            if "debito" in normalized
            else "credito"
            if "tarjeta" in normalized or "credito" in normalized
            else "efectivo"
        )
        result.append(
            dict(
                tipo=kind,
                monto=amount,
                categoria="Sueldo" if kind == "ingreso" else categorize(phrase),
                descripcion=phrase[:160],
                fecha=day.isoformat(),
                metodoPago=method,
            )
        )
    return result
