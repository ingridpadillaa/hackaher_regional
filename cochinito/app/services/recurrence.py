from collections import defaultdict
from datetime import date,timedelta
from .categorizer import normalize

def detect_recurrences(movements):
    groups=defaultdict(list)
    for m in movements:
        if m['tipo']=='gasto' and not m.get('privado'): groups[normalize(m.get('comercio') or m['descripcion'])].append(m)
    result=[]
    for merchant,items in groups.items():
        items.sort(key=lambda m:m['fecha'])
        if len(items)<2: continue
        previous,last=items[-2:]
        gap=(date.fromisoformat(last['fecha'])-date.fromisoformat(previous['fecha'])).days
        if not previous['monto'] or abs(last['monto']/previous['monto']-1)>.15: continue
        cadence='mensual' if 25<=gap<=35 else 'bimestral' if 55<=gap<=65 else None
        if cadence:
            next_day=date.fromisoformat(last['fecha'])+timedelta(days=30 if cadence=='mensual' else 60)
            while next_day<date.today(): next_day+=timedelta(days=30 if cadence=='mensual' else 60)
            result.append(dict(nombre=last.get('comercio') or last['descripcion'],monto=last['monto'],previous=previous['monto'],increased=last['monto']>previous['monto']*1.05,periodicidad=cadence,proximaFecha=next_day.isoformat(),categoria=last['categoria']))
    return result
