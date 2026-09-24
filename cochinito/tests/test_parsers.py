from datetime import date

from conftest import csrf

from app.services.llm import redact
from app.services.voice_parser import parse_voice


def test_voice_examples():
    day = date(2026, 9, 23)
    assert parse_voice("ayer gasté 150 en gasolina", today=day)[0]["fecha"] == "2026-09-22"
    assert [m["monto"] for m in parse_voice("85 de tacos y 40 del camión")] == [85, 40]
    assert parse_voice("me cayó la quincena, 6 mil")[0]["monto"] == 6000
    assert parse_voice("compré tacos")[0]["monto"] is None


def test_pdf_demo_and_receipt(logged):
    token = csrf(logged, "/movimientos")
    for kind in ("pdf", "recibo"):
        response = logged.post("/movimientos/importar/" + kind, data={"csrf_token": token, "example": "1"})
        assert response.status_code == 302
        assert logged.get(response.location).status_code == 200


def test_redaction():
    result = redact(
        "Titular: Persona Privada\nCuenta 1234567890123456\nmail@example.com\n2026-09-01 Tacos -85.00"
    )
    assert "Persona Privada" not in result
    assert "1234567890123456" not in result
    assert "mail@example.com" not in result
    assert "Tacos" in result
