"""Deterministic suggested budget and savings. AI never computes these amounts."""

import json
from datetime import date, timedelta
from pathlib import Path

from .clock import local_today

CATALOG = json.loads((Path(__file__).resolve().parents[2] / "data/presupuesto_base.json").read_text())
ESSENTIAL = set(CATALOG["esenciales"])


def history_days(movements, today=None):
    today = today or local_today()
    dates = [date.fromisoformat(m["fecha"]) for m in movements]
    return (today - min(dates)).days + 1 if dates else 0


def monthly_payment(payment):
    return payment.get("datosTarjeta", {}).get("pagoSinIntereses", payment["monto"]) * {
        "semanal": 52 / 12,
        "quincenal": 2,
        "mensual": 1,
        "bimestral": 0.5,
    }.get(payment.get("periodicidad"), 1)


def build_plan(home, payments, movements, today=None):
    today = today or local_today()
    income = home.get("ingresoMensualTotal")
    if income is None:
        income = home.get("ingresoEstimado", 0) * {"semanal": 52 / 12, "quincenal": 2, "mensual": 1}.get(
            home.get("periodicidadIngreso"), 1
        )
    fixed = sum(monthly_payment(p) for p in payments if p.get("tipo") != "ahorro")
    weights = dict(CATALOG["proporciones"])
    for category, multiplier in CATALOG["ajustes"].get(home.get("tipoHogar"), {}).items():
        weights[category] *= multiplier
    weight_total = sum(weights.values())
    weights = {k: v / weight_total for k, v in weights.items()}
    covered = {p.get("categoria") for p in payments}
    essential_estimate = max(0, income - fixed) * sum(
        v for k, v in weights.items() if k in ESSENTIAL and k not in covered
    )
    capacity = income - fixed - essential_estimate
    savings = max(income * 0.05, min(income * 0.20, capacity * 0.5)) if capacity > 0 else income * 0.03
    minimum = {}
    for p in payments:
        category = p.get("categoria", "Otros")
        if p.get("tipo") != "ahorro":
            minimum[category] = minimum.get(category, 0) + monthly_payment(p)
    pool = max(0, income - savings - sum(minimum.values()))
    suggested = {k: round(minimum.get(k, 0) + pool * v, 2) for k, v in weights.items()}
    for k, v in minimum.items():
        suggested.setdefault(k, round(v, 2))
    if history_days(movements, today) >= 30:
        recent = [
            m
            for m in movements
            if (today - timedelta(days=29)).isoformat() <= m["fecha"] <= today.isoformat()
            and m["tipo"] == "gasto"
        ]
        blended = {}
        for category, value in suggested.items():
            real = sum(m["monto"] for m in recent if m["categoria"] == category)
            blended[category] = max(
                minimum.get(category, 0), min(value * 1.25, max(value * 0.75, (value + real) / 2))
            )
        extra = sum(max(0, v - minimum.get(k, 0)) for k, v in blended.items())
        suggested = {
            k: round(minimum.get(k, 0) + max(0, v - minimum.get(k, 0)) * pool / max(extra, 1), 2)
            for k, v in blended.items()
        }
    essential = fixed + essential_estimate
    return dict(
        porCategoria=suggested,
        ahorroSugerido=round(savings, 2),
        capacidad=round(capacity, 2),
        fondoObjetivo=round(essential * 3, 2),
        esencialMensual=round(essential, 2),
        aporteFondo=round(savings * (0.6 if home.get("fondoEmergencia", 0) < essential else 0), 2),
        aporteMeta=round(savings * (0.4 if home.get("fondoEmergencia", 0) < essential else 1), 2),
        generadoPor="reglas",
        insuficiente=capacity <= 0,
        desfase=round(max(0, fixed + savings - income), 2),
    )


def refresh_plan(repository, hid):
    base = f"hogares/{hid}"
    home = repository.get(base)
    # Shared planning must not reveal privately recorded spending.
    movements = [m for m in repository.list(base + "/movimientos") if not m.get("privado")]
    plan = build_plan(home, repository.list(base + "/pagosFijos"), movements)
    path = base + "/presupuesto/" + local_today().isoformat()[:7]
    if repository.get(path) != plan:
        repository.put(path, plan)
    if home.get("ahorroSugerido") != plan["ahorroSugerido"]:
        home["ahorroSugerido"] = plan["ahorroSugerido"]
        repository.put(base, home)
    goal = repository.get(base + "/metas/motivacion")
    if goal:
        weeks = max(1, (date.fromisoformat(goal["fechaObjetivo"]) - local_today()).days / 7)
        remaining = max(0, goal["montoObjetivo"] - goal.get("ahorrado", 0))
        contribution = remaining / weeks
        weekly_capacity = plan["aporteMeta"] * 12 / 52
        goal["aporteSugeridoSemanal"] = round(contribution, 2)
        goal["fechaRealista"] = (
            (
                local_today()
                + timedelta(days=min((date.max - local_today()).days, remaining / weekly_capacity * 7))
            ).isoformat()
            if weekly_capacity > 0 and contribution > weekly_capacity
            else None
        )
        if repository.get(base + "/metas/motivacion") != goal:
            repository.put(base + "/metas/motivacion", goal)
    return plan
