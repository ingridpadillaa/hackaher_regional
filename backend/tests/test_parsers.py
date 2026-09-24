from app.services.llm import redact
from app.services.voice_parser import parse_voice
from tests.conftest import csrf


def test_voice_unavailable_never_invents(monkeypatch):
    import pytest

    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    with pytest.raises(ValueError, match="Jami no está disponible"):
        parse_voice("ayer gasté 150 en gasolina", allow_ai=True)


def test_pdf_demo_and_receipt(logged):
    token = csrf(logged, "/movimientos")
    for kind in ("pdf", "recibo"):
        response = logged.post("/movimientos/importar/" + kind, data={"csrf_token": token, "example": "1"})
        assert response.status_code == 302
        assert logged.get(response.location, follow_redirects=True).status_code == 200


def test_redaction():
    result = redact(
        "Titular: Persona Privada\nCuenta 1234567890123456\nmail@example.com\n2026-09-01 Tacos -85.00"
    )
    assert "Persona Privada" not in result
    assert "1234567890123456" not in result
    assert "mail@example.com" not in result
    assert "Tacos" in result
