from app.services.reports import summarize

def test_report_excludes_transfer():
    items=[dict(fecha='2026-09-20',tipo=kind,monto=amount,categoria='Créditos') for kind,amount in [('gasto',100),('transferencia',100),('ingreso',200)]]
    result=summarize(items,'2026-09-01','2026-10-01')
    assert result['expenses']==100 and result['balance']==100

def test_reports_page(logged):
    assert logged.get('/movimientos/reportes').status_code==200
