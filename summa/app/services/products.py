import re
from collections import Counter
from datetime import date, timedelta

from .categorizer import normalize
from .clock import local_today


def product_id(name):
    return re.sub(r"[^a-z0-9]+", "-", normalize(name)).strip("-")[:180]


def update_products(repository, hid):
    base = f"hogares/{hid}"
    products = {}
    for ticket in repository.list(base + "/tickets"):
        if ticket.get("esPrueba"):
            continue
        for item in ticket.get("productos", []):
            name = item["nombreNormalizado"]
            pid = item.get("productoId") or product_id(name)
            product = products.setdefault(pid, dict(nombreNormalizado=name, productoId=pid, compras=[]))
            product["compras"].append(
                dict(
                    fecha=ticket["fecha"],
                    cantidad=item["cantidad"],
                    precio=item.get("precioUnitario", item.get("precio")),
                    tienda=ticket["tienda"],
                )
            )
    for pid, product in products.items():
        days = sorted({date.fromisoformat(p["fecha"]) for p in product["compras"]})
        product["cantidadHabitual"] = Counter(p["cantidad"] for p in product["compras"]).most_common(1)[0][0]
        if len(days) >= 2:
            interval = sum((b - a).days for a, b in zip(days, days[1:])) / (len(days) - 1)
            product.update(
                intervaloPromedioDias=interval,
                proximaCompraEstimada=(days[-1] + timedelta(days=interval)).isoformat(),
            )
        if repository.get(base + "/productosHogar/" + pid) != product:
            repository.put(base + "/productosHogar/" + pid, product)
    return list(products.values())


def suggestions(products):
    return [
        p
        for p in products
        if p.get("proximaCompraEstimada")
        and p["proximaCompraEstimada"] <= (local_today() + timedelta(days=3)).isoformat()
    ]
