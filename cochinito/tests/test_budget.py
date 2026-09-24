from datetime import date

from app.services.budget import daily_budget


def test_credit_and_savings_not_counted_twice():
    household = dict(ingresoEstimado=1000, proximaFechaIngreso="2026-09-30", ultimaFechaIngreso="2026-09-15")
    movements = [dict(monto=200, tipo="gasto", metodoPago="credito", fecha="2026-09-20")]
    payments = [
        dict(
            id="card",
            monto=50,
            tipo="tarjeta_credito",
            proximaFecha="2026-09-28",
            datosTarjeta={"pagoSinIntereses": 200},
        ),
        dict(id="save", monto=100, tipo="ahorro", proximaFecha="2026-09-25"),
    ]
    result = daily_budget(household, movements, payments, date(2026, 9, 23))
    assert result["available"] == 700
    assert result["daily"] == 100


def test_negative_and_variable():
    household = dict(
        ingresoEstimado=100,
        ingresoVariable=True,
        proximaFechaIngreso="2026-09-30",
        ultimaFechaIngreso="2026-09-15",
    )
    result = daily_budget(
        household,
        [dict(monto=200, tipo="gasto", metodoPago="efectivo", fecha="2026-09-20")],
        [],
        date(2026, 9, 23),
    )
    assert result["daily"] == 0 and result["available"] == -110


def test_dashboard(logged):
    assert "Hoy puedes gastar" in logged.get("/").text


def test_record_payment_is_idempotent_and_atomic(app):
    from app.services.fixed_payments import record_payment
    from scripts.seed_demo import seed_household

    repository = app.extensions["repo"]
    household = seed_household(repository, "payments")
    path = f"hogares/{household}"
    payment = next(p for p in repository.list(path + "/pagosFijos") if p["tipo"] == "ahorro")
    before = repository.get(path)["fondoEmergencia"]
    assert record_payment(repository, household, "payments", payment["id"], payment["proximaFecha"])
    assert not record_payment(repository, household, "payments", payment["id"], payment["proximaFecha"])
    assert repository.get(path)["fondoEmergencia"] == before + payment["monto"]
