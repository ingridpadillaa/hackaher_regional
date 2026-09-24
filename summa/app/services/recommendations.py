"""Only precomputed aggregate facts reach the model; output selects grounded advice."""

from pydantic import BaseModel, Field

from .clock import local_today
from .llm import get_llm
from .planning import build_plan, history_days


class Selection(BaseModel):
    indices: list[int] = Field(min_length=3, max_length=5)


def generate(repository, hid):
    base = f"hogares/{hid}"
    home = repository.get(base)
    movements = [m for m in repository.list(base + "/movimientos") if not m.get("privado")]
    if history_days(movements) < 7:
        return {
            "items": [
                {
                    "titulo": "Conoce tu hogar",
                    "detalle": "Registra tus gastos durante al menos 7 días para recibir recomendaciones.",
                    "ruta": "/movimientos/nuevo",
                }
            ],
            "status": "insufficient",
        }
    users = [u for u in repository.list("usuarios") if u.get("hogarId") == hid]
    if not any(u.get("consentimientos", {}).get("iaDatos") for u in users):
        return {"items": [], "status": "unavailable"}
    plan = build_plan(home, repository.list(base + "/pagosFijos"), movements)
    facts = []
    for category, budget in plan["porCategoria"].items():
        spent = sum(
            m["monto"]
            for m in movements
            if m["tipo"] == "gasto"
            and m["categoria"] == category
            and m["fecha"][:7] == local_today().isoformat()[:7]
        )
        if spent and budget:
            facts.append(
                dict(
                    titulo=f"Revisa {category}",
                    detalle=f"Llevas ${spent:,.2f} de ${budget:,.2f} sugeridos para este mes.",
                    categoria=category,
                    impactoEstimado=round(max(0, spent - budget), 2),
                    ruta="/movimientos/reportes",
                )
            )
    facts.extend(
        [
            dict(
                titulo="Cuida tu ahorro",
                detalle=f"El ahorro mensual sugerido es ${plan['ahorroSugerido']:,.2f}.",
                ruta="/perfil/personalizacion",
            ),
            dict(
                titulo="Anticipa tus pagos",
                detalle="Revisa los próximos vencimientos antes de hacer otra compra.",
                ruta="/perfil/personalizacion/pagos",
            ),
            dict(
                titulo="Compara tu mandado",
                detalle="Usa tu lista para comparar precios cercanos disponibles.",
                ruta="/mandado",
            ),
        ]
    )
    try:
        selection = get_llm().extract(
            "Elige 3 a 5 índices distintos (base cero) de consejos útiles para este tipo de hogar: "
            + home.get("tipoHogar", "")
            + ". Solo usa estos hechos agregados: "
            + __import__("json").dumps(facts, ensure_ascii=False),
            Selection,
        )
        indices = list(dict.fromkeys(selection.indices))
        if len(indices) < 3 or any(i < 0 or i >= len(facts) for i in indices):
            raise ValueError("Selección inválida")
        result = {"items": [facts[i] for i in indices], "status": "ok"}
    except ValueError:
        result = {"items": [], "status": "unavailable"}
    repository.put(base + "/recomendaciones/" + local_today().isoformat(), result)
    return result
