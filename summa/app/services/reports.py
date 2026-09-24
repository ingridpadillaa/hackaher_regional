from collections import defaultdict
from datetime import timedelta

from app.services.clock import local_today


def summarize(movements, start, end):
    items = [m for m in movements if start <= m["fecha"] < end]
    categories = defaultdict(float)
    for item in items:
        if item["tipo"] == "gasto":
            categories[item["categoria"]] += item["monto"]
    income = sum(m["monto"] for m in items if m["tipo"] == "ingreso")
    expenses = sum(categories.values())
    return dict(
        income=round(income, 2),
        expenses=round(expenses, 2),
        balance=round(income - expenses, 2),
        categories={k: round(v, 2) for k, v in categories.items()},
        small=round(
            sum(
                m["monto"]
                for m in items
                if m["tipo"] == "gasto"
                and m["monto"] < 100
                and m["categoria"] in ("Comida fuera", "Entretenimiento")
            ),
            2,
        ),
    )


def report(movements, tickets, window, today=None):
    today = today or local_today()
    days = {"semana": 7, "quincena": 15, "mes": 30}.get(window, 15)
    end = today + timedelta(days=1)
    periods = []
    for index in range(6):
        right = end - timedelta(days=days * index)
        left = right - timedelta(days=days)
        periods.append(
            dict(
                summarize(movements, left.isoformat(), right.isoformat()),
                label=left.strftime("%d/%m"),
                start=left.isoformat(),
                end=right.isoformat(),
            )
        )
    current, previous = periods[:2]
    differences = {
        c: amount - previous["categories"].get(c, 0) for c, amount in current["categories"].items()
    }
    growth = max(differences, key=differences.get) if differences else None
    prices = defaultdict(list)
    for ticket in tickets:
        for product in ticket["productos"]:
            prices[product["nombreNormalizado"]].append((ticket["fecha"], product["precio"]))
    changes = []
    for name, history in prices.items():
        history.sort()
        if len(history) > 1 and history[0][1] > 0:
            changes.append((history[-1][1] / history[0][1] - 1) * 100)
    return dict(
        current=current,
        previous=previous,
        periods=list(reversed(periods)),
        growth=growth,
        growth_amount=differences.get(growth, 0),
        inflation=round(sum(changes) / len(changes), 1) if changes else None,
        window=window,
    )
