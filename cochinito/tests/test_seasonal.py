from datetime import date
from app.services.seasonal import estimate

def test_seasonal_income_scaling_and_history():
    event=dict(fechaInicio='2026-10-01',fechaFin='2026-10-07',categoria='Hogar',gastoReferencia=1000,ingresoReferencia=20000)
    home=dict(periodicidadIngreso='quincenal',ingresoEstimado=10000)
    result=estimate(event,home,[],date(2026,9,17))
    assert result['weekly']==500
    history=[dict(fecha='2025-10-02',tipo='gasto',categoria='Hogar',monto=400)]
    assert estimate(event,home,history,date(2026,9,17))['weekly']==200

def test_calendar(logged):
    assert logged.get('/calendario').status_code==200
