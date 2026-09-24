import io
from datetime import date, timedelta

import pytest
from PIL import Image

from app.services.budget import daily_budget
from app.services.clock import local_today
from app.services.comparison import buy_url, compare, haversine
from app.services.demo_seed import seed_demo
from app.services.donations import eligible
from app.services.notifications import notify
from app.services.planning import build_plan
from app.services.products import product_id, suggestions, update_products
from app.services.reports import report
from app.services.streaks import evaluate, snapshot
from tests.conftest import csrf


def test_combined_salary_calendar():
    home = dict(
        ingresoEstimado=0,
        calendarioIngresos=[
            dict(id="a", ingreso=6000, periodicidadIngreso="quincenal", proximaFechaIngreso="2026-09-30"),
            dict(id="b", ingreso=2000, periodicidadIngreso="semanal", proximaFechaIngreso="2026-09-25"),
        ],
    )
    result = daily_budget(home, [], [], date(2026, 9, 23))
    assert result["start"] == "2026-09-18"
    assert result["end"] == "2026-09-25"
    assert result["income"] == 2000
    assert result["daily"] == 1000


def test_budget_saving_and_fixed_minimum():
    home = dict(ingresoMensualTotal=20000, tipoHogar="familia_con_hijos_escolares")
    payments = [dict(monto=8000, periodicidad="mensual", categoria="Vivienda")]
    result = build_plan(home, payments, [])
    assert result["porCategoria"]["Vivienda"] >= 8000
    assert 1000 <= result["ahorroSugerido"] <= 4000
    assert abs(sum(result["porCategoria"].values()) + result["ahorroSugerido"] - 20000) < 0.1


def test_report_thresholds():
    day = local_today()
    m = dict(fecha=(day - timedelta(days=5)).isoformat(), tipo="gasto", monto=100, categoria="Hogar")
    assert report([m], [], "mes")["projection"] is None
    m["fecha"] = (day - timedelta(days=30)).isoformat()
    assert report([m], [], "mes")["projection"] is not None


def test_cart_comparison_coverage_distance_and_quantity():
    home = dict(municipio="Prueba", ubicacion={"lat": 25.0, "lng": -100.0})
    items = [
        dict(productoId=product_id(f"Producto {i}"), nombre=f"Producto {i}", cantidad=2) for i in range(4)
    ]
    prices = [
        dict(
            producto=f"Producto {i}",
            tienda="Sucursal de prueba",
            cadena="Ensayo",
            municipio="Prueba",
            lat=25.0,
            lng=-100.0,
            precio=10,
            fecha="2026-09-20",
            fuente="profeco",
        )
        for i in range(4)
    ]
    assert compare(home, items, prices)[0]["total"] == 80
    # Missing one item can only be estimated when another local store has its price.
    prices[-1]["tienda"] = "Otra sucursal"
    result = compare(home, items, prices)
    assert len(result) == 1 and result[0]["coverage"] == 0.75 and result[0]["estimated"]
    prices[0]["lat"] = 0
    assert not compare(home, items, prices)
    assert haversine(home["ubicacion"], home["ubicacion"]) == 0


def test_real_config_search_link_is_allowlisted():
    link = buy_url("chedraui", [dict(productoId="prueba", nombre="texto & otra cosa", cantidad=1)])
    assert link.startswith("https://www.chedraui.com.mx/") and "%26" in link
    assert buy_url("sitio no configurado", []) is None


def test_product_prediction_two_purchases_and_modal_quantity(app):
    repository = app.extensions["repo"]
    today = local_today()
    for i, days in enumerate((14, 7, 0)):
        repository.put(
            f"hogares/h/tickets/{i}",
            dict(
                tienda="Tienda capturada",
                fecha=(today - timedelta(days=days)).isoformat(),
                productos=[
                    dict(nombreNormalizado="Producto capturado", cantidad=2 if i < 2 else 3, precio=50)
                ],
            ),
        )
    products = update_products(repository, "h")
    assert products[0]["intervaloPromedioDias"] == 7
    assert products[0]["cantidadHabitual"] == 2
    assert not suggestions(products)


def test_streak_never_fills_unknown_days(app):
    repository = app.extensions["repo"]
    repository.put(
        "hogares/h",
        dict(ingresoEstimado=1000, proximaFechaIngreso="2026-10-01", periodicidadIngreso="mensual"),
    )
    repository.put(
        "hogares/h/racha/estado", dict(diasActuales=5, ultimoDiaEvaluado="2026-09-20", historial=[])
    )
    state = evaluate(repository, "h", date(2026, 9, 23))
    assert state["diasActuales"] == 0
    assert not state["historial"][-1]["cumplido"]
    assert evaluate(repository, "h", date(2026, 9, 23)) == state


