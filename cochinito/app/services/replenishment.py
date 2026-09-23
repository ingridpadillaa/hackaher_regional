from collections import defaultdict
from datetime import date,timedelta

def predict(tickets,today=None):
    today=today or date.today()
    purchases=defaultdict(set)
    for ticket in tickets:
        for product in ticket['productos']: purchases[product['nombreNormalizado']].add(date.fromisoformat(ticket['fecha']))
    result=[]
    for product,days in purchases.items():
        days=sorted(days)
        if len(days)<2: continue
        interval=sum((b-a).days for a,b in zip(days,days[1:]))/(len(days)-1)
        next_day=days[-1]+timedelta(days=interval)
        if next_day<=today+timedelta(days=7): result.append(dict(product=product,next=next_day.isoformat(),interval=round(interval,1)))
    return result

def compare_prices(prices,products):
    latest={}
    for price in prices:
        if price['producto'] not in products: continue
        key=(price['producto'],price['tienda'])
        if key not in latest or price['fecha']>latest[key]['fecha'] or (price['fecha']==latest[key]['fecha'] and price['fuente']=='ticket'):
            latest[key]=price
    comparisons=[]
    for product in products:
        offers=sorted([p for (name,store),p in latest.items() if name==product],key=lambda p:p['precio'])
        comparisons.append(dict(product=product,offers=offers))
    stores={p['tienda'] for p in latest.values()}
    totals=[]
    for store in stores:
        offers=[p for (name,s),p in latest.items() if s==store]
        totals.append(dict(store=store,total=round(sum(p['precio'] for p in offers),2),count=len(offers),complete=len(offers)==len(products)))
    return comparisons,sorted(totals,key=lambda s:(not s['complete'],s['total']))
