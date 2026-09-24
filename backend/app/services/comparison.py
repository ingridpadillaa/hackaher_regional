import json
import math
import os
from difflib import SequenceMatcher
from pathlib import Path
from statistics import median
from urllib.parse import urlencode, urlparse

from .categorizer import normalize
from .products import product_id


def haversine(a, b):
    lat1, lat2 = map(math.radians, (a["lat"], b["lat"]))
    dlat = lat2 - lat1
    dlng = math.radians(b["lng"] - a["lng"])
    value = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 6371 * 2 * math.asin(min(1, math.sqrt(value)))


def buy_url(chain, items):
    configs = json.loads((Path(__file__).resolve().parents[2] / "data/supermercados.json").read_text())
    config = next((v for k, v in configs.items() if normalize(k) == normalize(chain)), None)
    if not config:
        return None
    domain = config["dominio"]
    sku = config.get("sku_map", {})
    if config.get("plataforma") == "vtex" and all(
        i["productoId"] in sku and float(i["cantidad"]).is_integer() for i in items
    ):
        params = [("sc", config.get("salesChannel", "1"))]
        for item in items:
            params.extend([("sku", sku[item["productoId"]]), ("qty", int(item["cantidad"])), ("seller", "1")])
        return "https://" + domain + "/checkout/cart/add?" + urlencode(params)
    url = config.get("urlBusqueda", "").replace("{query}", urlencode({"q": items[0]["nombre"]})[2:])
    return url if urlparse(url).scheme == "https" and urlparse(url).hostname == domain else None


def compare(home, items, prices):
    if not items:
        return []
    candidates = []
    for p in prices:
        if p.get("demo") or p.get("esPrueba"):
            continue
        p = dict(p)
        coords = p.get("lat") is not None and p.get("lng") is not None
        if home.get("ubicacion") and coords:
            p["distance"] = haversine(home["ubicacion"], {"lat": float(p["lat"]), "lng": float(p["lng"])})
            if p["distance"] > float(os.getenv("RADIO_KM", "5")):
                continue
        elif home.get("municipio") and normalize(p.get("municipio", "")) == normalize(home["municipio"]):
            p["distance"] = None
        else:
            continue
        candidates.append(p)
    latest = {}
    for p in candidates:
        pid = p.get("producto_id") or product_id(p["producto"])
        for item in items:
            match = pid == item["productoId"]
            # Fuzzy matching never crosses presentation or brand when known.
            if not match:
                name = normalize(item["nombre"])
                presentation = normalize(p.get("presentacion") or "")
                brand = normalize(p.get("marca") or "")
                match = bool(
                    presentation
                    and presentation in name
                    and (not brand or brand in name)
                    and SequenceMatcher(None, name, normalize(p["producto"])).ratio() >= 0.88
                )
            if not match:
                continue
            store = (p.get("cadena") or "", p["tienda"], p.get("direccion", ""), p.get("municipio", ""))
            key = (store, item["productoId"])
            if key not in latest or (p["fecha"], p["fuente"] == "ticket") > (
                latest[key]["fecha"],
                latest[key]["fuente"] == "ticket",
            ):
                latest[key] = p
    regional = {
        i["productoId"]: median([p["precio"] for (_, pid), p in latest.items() if pid == i["productoId"]])
        for i in items
        if any(pid == i["productoId"] for _, pid in latest)
    }
    result = []
    for store in {key[0] for key in latest}:
        offers = {pid: p for (s, pid), p in latest.items() if s == store}
        coverage = len(offers) / len(items)
        if coverage < 0.7 or any(i["productoId"] not in regional for i in items):
            continue
        total = sum(
            i["cantidad"]
            * (offers[i["productoId"]]["precio"] if i["productoId"] in offers else regional[i["productoId"]])
            for i in items
        )
        result.append(
            dict(
                store=store[1],
                chain=store[0],
                total=round(total, 2),
                coverage=coverage,
                count=len(offers),
                complete=len(offers) == len(items),
                estimated=coverage < 1,
                distance=next(iter(offers.values()))["distance"],
                date=min(p["fecha"] for p in offers.values()),
                source=" + ".join(sorted({p["fuente"] for p in offers.values()})),
                buy_url=buy_url(store[0], items),
            )
        )
    result = sorted(result, key=lambda r: r["total"])[:3]
    for store in result:
        store["saving"] = round(store["total"] - result[0]["total"], 2)
    return result
