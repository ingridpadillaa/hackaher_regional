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
    entries = [
        ("Día de Reyes", 1, 6, 900),
        ("Cuesta de enero", 1, 15, 1300),
        ("Predial", 1, 31, 1200),
        ("San Valentín", 2, 14, 500),
        ("Día del Niño", 4, 30, 600),
        ("Día de las Madres", 5, 10, 800),
        ("Vacaciones de verano", 7, 15, 2500),
        ("Regreso a clases", 8, 20, 2400),
        ("Fiestas Patrias", 9, 16, 700),
        ("Día de Muertos", 11, 2, 650),
        ("Buen Fin", 11, 15, 1800),
        ("Aguinaldo", 12, 15, 0),
        ("Posadas", 12, 18, 900),
        ("Navidad", 12, 25, 2500),
    ]
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
                    ingresoReferencia=24000,
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
                gastoReferencia=2000,
                ingresoReferencia=24000,
                estimacion=True,
            ),
        )
