import io
from datetime import date

from pydantic import BaseModel, Field

from .categorizer import categorize, is_card_payment
from .llm import get_llm, redact


class StatementLine(BaseModel):
    fecha: date
    descripcion: str = Field(max_length=160)
    monto: float = Field(ge=-100000000, le=100000000)
    referencia: str = ""


class Statement(BaseModel):
    movimientos: list[StatementLine] = Field(max_length=500)


def parse_pdf(content):
    import pdfplumber

    if not content.startswith(b"%PDF"):
        raise ValueError("El archivo no es un PDF válido.")
    result = []
    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            if len(pdf.pages) > 20:
                raise ValueError("Para el prototipo usa un PDF de hasta 20 páginas.")
            for page in pdf.pages:
                text = redact(page.extract_text() or "")
                if not text.strip():
                    continue
                parsed = get_llm().extract(
                    "Extrae solo movimientos. Monto negativo para egresos y positivo para ingresos; no incluyas saldos ni totales. No extraigas identidad. Texto:\n"
                    + text,
                    Statement,
                )
                for m in parsed.movimientos:
                    if m.monto == 0:
                        continue
                    result.append(
                        dict(
                            fecha=m.fecha.isoformat(),
                            descripcion=m.descripcion,
                            monto=abs(m.monto),
                            tipo="transferencia"
                            if is_card_payment(m.descripcion)
                            else "ingreso"
                            if m.monto > 0
                            else "gasto",
                            categoria=categorize(m.descripcion),
                            metodoPago="debito",
                        )
                    )
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(
            "No pudimos procesar el PDF. Prueba uno con texto seleccionable o captura manual."
        ) from exc
    return result

