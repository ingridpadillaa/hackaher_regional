from datetime import timedelta
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.services.budget import daily_budget
from app.services.clock import local_today
from app.services.reports import summarize
from app.services.seasonal import upcoming


class ToolArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    periodo: Literal["semana", "quincena", "mes"] = "quincena"
    categoria: str = Field(default="", max_length=80)
    dias: int = Field(default=15, ge=1, le=365)
    monto: float = Field(default=0, ge=0, le=100000000, allow_inf_nan=False)
    meses: int = Field(default=1, ge=1, le=600)
    tasa_anual: float = Field(default=0, ge=0, le=1000, allow_inf_nan=False)
    pago: float = Field(default=0, ge=0, le=100000000, allow_inf_nan=False)
    periodicidad: Literal["semanal", "quincenal", "mensual"] = "mensual"
    numero_pagos: int = Field(default=1, ge=1, le=10000)
    ruta: str = Field(default="/", max_length=100)
    presupuesto: float | None = Field(default=None, ge=0, le=100000000, allow_inf_nan=False)


TOOL_NAMES = [
    "resumen_periodo",
    "presupuesto_vs_real",
    "estado_meta",
    "estado_racha",
    "comparar_carrito",
    "sugerencias_mandado",
    "navegar",
    "obtener_resumen",
    "gastos_por_categoria",
    "hoy_puedo_gastar",
    "proximos_pagos",
    "simular_compra_a_meses",
    "costo_real_credito",
    "lista_mandado",
    "proxima_temporada",
]


def execute(name, raw_args, context):
    name = {"resumen_periodo": "obtener_resumen", "comparar_carrito": "lista_mandado"}.get(name, name)
    args = ToolArgs.model_validate(raw_args)
    if name == "navegar":
        from app.services.notifications import ALLOWED_ROUTES

        if args.ruta not in ALLOWED_ROUTES:
            raise ValueError("Ruta no permitida")
        return {"ruta": args.ruta}
    if name in ("estado_meta", "estado_racha", "sugerencias_mandado", "presupuesto_vs_real"):
        from app.services.planning import build_plan, history_days

        if name == "estado_meta":
            return context.get("goal") or {"sinDatos": True}
        if name == "estado_racha":
            return context.get("streak") or {"sinDatos": True}
        if name == "sugerencias_mandado":
            return {"productos": context["shopping"]["predictions"]}
        if history_days(context["movements"]) < 7:
            return {"sinDatos": True}
        plan = build_plan(context["household"], context["payments"], context["movements"])
        return {
            "presupuesto": plan["porCategoria"],
            "real": summarize(
                context["movements"],
                local_today().replace(day=1).isoformat(),
                (local_today() + timedelta(days=1)).isoformat(),
            )["categories"],
        }

    household, movements, payments = context["household"], context["movements"], context["payments"]
    days = {"semana": 7, "quincena": 15, "mes": 30}[args.periodo]
    end = local_today() + timedelta(days=1)
    if name in ("obtener_resumen", "gastos_por_categoria"):
        data = summarize(movements, (end - timedelta(days=days)).isoformat(), end.isoformat())
        if name == "gastos_por_categoria":
            return {"categoria": args.categoria, "gasto": data["categories"].get(args.categoria, 0)}
        return data
    if name == "hoy_puedo_gastar":
        seasons = upcoming(context["events"], household, movements)
        return daily_budget(
            household, movements, payments, seasonal_weekly=seasons[0]["weekly"] if seasons else 0
        )
    if name == "proximos_pagos":
        return {
            "pagos": [
                dict(
                    categoria=p["categoria"],
                    fecha=p["proximaFecha"],
                    monto=p.get("datosTarjeta", {}).get("pagoSinIntereses", p["monto"]),
                )
                for p in payments
                if local_today().isoformat()
                <= p["proximaFecha"]
                <= (local_today() + timedelta(days=args.dias)).isoformat()
            ]
        }
    if name == "simular_compra_a_meses":
        if not {"monto", "meses"}.issubset(raw_args) or args.monto <= 0:
            raise ValueError("Falta el monto y el número de meses.")
        rate = args.tasa_anual / 1200
        payment = (
            args.monto / args.meses if rate == 0 else args.monto * rate / (1 - (1 + rate) ** (-args.meses))
        )
        return dict(
            mensualidad=round(payment, 2),
            total=round(payment * args.meses, 2),
            intereses=round(payment * args.meses - args.monto, 2),
            estimacion=True,
        )
    if name == "costo_real_credito":
        if not {"monto", "pago", "numero_pagos"}.issubset(raw_args) or args.monto <= 0 or args.pago <= 0:
            raise ValueError("Falta el monto recibido y las condiciones de pago.")
        total = args.pago * args.numero_pagos
        return dict(
            total=round(total, 2),
            costo=round(total - args.monto, 2),
            periodicidad=args.periodicidad,
            estimacion=True,
        )
    if name == "lista_mandado":
        return {"tiendas": context["shopping"]["totals"], "presupuesto": args.presupuesto}
    if name == "proxima_temporada":
        seasons = upcoming(context["events"], household, movements)
        season = (
            next((e for e in seasons if "clases" in e["nombre"].lower()), None)
            if context.get("school")
            else next(iter(seasons), None)
        )
        return {
            "temporada": {k: season[k] for k in ("nombre", "estimate", "weekly", "fechaInicio", "source")}
            if season
            else None
        }
    raise ValueError("Herramienta no permitida")


