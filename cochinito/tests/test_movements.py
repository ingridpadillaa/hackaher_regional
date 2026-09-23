from conftest import csrf
from datetime import date
from app.services.movements import save_movement

def test_manual_and_ticket_confirmation(logged):
    token=csrf(logged,'/movimientos/nuevo')
    response=logged.post('/movimientos/nuevo',data=dict(csrf_token=token,monto='85',tipo='gasto',categoria='Comida fuera',fecha=date.today().isoformat(),metodoPago='efectivo',descripcion='Tacos prueba'),follow_redirects=True)
    assert 'Tacos prueba' in response.text
    response=logged.post('/movimientos/importar/foto',data={'csrf_token':token,'example':'1'})
    assert '/confirmar/' in response.location
    assert 'ejemplo simulado' in logged.get(response.location).text
    form=dict(csrf_token=token,amount_0='107',category_0='Súper',date_0=date.today().isoformat(),method_0='debito')
    assert logged.post(response.location,data=form).status_code==302

def test_dedup_is_atomic(app):
    repository=app.extensions['repo']
    movement=dict(monto=100,fecha=date.today().isoformat(),descripcion='Pago TDC',categoria='Créditos',metodoPago='debito')
    assert save_movement(repository,'a','u',movement,deduplicate=True)
    assert not save_movement(repository,'a','u',movement,deduplicate=True)
    assert repository.list('hogares/a/resumenes')[0]['egresos']==0
