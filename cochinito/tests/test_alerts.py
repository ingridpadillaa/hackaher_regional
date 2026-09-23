from datetime import date
from app.services.recurrence import detect_recurrences
from app.services.alerts import build_alerts

def test_recurrence_and_increase():
    movements=[dict(tipo='gasto',comercio='Netflix',descripcion='Netflix',monto=amount,fecha=day,categoria='Suscripciones') for day,amount in [('2026-08-05',219),('2026-09-05',249)]]
    assert detect_recurrences(movements)[0]['increased']
    assert any(a['tipo']=='suscripcion' for a in build_alerts(movements,[]))

def test_private_alert_does_not_leak():
    item=dict(tipo='gasto',comercio='Privado',descripcion='Privado',monto=100,fecha='2026-09-20',categoria='Salud',privado=True)
    assert not build_alerts([item,item],[],date(2026,9,23))

def test_payments_page(logged):
    assert logged.get('/pagos-fijos').status_code==200
