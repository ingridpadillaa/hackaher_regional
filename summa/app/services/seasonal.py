from datetime import date

from app.services.clock import local_today


def estimate(event, household, movements, today=None):
    today = today or local_today()
    start = date.fromisoformat(event["fechaInicio"])
    end = date.fromisoformat(event["fechaFin"])
    years = {int(m["fecha"][:4]) for m in movements if int(m["fecha"][:4]) < start.year}
    history = []
    for year in years:
        total = sum(
            m["monto"]
            for m in movements
            if m["tipo"] == "gasto"
            and m["categoria"] == event["categoria"]
            and m["fecha"][:4] == str(year)
            and start.strftime("%m-%d") <= m["fecha"][5:] <= end.strftime("%m-%d")
        )
        if total:
            history.append(total)
    multiplier = {"mensual": 1, "quincenal": 2, "semanal": 52 / 12}.get(household["periodicidadIngreso"], 2)
    amount = (
        sum(history) / len(history)
        if history
        else event["gastoReferencia"]
        * household["ingresoEstimado"]
        * multiplier
        / event.get("ingresoReferencia", 24000)
    )
    remaining = max(0, amount - event.get("apartado", 0))
    return dict(
        event,
        estimate=round(amount, 2),
        weekly=round(remaining / max(1, (start - today).days / 7), 2),
        source="historial" if history else "referencia estimada",
    )


def upcoming(events, household, movements, today=None):
    today = today or local_today()
    return [
        estimate(e, household, movements, today)
        for e in sorted(events, key=lambda e: e["fechaInicio"])
        if e["fechaFin"] >= today.isoformat()
    ]
