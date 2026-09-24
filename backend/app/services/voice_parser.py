from datetime import date, datetime
from typing import Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field

from .categorizer import CATEGORIES
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
    if not allow_ai:
        raise ValueError("Activa el consentimiento de IA en Perfil o usa captura manual.")
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
