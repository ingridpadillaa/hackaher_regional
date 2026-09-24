from app.services.personalization import household_type
from tests.conftest import csrf


def test_new_account_has_no_sample_data(client, app):
    response = client.post(
        "/auth/demo", data={"name": "Cuenta de prueba", "csrf_token": csrf(client), "seed": "1"}
    )
    assert response.status_code == 302
    repository = app.extensions["repo"]
    assert not repository.list("hogares")
    assert not repository.list("precios")
    assert client.get("/onboarding").status_code == 200


def test_household_types():
    assert household_type([{"edad": 65}, {"edad": 70}]) == "adultos_mayores"
    assert (
        household_type([{"edad": 35}, {"edad": 9, "estudiaActualmente": True}])
        == "familia_con_hijos_escolares"
    )


def test_empty_income_onboarding(client, app):
    client.post("/auth/demo", data={"name": "Prueba", "csrf_token": csrf(client)})
    result = client.post(
        "/onboarding",
        data={
            "csrf_token": csrf(client, "/onboarding"),
            "privacy": "1",
            "nombre": "Hogar prueba",
            "estado": "Estado prueba",
            "municipio": "Municipio prueba",
            "member_0_nombre": "Prueba",
            "member_0_edad": "25",
        },
    )
    assert result.location == "/"
    assert app.extensions["repo"].list("hogares")[0]["ingresoMensualTotal"] == 0
    assert client.get("/").status_code == 200
