import hashlib
from datetime import date,datetime,timezone
from collections import defaultdict
from .categorizer import normalize
from .recurrence import detect_recurrences

def build_alerts(movements,payments,today=None):
    today=today or date.today()
    items=sorted([m for m in movements if m['tipo']=='gasto' and not m.get('privado')],key=lambda m:m['fecha'])
    alerts=[]
    def add(kind,message,severity='media'):
        alerts.append(dict(tipo=kind,mensaje=message,severidad=severity,leida=False,creadaEn=today.isoformat()))
    history=defaultdict(list)
    recent={}
    for item in items:
        key=(normalize(item.get('comercio') or item['descripcion']),item['monto'])
        previous=recent.get(key)
        if previous and 0<=(date.fromisoformat(item['fecha'])-date.fromisoformat(previous['fecha'])).days<=2:
            add('duplicado',f"Revisa dos cargos de ${item['monto']:,.2f} en {item['comercio']} ({previous['fecha']} y {item['fecha']}).")
        recent[key]=item
        amounts=history[item['categoria']]
        if len(amounts)>=3 and item['monto']>2.5*sum(amounts)/len(amounts): add('atipico',f"El gasto de ${item['monto']:,.2f} en {item['categoria']} es mayor a tu promedio.")
        amounts.append(item['monto'])
    for payment in payments:
        days=(date.fromisoformat(payment['proximaFecha'])-today).days
        if payment.get('pagado'): continue
        card=payment.get('datosTarjeta')
        if card:
            if 0<=days<=5: add('tarjeta',f"Necesitas ${card['pagoSinIntereses']:,.2f} antes del {payment['proximaFecha']} para no generar intereses.",'alta')
            if card['limite']>0 and 1-card['disponible']/card['limite']>.8: add('tarjeta','Tu tarjeta supera el 80% de su límite.','alta')
        elif 0<=days<=3: add('pago',f"{payment['nombre']} vence el {payment['proximaFecha']}: ${payment['monto']:,.2f}.")
    for recurring in detect_recurrences(items):
        if recurring['increased']: add('suscripcion',f"{recurring['nombre']} subió de ${recurring['previous']:,.2f} a ${recurring['monto']:,.2f}.")
    return alerts

def refresh_alerts(repository,household_id):
    base=f'hogares/{household_id}'
    alerts=build_alerts(repository.list(base+'/movimientos'),repository.list(base+'/pagosFijos'))
    wanted=set()
    for item in alerts:
        key=hashlib.sha256((item['tipo']+item['mensaje']).encode()).hexdigest()
        wanted.add(key)
        existing=repository.get(base+'/alertas/'+key)
        if existing: item['leida']=existing.get('leida',False)
        repository.put(base+'/alertas/'+key,item)
    for old in repository.list(base+'/alertas'):
        if old['id'] not in wanted: repository.delete(base+'/alertas/'+old['id'])
    return alerts
