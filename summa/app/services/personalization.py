"""Validated household input and derived profiles; never supplies sample user data."""
import math
from datetime import date

from .budget import add_period
from .clock import local_today

CADENCES = ('semanal', 'quincenal', 'mensual', 'variable')

def amount(value):
    result = float(value or 0)
    if not math.isfinite(result) or not 0 <= result < 100000000:
        raise ValueError('Revisa los montos: deben ser positivos y finitos.')
    return result

def household_type(members):
    if not members:
        return 'unipersonal'
    if all(m['edad'] >= 60 for m in members):
        return 'adultos_mayores'
    if any(6 <= m['edad'] <= 17 and m.get('estudiaActualmente') for m in members):
        return 'familia_con_hijos_escolares'
    if any(m['edad'] < 6 for m in members):
        return 'familia_con_hijos_pequenos'
    if all(m.get('tipoEmpleo') == 'estudiante' for m in members):
        return 'estudiantes'
    return 'unipersonal' if len(members) == 1 else 'pareja' if len(members) == 2 else 'familia_extensa'

def monthly_income(member):
    return member.get('ingreso', 0) * {'semanal':52/12, 'quincenal':2, 'mensual':1, 'variable':.9}.get(member.get('periodicidadIngreso'), 1)

def parse_members(form, uid):
    result = []
    for i in range(20):
        prefix = f'member_{i}_'
        name = form.get(prefix+'nombre', '').strip()
        if not name:
            continue
        age = int(form.get(prefix+'edad', ''))
        cadence = form.get(prefix+'periodicidadIngreso', 'mensual')
        if not 0 <= age <= 120 or cadence not in CADENCES:
            raise ValueError('Revisa edades y periodicidades.')
        income = amount(form.get(prefix+'ingreso'))
        payday = form.get(prefix+'proximaFechaIngreso', '')
        if income and (not payday or date.fromisoformat(payday) <= local_today()):
            raise ValueError('Indica la próxima fecha de cobro de cada ingreso.')
        member = {key:form.get(prefix+key, '')[:100] for key in ('parentesco','escolaridad','nivelQueEstudia','ocupacion','tipoEmpleo')}
        member.update(nombre=name[:80], edad=age, estudiaActualmente=bool(form.get(prefix+'estudiaActualmente')), ingreso=income, periodicidadIngreso=cadence, proximaFechaIngreso=payday)
        member['id'] = uid if i == 0 else form.get(prefix+'id') or __import__('uuid').uuid4().hex
        if i == 0:
            member['uid'] = uid
        result.append(member)
    if not result:
        raise ValueError('Agrega al menos una persona a tu hogar.')
    return result

def derive_household(home, members):
    earners = [m for m in members if m.get('ingreso') and m.get('proximaFechaIngreso')]
    home.update(tipoHogar=household_type(members), ingresoMensualTotal=round(sum(monthly_income(m) for m in members),2), calendarioIngresos=earners)
    # Compatibility for existing seasonal and debt helpers.
    home.update(ingresoEstimado=home['ingresoMensualTotal'], periodicidadIngreso='mensual')
    next_day = min([m['proximaFechaIngreso'] for m in earners] or [add_period(local_today(),'mensual').isoformat()])
    home.update(proximaFechaIngreso=next_day, ultimaFechaIngreso=add_period(date.fromisoformat(next_day),'mensual',-1).isoformat())
    return home


def parse_payments(form):
    result = []
    for i in range(20):
        pre = f'payment_{i}_'
        name = form.get(pre+'nombre','').strip()
        if not name:
            continue
        due = date.fromisoformat(form.get(pre+'fecha',''))
        cadence = form.get(pre+'periodicidad','mensual')
        kind = form.get(pre+'tipo','servicio')
        if cadence not in (*CADENCES[:3], 'bimestral') or kind not in ('servicio','suscripcion','renta_colegiatura','credito','tarjeta_credito','otro'):
            raise ValueError('Revisa la periodicidad y el tipo de pago.')
        payment = dict(nombre=name[:100], monto=amount(form.get(pre+'monto')), proximaFecha=due.isoformat(), diaDePago=due.day, periodicidad=cadence,tipo=kind,categoria=form.get(pre+'categoria','Servicios'),origen='personalizacion')
        if kind == 'tarjeta_credito':
            limit=amount(form.get(pre+'limite'))
            available=amount(form.get(pre+'disponible'))
            minimum=amount(form.get(pre+'minimo'))
            if available>limit or minimum>payment['monto']:
                raise ValueError('Revisa el disponible y pago mínimo de tu tarjeta.')
            payment['datosTarjeta']=dict(limite=limit,disponible=available,pagoMinimo=minimum,pagoSinIntereses=payment['monto'],fechaLimite=due.isoformat())
        if kind == 'credito':
            payment['datosCredito']=dict(saldo=amount(form.get(pre+'saldo')),pagosRestantes=int(form.get(pre+'restantes') or 0))
        result.append(payment)
    return result
