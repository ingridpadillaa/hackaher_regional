from datetime import date, timedelta

from app.services.clock import local_today


def easter(year):
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    adjustment = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * adjustment) // 451
    return date(year, (h + adjustment - 7 * m + 114) // 31, (h + adjustment - 7 * m + 114) % 31 + 1)


def seed_calendar(repository):
    import json
    from pathlib import Path

    catalog = json.loads((Path(__file__).resolve().parents[2] / "data/temporadas.json").read_text())
    entries = catalog["entries"]
    for year in (local_today().year, local_today().year + 1):
        for index, (name, month, day, amount) in enumerate(entries):
            start = date(year, month, day)
            repository.put(
                f"eventosTemporada/{year}-{index}",
                dict(
                    nombre=name,
                    fechaInicio=start.isoformat(),
                    fechaFin=(start + timedelta(days=6)).isoformat(),
                    categoria="Educación" if "clases" in name else "Hogar",
                    gastoReferencia=amount,
                    ingresoReferencia=catalog["reference_income"],
                    estimacion=True,
                ),
            )
        repository.put(
            f"eventosTemporada/{year}-14",
            dict(
                nombre="Semana Santa",
                fechaInicio=(easter(year) - timedelta(days=7)).isoformat(),
                fechaFin=easter(year).isoformat(),
                categoria="Hogar",
                gastoReferencia=catalog["easter_amount"],
                ingresoReferencia=catalog["reference_income"],
                estimacion=True,
            ),
        )