def test_streak_confirmed_day_and_wildcard(app):
    repository = app.extensions["repo"]
    repository.put(
        "hogares/h",
        dict(ingresoEstimado=1000, proximaFechaIngreso="2026-10-01", periodicidadIngreso="mensual"),
    )
    snapshot(repository, "h", date(2026, 9, 22))
    path = "hogares/h/evidenciaRacha/2026-09-22"
    repository.put(path, dict(repository.get(path), confirmado=True))
    state = evaluate(repository, "h", date(2026, 9, 23))
    assert state["diasActuales"] == 1
    repository.put("hogares/h/evidenciaRacha/2026-09-23", dict(disponible=0, confirmado=True))
    repository.put(
        "hogares/h/movimientos/m",
        dict(fecha="2026-09-23", monto=10, tipo="gasto", categoria="Entretenimiento"),
    )
    state = evaluate(repository, "h", date(2026, 9, 24))
    assert state["diasActuales"] == 1 and state["comodinesDisponibles"] == 0


def test_notifications_capped_and_donation_suppressed(app, monkeypatch):
    repository = app.extensions["repo"]
    for i in range(5):
        notify(repository, "h", "presupuesto", str(i), "Alerta")
    assert len(repository.list("hogares/h/notificaciones")) == 3
    monkeypatch.setenv("DONATION_URL", "https://example.org/apoyar")
    repository.put("hogares/h/racha/estado", {"diasActuales": 7})
    assert not eligible(repository, "h", {})


def test_seed_never_modifies_real_household(app):
    repository = app.extensions["repo"]
    uid, hid = seed_demo(repository, "ensayo@example.org")
    assert repository.get(f"hogares/{hid}")["esDemo"]
    assert not repository.list("precios")
    assert seed_demo(repository, "ensayo@example.org") == (uid, hid)
    repository.put(f"hogares/{hid}", {"esDemo": False})
    with pytest.raises(ValueError, match="hogar real"):
        seed_demo(repository, "ensayo@example.org", reset=True)


def test_memory_upload_and_ticket_confirmation(logged, monkeypatch):
    from app import movimientos
    from tests.demo_receipt import demo_receipt

    monkeypatch.setattr(movimientos, "analyze_image", lambda *args: demo_receipt())
    token = csrf(logged, "/movimientos/nuevo?metodo=ticket")
    logged.post("/perfil/consentimientos", data={"csrf_token": token, "ai": "1"})
    content = io.BytesIO()
    Image.new("RGB", (2, 2)).save(content, format="PNG")
    content.seek(0)
    response = logged.post(
        "/movimientos/importar/ticket",
        data={"csrf_token": token, "redacted": "1", "file": (content, "ticket.png")},
    )
    assert "/confirmar/" in response.location
    response = logged.post(
        response.location,
        data={
            "csrf_token": token,
            "amount_0": "107",
            "category_0": "Hogar",
            "date_0": local_today().isoformat(),
            "method_0": "debito",
        },
    )
    assert response.status_code == 302
    data = logged.get("/perfil/exportar").json
    assert any(m["origen"] == "ticket" and m["categoria"] == "Hogar" for m in data["movimientos"])
    with logged.application.test_request_context("/"):
        stream = logged.application.request_class.from_values()._get_file_stream(1000000, "image/png")
        assert isinstance(stream, io.BytesIO)


def test_all_cli_commands_registered(app):
    commands = app.cli.list_commands(None)
    assert {
        "seed-demo",
        "profeco-sync",
        "sync-banks",
        "provider-health",
        "daily-alerts",
        "evaluar-rachas",
        "generar-recomendaciones",
    } <= set(commands)
    assert app.test_cli_runner().invoke(args=["seed-demo", "--email", "ensayo@example.org"]).exit_code != 0


def test_full_new_household_route_smoke(client, app):
    client.post("/auth/demo", data={"name": "Persona prueba", "csrf_token": csrf(client)})
    next_day = (local_today() + timedelta(days=7)).isoformat()
    response = client.post(
        "/onboarding",
        data={
            "csrf_token": csrf(client, "/onboarding"),
            "privacy": "1",
            "nombre": "Hogar capturado",
            "estado": "Estado",
            "municipio": "Municipio",
            "member_0_nombre": "Persona prueba",
            "member_0_edad": "30",
            "member_0_ingreso": "1000",
            "member_0_periodicidadIngreso": "semanal",
            "member_0_proximaFechaIngreso": next_day,
            "payment_0_nombre": "Pago capturado",
            "payment_0_monto": "100",
            "payment_0_fecha": next_day,
            "goal_name": "Meta capturada",
            "goal_amount": "500",
            "goal_date": next_day,
        },
    )
    assert response.location == "/"
    for route in (
        "/",
        "/perfil",
        "/perfil/personalizacion",
        "/perfil/personalizacion/pagos",
        "/movimientos",
        "/movimientos/nuevo?metodo=manual",
        "/movimientos/nuevo?metodo=ticket",
        "/movimientos/nuevo?metodo=foto",
        "/movimientos/nuevo?metodo=pdf",
        "/movimientos/nuevo?metodo=voz",
        "/movimientos/reportes",
        "/mandado",
        "/notificaciones",
        "/calendario",
        "/api/inicio/desglose",
        "/perfil/exportar",
    ):
        assert client.get(route).status_code == 200, route
    token = csrf(client, "/perfil")
    assert (
        client.post("/perfil/borrar", data={"csrf_token": token, "confirmation": "BORRAR"}).status_code == 302
    )
    assert not app.extensions["repo"].list("hogares")