def render_fact(name, result):
    name = {"resumen_periodo": "obtener_resumen", "comparar_carrito": "lista_mandado"}.get(name, name)
    if result.get("sinDatos"):
        return "Aún no hay suficientes datos. Completa tu personalización y registra tus gastos."
    if name == "navegar":
        return "Puedes abrir esta pantalla con el botón."
    if name == "estado_meta":
        return (
            f"Llevas ${result.get('ahorrado', 0):,.2f} de ${result.get('montoObjetivo', 0):,.2f} en tu meta."
        )
    if name == "estado_racha":
        return f"Tu racha actual es de {result.get('diasActuales', 0)} días."
    if name == "sugerencias_mandado":
        return (
            "Revisa las sugerencias basadas en tus compras en Mandado."
            if result["productos"]
            else "Necesitamos dos compras del mismo producto para estimar su reposición."
        )
    if name == "presupuesto_vs_real":
        return "\n".join(
            f"{c}: ${result['real'].get(c, 0):,.2f} de ${v:,.2f} sugeridos."
            for c, v in result["presupuesto"].items()
        )

    def money(value):
        return f"${value:,.2f}"

    if name == "hoy_puedo_gastar" and not result.get("has_income", True):
        return "Completa tus ingresos en Personalización para calcular tu disponible."
    if name == "hoy_puedo_gastar":
        return f"Hoy puedes gastar {money(result['daily'])}. Quedan {result['days']} días para tu próximo ingreso. Disponible del periodo: {money(result['available'])}. Es una estimación con tus registros visibles."
    if name == "obtener_resumen":
        categories = ", ".join(
            f"{c}: {money(v)}" for c, v in sorted(result["categories"].items(), key=lambda item: -item[1])[:5]
        )
        return f"Ingresos: {money(result['income'])}. Gastos: {money(result['expenses'])}. Balance: {money(result['balance'])}.\nPor categoría: {categories or 'aún no hay gastos'}."
    if name == "gastos_por_categoria":
        return f"En {result['categoria']} llevas {money(result['gasto'])}."
    if name == "proxima_temporada":
        season = result["temporada"]
        return (
            f"Para {season['nombre']} estimamos {money(season['estimate'])}. Aparta {money(season['weekly'])} por semana hasta {season['fechaInicio']}. Fuente: {season['source']}."
            if season
            else "Aún no hay temporadas cargadas."
        )
    if name == "proximos_pagos":
        return (
            "\n".join(f"{p['categoria']}: {money(p['monto'])}, {p['fecha']}" for p in result["pagos"])
            or "No hay pagos en ese plazo."
        )
    if name == "simular_compra_a_meses":
        return f"Mensualidad estimada: {money(result['mensualidad'])}. Total: {money(result['total'])}; intereses: {money(result['intereses'])}. No incluye comisiones ni seguros."
    if name == "costo_real_credito":
        return f"Pagarías {money(result['total'])} en total. El costo sobre lo recibido sería {money(result['costo'])}. Estimación sin cargos adicionales."
    if name == "lista_mandado":
        return (
            "\n".join(
                f"{s['store']}: {money(s['total'])} ({'lista completa' if s['complete'] else 'parcial'})"
                for s in result["tiendas"]
            )
            or "Aún no hay precios comparables."
        )
    return ""
