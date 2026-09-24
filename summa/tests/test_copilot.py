from app.copiloto.tools import execute
from tests.conftest import csrf


def test_math_tools():
    context = dict(household={}, movements=[], payments=[])
    assert (
        execute("simular_compra_a_meses", dict(monto=1200, meses=12, tasa_anual=0), context)["mensualidad"]
        == 100
    )
    assert execute("costo_real_credito", dict(monto=1000, pago=120, numero_pagos=10), context)["costo"] == 200


def test_grounded_copilot(logged):
    token = csrf(logged, "/")
    response = logged.post(
        "/copiloto/chat",
        json={"message": "¿Me alcanza para el regreso a clases?"},
        headers={"X-CSRF-Token": token},
    )
    assert response.status_code == 200
    assert response.json["tools"] == ["proxima_temporada", "hoy_puedo_gastar"]
    assert "Regreso a clases" in response.json["answer"]


def test_credit_requires_actual_terms():
    import pytest

    with pytest.raises(ValueError):
        execute("costo_real_credito", {}, dict(household={}, movements=[], payments=[]))
