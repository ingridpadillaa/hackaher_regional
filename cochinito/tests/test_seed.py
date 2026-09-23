from scripts.seed_demo import seed_household

def test_seed_idempotent_and_summary(app):
    repo=app.extensions['repo']
    household=seed_household(repo,'test')
    base=f'hogares/{household}'
    movements=repo.list(base+'/movimientos')
    assert len(movements)>90
    assert len(repo.list(base+'/tickets'))==14
    seed_household(repo,'test')
    assert len(repo.list(base+'/movimientos'))==len(movements)
    assert round(sum(m['monto'] for m in movements if m['tipo']=='gasto'),2)==round(sum(s['egresos'] for s in repo.list(base+'/resumenes')),2)

def test_demo_login(logged):
    assert logged.get('/').status_code==200
