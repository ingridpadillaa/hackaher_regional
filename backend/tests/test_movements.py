from datetime import date

from app.services.movements import save_movement
from tests.conftest import csrf


def test_manual_and_ticket_confirmation(logged):
    token = csrf(logged, "/movimientos/nuevo")
    response = logged.post(
        "/movimientos/nuevo",
        data=dict(
            csrf_token=token,
            monto="85",
            tipo="gasto",
            categoria="Comida fuera",
            fecha=date.today().isoformat(),
            metodoPago="efectivo",
            descripcion="Tacos prueba",
        ),
        follow_redirects=True,
    )
    assert "Tacos prueba" in response.text
    response = logged.post("/movimientos/importar/foto", data={"csrf_token": token, "example": "1"})
    assert response.location == "/movimientos/importar/foto"
    assert not logged.application.extensions["repo"].list("hogares/regression-user/borradores")


def test_dedup_is_atomic(app):
    repository = app.extensions["repo"]
    movement = dict(
        monto=100,
        fecha=date.today().isoformat(),
        descripcion="Pago TDC",
        categoria="Créditos",
        metodoPago="debito",
    )
    assert save_movement(repository, "a", "u", movement, deduplicate=True)
    assert not save_movement(repository, "a", "u", movement, deduplicate=True)
    assert repository.list("hogares/a/resumenes")[0]["egresos"] == 0


def test_edit_updates_old_and_new_month_summaries(app):
    from app.services.movements import edit_movement

    repository = app.extensions["repo"]
    movement = dict(monto=100, fecha="2026-01-10", descripcion="Compra", categoria="Hogar")
    save_movement(repository, "edit", "user", movement)
    old = repository.list("hogares/edit/movimientos")[0]
    edit_movement(repository, "edit", "user", old["id"], dict(movement, monto=150, fecha="2026-02-01"))
    assert repository.get("hogares/edit/resumenes/2026-01")["egresos"] == 0
    assert repository.get("hogares/edit/resumenes/2026-02")["egresos"] == 150


def test_edit_form_renders(logged):
    data = logged.get("/perfil/exportar").json
    movement = next(m for m in data["movimientos"] if not m.get("pagoFijoId"))
    assert logged.get("/movimientos/" + movement["id"] + "/editar").status_code == 200
