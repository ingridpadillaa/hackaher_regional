from datetime import date,timedelta
from calendar import monthrange

def add_period(day,periodicity,direction=1):
    if periodicity!='mensual': return day+timedelta(days=direction*(7 if periodicity=='semanal' else 15))
    month=day.month-1+direction
    year=day.year+month//12
    month=month%12+1
    return date(year,month,min(day.day,monthrange(year,month)[1]))

def period(household,today):
    end=date.fromisoformat(household['proximaFechaIngreso'])
    cadence=household.get('periodicidadIngreso','quincenal')
    start=date.fromisoformat(household.get('ultimaFechaIngreso') or add_period(end,cadence,-1).isoformat())
    while end<=today:
        start,end=end,add_period(end,cadence)
    return start,end

def daily_budget(household,movements,payments,today=None,seasonal_weekly=0):
    today=today or date.today()
    start,end=period(household,today)
    income=float(household['ingresoEstimado'])
    if household.get('ingresoVariable'):
        history=[]
        right=start
        for _ in range(6):
            left=add_period(right,household.get('periodicidadIngreso','quincenal'),-1)
            total=sum(m['monto'] for m in movements if m['tipo']=='ingreso' and left.isoformat()<=m['fecha']<right.isoformat())
            if total: history.append(total)
            right=left
        income=sum(sorted(history)[:2])/min(2,len(history)) if history else income*.9
    relevant=[m for m in movements if start.isoformat()<=m['fecha']<end.isoformat()]
    paid_ids={m.get('pagoFijoId') for m in relevant}
    committed=savings=0
    for payment in payments:
        if not start.isoformat()<=payment['proximaFecha']<end.isoformat() or payment.get('id') in paid_ids or payment.get('pagado'): continue
        amount=payment.get('datosTarjeta',{}).get('pagoSinIntereses',payment['monto'])
        if payment['tipo']=='ahorro': savings+=amount
        else: committed+=amount
    spent=sum(m['monto'] for m in relevant if m['tipo']=='gasto' and m['metodoPago']!='credito')
    # Card transfers consume cash once the corresponding fixed commitment is marked paid.
    spent+=sum(m['monto'] for m in relevant if m['tipo']=='transferencia' and m.get('pagoFijoId'))
    reserved=savings+seasonal_weekly*(end-start).days/7
    available=income-committed-reserved-spent
    return dict(daily=round(max(0,available/max(1,(end-today).days)),2),available=round(available,2),income=round(income,2),committed=round(committed,2),reserved=round(reserved,2),spent=round(spent,2),days=max(1,(end-today).days),start=start.isoformat(),end=end.isoformat())

def health_score(household,movements,payments,today=None):
    today=today or date.today()
    dates={date.fromisoformat(m['fecha']) for m in movements}
    if not dates or (today-min(dates)).days<14: return None
    budget=daily_budget(household,movements,payments,today)
    relevant=[m for m in movements if budget['start']<=m['fecha']<budget['end']]
    expenses=sum(m['monto'] for m in relevant if m['tipo']=='gasto')
    spend=25*max(0,1-expenses/max(1,budget['income']))
    monthly=max(1,sum(m['monto'] for m in movements if m['tipo']=='gasto')/max(1,(today-min(dates)).days/30))
    cushion=25*min(1,household.get('fondoEmergencia',0)/monthly)
    cards=[p['datosTarjeta'] for p in payments if p.get('datosTarjeta')]
    usage=max([1-c.get('disponible',0)/max(1,c.get('limite',1)) for c in cards] or [0])
    overdue=any(p['proximaFecha']<today.isoformat() and not p.get('pagado') for p in payments)
    debt=25*max(0,1-usage)*(0.5 if overdue else 1)
    consistency=25*len({d for d in dates if today-timedelta(days=13)<=d<=today})/14
    return round(min(100,max(0,spend+cushion+debt+consistency)))
