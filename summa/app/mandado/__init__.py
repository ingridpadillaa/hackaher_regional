import math

from flask import Blueprint, abort, flash, g, redirect, render_template, request

from app.auth import login_required
from app.services.categorizer import normalize
from app.services.firestore_repo import repo
from app.services.products import product_id, suggestions, update_products
from app.services.replenishment import compare_prices

bp=Blueprint('mandado',__name__,url_prefix='/mandado')


def shopping_data(household_id):
    base=f'hogares/{household_id}'
    products=update_products(repo(),household_id)
    cart=repo().get(base+'/carrito/actual') or {'items':[]}
    predictions=[p for p in suggestions(products) if p['productoId'] not in cart.get('dismissed',[])]
    items=[dict(i,id=i['productoId'],name=i['nombre'],checked=False) for i in cart['items']]
    prices=repo().list(base+'/preciosTicket')
    comparisons,totals=compare_prices(prices,[i['nombre'] for i in cart['items']])
    return dict(items=items,predictions=predictions,comparisons=comparisons,totals=totals,products=products)


@bp.route('',methods=['GET','POST'])
@login_required
def index():
    base=f'hogares/{g.hogar_id}'
    if request.method=='POST':
        name=request.form.get('name','').strip()[:180]
        try:
            quantity=float(request.form.get('quantity',1))
            if not name or not math.isfinite(quantity) or not 0<quantity<=1000:
                raise ValueError()
            pid=product_id(name)
            path=base+'/carrito/actual'
            def update(current):
                cart=current[path] or {'items':[]}
                items=[i for i in cart['items'] if i['productoId']!=pid]
                items.append(dict(productoId=pid,nombre=name,cantidad=quantity,origen='prediccion' if request.form.get('prediction') else 'busqueda'))
                cart['items']=items
                return {path:cart},None
            repo().atomic([path],update)
        except ValueError:
            flash('Revisa el producto y la cantidad.')
        return redirect('/mandado')
    data=shopping_data(g.hogar_id)
    query=normalize(request.args.get('q',''))
    results=[p for p in data['products'] if query and query in normalize(p['nombreNormalizado'])]
    return render_template('mandado.html',**data,results=results,query=request.args.get('q',''))


@bp.post('/<item_id>/borrar')
@bp.post('/<item_id>/toggle')
@login_required
def delete(item_id):
    path=f'hogares/{g.hogar_id}/carrito/actual'
    def update(current):
        cart=current[path] or {'items':[]}
        cart['items']=[i for i in cart['items'] if i['productoId']!=item_id]
        return {path:cart},None
    repo().atomic([path],update)
    return redirect('/mandado')


@bp.post('/<product>/descartar')
@login_required
def dismiss(product):
    path=f'hogares/{g.hogar_id}/carrito/actual'
    def update(current):
        cart=current[path] or {'items':[]}
        cart['dismissed']=list(set(cart.get('dismissed',[])+[product]))
        return {path:cart},None
    repo().atomic([path],update)
    return redirect('/mandado')
