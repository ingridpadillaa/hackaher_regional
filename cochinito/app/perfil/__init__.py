from datetime import datetime,timezone
from flask import Blueprint,render_template,g,request,redirect,flash,abort,current_app
from app.auth import login_required
from app.services.firestore_repo import repo
from app.services.bank_sync import connect_bank,queue_sync,disconnect
from app.connectors.base import ProviderUnavailable
bp=Blueprint('perfil',__name__)

@bp.get('/perfil')
@login_required
def index():
    base=f'hogares/{g.hogar_id}'
    return render_template('perfil.html',household=repo().get(base),members=repo().list(base+'/integrantes'),connections=repo().list(base+'/conexiones'),providers=[dict(repo().get(f'estadoProveedores/{name}') or {},name=name) for name in ('syncfy','finerio','simulated')],alerts=repo().list(base+'/alertas'),automation='Banco' if repo().list(base+'/conexiones') else 'PDF' if any(m.get('origen')=='pdf' for m in repo().list(base+'/movimientos')) else 'Manual')

@bp.post('/perfil/conectar')
@login_required
def connect():
    if not request.form.get('consent'): flash('Autoriza la conexión para continuar.'); return redirect('/perfil')
    user=dict(g.user)
    user.pop('uid',None)
    user.setdefault('consentimientos',{}).update(openBanking=True,fecha=datetime.now(timezone.utc).isoformat())
    repo().put(f'usuarios/{g.user["uid"]}',user)
    try:
        connection_id=connect_bank(g.hogar_id,g.user['uid'])
        queue_sync(g.hogar_id,connection_id)
        flash('Conexión creada. La sincronización está en proceso; actualiza la página en unos segundos.')
    except ProviderUnavailable as error: flash(str(error))
    return redirect('/perfil')

@bp.post('/perfil/conexiones/<connection_id>/<action>')
@login_required
def connection_action(connection_id,action):
    connection=repo().get(f'hogares/{g.hogar_id}/conexiones/{connection_id}')
    if not connection or connection.get('uid')!=g.user['uid']: abort(403)
    try:
        if action=='desconectar': disconnect(g.hogar_id,connection_id,bool(request.form.get('delete')))
        elif action=='sincronizar': queue_sync(g.hogar_id,connection_id)
        else: abort(404)
    except ProviderUnavailable: flash('No pudimos revocar la conexión con el proveedor. Reintenta cuando esté disponible.')
    return redirect('/perfil')

@bp.post('/perfil/proveedores/<name>/fallo')
@login_required
def force_failure(name):
    if not current_app.config['DEMO_MODE'] or name not in ('syncfy','finerio','simulated'): abort(404)
    path=f'estadoProveedores/{name}'
    state=repo().get(path) or {}
    state.update(forced=not state.get('forced',False),circuitoAbiertoHasta=0,fallosConsecutivos=0,probeUntil=0)
    repo().put(path,state)
    flash('Fallo simulado activado.' if state['forced'] else 'Proveedor simulado restaurado.')
    return redirect('/perfil')

@bp.post('/perfil/consentimientos')
@login_required
def consent():
    user=dict(g.user)
    user.pop('uid',None)
    user.setdefault('consentimientos',{}).update(iaDatos=bool(request.form.get('ai')),fecha=datetime.now(timezone.utc).isoformat())
    repo().put(f'usuarios/{g.user["uid"]}',user)
    flash('Tus preferencias quedaron guardadas.')
    return redirect('/perfil')

@bp.get('/privacidad')
def privacy():
    return render_template('privacy.html')
