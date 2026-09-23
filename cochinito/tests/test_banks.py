from app.connectors.router import ProviderRouter
from app.connectors.base import ProviderUnavailable
from app.services.bank_sync import connect_bank,sync_connection
import pytest

def test_failover_and_existing_connection(app):
    repo=app.extensions['repo']
    router=ProviderRouter(repo,demo=True)
    repo.put('estadoProveedores/syncfy',{'forced':True})
    name,_=router.connect('u')
    assert name=='finerio'
    assert repo.get('estadoProveedores/syncfy')['circuitoAbiertoHasta']>0
    with pytest.raises(ProviderUnavailable): router.call('syncfy',lambda p:p.health_check())

def test_sync_idempotent(app):
    with app.app_context():
        repository=app.extensions['repo']
        connection=connect_bank('h','u')
        assert sync_connection('h',connection)
        count=len(repository.list('hogares/h/movimientos'))
        assert sync_connection('h',connection)
        assert len(repository.list('hogares/h/movimientos'))==count
        assert repository.list('hogares/h/pagosFijos')[0]['datosTarjeta']['pagoSinIntereses']==2100

def test_profile(logged):
    assert logged.get('/perfil').status_code==200
