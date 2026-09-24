from datetime import date

import pytest

from app.services.profeco_etl import sync_prices
from app.services.replenishment import compare_prices, predict


def test_replenishment():
    tickets = [
        dict(fecha=day, productos=[{"nombreNormalizado": "Huevo"}]) for day in ["2026-09-01", "2026-09-08"]
    ]
    assert predict(tickets, date(2026, 9, 10))[0]["interval"] == 7


def test_latest_price_and_partial_total():
    prices = [
        dict(producto="Huevo", tienda="Tienda", fecha=day, precio=price, fuente=source)
        for day, price, source in [("2026-09-01", 40, "profeco"), ("2026-09-02", 45, "ticket")]
    ]
    comparisons, totals = compare_prices(prices, ["Huevo", "Leche"])
    assert comparisons[0]["offers"][0]["precio"] == 45
    assert not totals[0]["complete"]


def test_etl_latest_fingerprint_and_validation(app, tmp_path):
    repo = app.extensions["repo"]
    path = tmp_path / "prices.csv"
    path.write_text(
        "PRODUCTO,PRECIO,FECHAREGISTRO,CADENACOMERCIAL,ESTADO\nArroz,29,2026-09-20,Tienda,NUEVO LEON\nArroz,30,2026-09-21,Tienda,NUEVO LEON\n"
    )
    assert sync_prices(repo, path)["rows"] == 1
    assert repo.list("precios")[0]["precio"] == 30
    assert not sync_prices(repo, path)["changed"]
    path.write_text("PRODUCTO\nArroz\n")
    with pytest.raises(ValueError):
        sync_prices(repo, path)
    assert repo.list("precios")[0]["precio"] == 30


def test_shopping_page(logged):
    assert logged.get("/mandado").status_code == 200


def test_etl_zip_and_xlsx_without_extension(app, tmp_path):
    import zipfile

    from openpyxl import Workbook

    repository = app.extensions["repo"]
    headers = ["PRODUCTO", "PRECIO", "FECHAREGISTRO", "CADENACOMERCIAL", "ESTADO"]
    row = ["Huevo", 42, "2026-09-22", "Mercado", "NUEVO LEON"]
    archive = tmp_path / "prices.zip"
    with zipfile.ZipFile(archive, "w") as target:
        target.writestr("nested/prices.csv", ",".join(headers) + "\n" + ",".join(map(str, row)) + "\n")
    assert sync_prices(repository, archive)["rows"] == 1
    workbook = Workbook()
    workbook.active.append(headers)
    workbook.active.append(row)
    path = tmp_path / "download"
    workbook.save(path)
    assert sync_prices(repository, path)["rows"] == 1
