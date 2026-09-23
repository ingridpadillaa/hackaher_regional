import hashlib
from flask import Blueprint,render_template,g,request,redirect,abort,current_app
from app.auth import login_required
from app.services.firestore_repo import repo
from app.services.replenishment import predict,compare_prices
bp=Blueprint('mandado',__name__,url_prefix='/mandado')
BASE_PRODUCTS=['Aceite 1 L','Huevo 12 piezas','Arroz 1 kg','Frijol 1 kg','Leche 1 L']

def shopping_data(household_id):
    base=f'hogares/{household_id}'
    predictions=predict(repo().list(base+'/tickets'))
    items=repo().list(base+'/mandado')
    if not items:
        names=[p['product'] for p in predictions] or BASE_PRODUCTS
        items=[dict(id=hashlib.sha256(name.encode()).hexdigest(),name=name,checked=False,suggested=True) for name in names]
    products=[i['name'] for i in items if not i.get('checked')]
    household=repo().get(base)
    prices=[p for p in repo().list('precios') if (current_app.config['DEMO_MODE'] or p.get('fuente')!='demo') and (not p.get('estado') or p['estado']==household.get('estado'))]
    prices+=repo().list(base+'/preciosTicket')
    comparisons,totals=compare_prices(prices,products)
    return dict(items=items,predictions=predictions,comparisons=comparisons,totals=totals)

@bp.route('',methods=['GET','POST'])
@login_required
def index():
    if request.method=='POST':
        name=request.form.get('name','').strip()[:120]
        if name:
            path=f'hogares/{g.hogar_id}/mandado'
            # Materialize initial suggestions before the first edit.
            if not repo().list(path):
                for item in shopping_data(g.hogar_id)['items']: repo().put(path+'/'+item['id'],item)
            repo().put(path+'/'+hashlib.sha256(name.encode()).hexdigest(),dict(name=name,checked=False))
        return redirect('/mandado')
    return render_template('mandado.html',**shopping_data(g.hogar_id))

@bp.post('/<item_id>/toggle')
@login_required
def toggle(item_id):
    path=f'hogares/{g.hogar_id}/mandado'
    if not repo().list(path):
        for item in shopping_data(g.hogar_id)['items']: repo().put(path+'/'+item['id'],item)
    item=repo().get(path+'/'+item_id)
    if not item: abort(404)
    item['checked']=not item.get('checked')
    repo().put(path+'/'+item_id,item)
    return redirect('/mandado')

@bp.post('/<item_id>/borrar')
@login_required
def delete(item_id):
    repo().delete(f'hogares/{g.hogar_id}/mandado/{item_id}')
    return redirect('/mandado')
