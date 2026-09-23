import hashlib
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from .categorizer import normalize, CATEGORIES, is_card_payment

def validate_movement(data):
    try:
        amount = Decimal(str(data.get('monto', '0')))
        if not amount.is_finite() or not 0 < amount <= 100000000: raise ValueError()
        day = date.fromisoformat(data.get('fecha', ''))
        if day > date.today(): raise ValueError()
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError('Revisa el monto y la fecha del movimiento.') from exc
    kind, method, category = data.get('tipo','gasto'), data.get('metodoPago','efectivo'), data.get('categoria','Otros')
    if kind not in ('gasto','ingreso','transferencia') or method not in ('efectivo','debito','credito','transferencia') or category not in CATEGORIES:
        raise ValueError('Revisa el tipo, categoría y método de pago.')
    description = str(data.get('descripcion','')).strip()[:160] or category
    if is_card_payment(description): kind = 'transferencia'
    return dict(monto=float(amount.quantize(Decimal('.01'))),fecha=day.isoformat(),tipo=kind,categoria=category,metodoPago=method,descripcion=description,comercio=str(data.get('comercio') or description)[:160],privado=bool(data.get('privado',False)),cuentaId=str(data.get('cuentaId',''))[:80])

def save_movement(repository, household_id, uid, data, origin='manual', deduplicate=False):
    movement = validate_movement(data)
    digest = hashlib.sha256(f"{movement['fecha']}|{movement['monto']:.2f}|{normalize(movement['descripcion'])}|{movement['cuentaId']}".encode()).hexdigest()
    doc_id = digest if deduplicate else uuid.uuid4().hex
    base=f'hogares/{household_id}'
    path=f'{base}/movimientos/{doc_id}'
    summary_path=f"{base}/resumenes/{movement['fecha'][:7]}"
    movement.update(integranteId=uid,origen=origin,hashDedup=digest,creadoEn=datetime.now(timezone.utc).isoformat())
    for key in ('pagoFijoId','externalId','conexionId'):
        if data.get(key): movement[key]=data[key]
    def update(current):
        if current[path]: return {}, False
        summary=current[summary_path] or {'ingresos':0,'egresos':0,'porCategoria':{}}
        amount=movement['monto']
        if movement['tipo']=='ingreso': summary['ingresos']=round(summary['ingresos']+amount,2)
        elif movement['tipo']=='gasto':
            summary['egresos']=round(summary['egresos']+amount,2)
            category=movement['categoria']
            summary['porCategoria'][category]=round(summary['porCategoria'].get(category,0)+amount,2)
        return {path:movement,summary_path:summary},True
    return repository.atomic([path,summary_path],update)

def delete_movement(repository, household_id, movement):
    base=f'hogares/{household_id}'
    path=f"{base}/movimientos/{movement['id']}"
    summary_path=f"{base}/resumenes/{movement['fecha'][:7]}"
    def update(current):
        item=current[path]
        if not item: return {},None
        summary=current[summary_path] or {'ingresos':0,'egresos':0,'porCategoria':{}}
        if item['tipo'] in ('gasto','ingreso'):
            key='egresos' if item['tipo']=='gasto' else 'ingresos'
            summary[key]=round(summary[key]-item['monto'],2)
            if item['tipo']=='gasto':
                cat=item['categoria']
                summary['porCategoria'][cat]=round(summary['porCategoria'].get(cat,0)-item['monto'],2)
        return {path:None,summary_path:summary},None
    repository.atomic([path,summary_path],update)
