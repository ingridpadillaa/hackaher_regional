import hashlib
import io
from datetime import date,datetime,timezone
from flask import Blueprint,render_template,request,g,redirect,flash,abort,current_app
from app.auth import login_required
from app.services.firestore_repo import repo,visible_movements
from app.services.categorizer import CATEGORIES,normalize
from app.services.movements import save_movement,delete_movement,validate_movement
from app.services.ocr import analyze_image,demo_receipt
from app.services.llm import ExtractionUnavailable
bp=Blueprint('movimientos',__name__,url_prefix='/movimientos')

@bp.get('')
@login_required
def index():
    movements=visible_movements(g.hogar_id,g.user['uid'])
    for key in ('categoria','integranteId','metodoPago','origen'):
        if request.args.get(key): movements=[m for m in movements if m.get(key)==request.args[key]]
    return render_template('movimientos.html',movements=sorted(movements,key=lambda m:m['fecha'],reverse=True),categories=CATEGORIES,members=repo().list(f'hogares/{g.hogar_id}/integrantes'))

@bp.route('/nuevo',methods=['GET','POST'])
@login_required
def new():
    if request.method=='POST':
        try:
            save_movement(repo(),g.hogar_id,g.user['uid'],dict(request.form,privado=bool(request.form.get('privado'))))
            flash('Listo, tu movimiento quedó guardado.')
            return redirect('/movimientos')
        except ValueError as error: flash(str(error))
    return render_template('movement_form.html',categories=CATEGORIES)

@bp.post('/<movement_id>/borrar')
@login_required
def delete(movement_id):
    item=repo().get(f'hogares/{g.hogar_id}/movimientos/{movement_id}')
    if not item or item['integranteId']!=g.user['uid']: abort(403)
    delete_movement(repo(),g.hogar_id,dict(item,id=movement_id))
    return redirect('/movimientos')

@bp.route('/importar/<kind>',methods=['GET','POST'])
@login_required
def upload(kind):
    if kind not in ('foto','recibo','voz','pdf'): abort(404)
    if request.method=='GET': return render_template('upload.html',kind=kind)
    try:
        receipt=None
        is_demo=bool(request.form.get('example')) and current_app.config['DEMO_MODE']
        if kind in ('foto','recibo'):
            if is_demo: receipt=demo_receipt(kind=='recibo')
            else:
                require_ai_consent()
                if not request.form.get('redacted'): raise ValueError('Confirma que ocultaste nombres, direcciones y números de cuenta en la imagen.')
                upload=request.files.get('file')
                if not upload: raise ValueError('Selecciona una imagen.')
                from PIL import Image
                content=upload.read()
                image=Image.open(io.BytesIO(content))
                if image.format not in ('JPEG','PNG','WEBP') or image.width*image.height>24000000: raise ValueError('Usa una imagen JPG, PNG o WebP de hasta 24 megapíxeles.')
                image.verify()
                receipt=analyze_image(content,Image.MIME[image.format])
            payload=receipt.model_dump(mode='json')
            category=payload['categoria_sugerida'] if payload['categoria_sugerida'] in CATEGORIES else 'Otros'
            rule=repo().get(f'hogares/{g.hogar_id}/reglasCategoria/'+hashlib.sha256(normalize(payload['comercio']).encode()).hexdigest())
            if rule: category=rule['categoria']
            movements=[dict(monto=payload['total'],descripcion=payload['comercio'],comercio=payload['comercio'],fecha=payload['fecha'],tipo='gasto',categoria=category,metodoPago='debito')]
        elif kind=='voz':
            from app.services.voice_parser import parse_voice
            movements=parse_voice(request.form.get('text',''),allow_ai=g.user.get('consentimientos',{}).get('iaDatos',False),demo=current_app.config['DEMO_MODE'])
        else:
            from app.services.pdf_parser import parse_pdf,demo_statement
            if is_demo: movements=demo_statement()
            else:
                require_ai_consent()
                upload=request.files.get('file')
                if not upload: raise ValueError('Selecciona un PDF.')
                movements=parse_pdf(upload.read())
        if not movements: raise ValueError('No encontramos movimientos. Intenta la captura manual.')
        draft=dict(uid=g.user['uid'],origin=kind,movements=movements,receipt=receipt.model_dump(mode='json') if receipt else None,demo=is_demo,created=datetime.now(timezone.utc).isoformat())
        draft_id=repo().add(f'hogares/{g.hogar_id}/borradores',draft)
        return redirect(f'/movimientos/confirmar/{draft_id}')
    except (ValueError, OSError) as error:
        flash(str(error) if isinstance(error,ValueError) else 'No pudimos leer el archivo. Usa una imagen o PDF válido.')
        return redirect(f'/movimientos/importar/{kind}')

def require_ai_consent():
    if not g.user.get('consentimientos',{}).get('iaDatos'): raise ValueError('Activa el consentimiento de IA en Perfil para analizar documentos reales, o usa el ejemplo demo.')

@bp.route('/confirmar/<draft_id>',methods=['GET','POST'])
@login_required
def confirm(draft_id):
    base=f'hogares/{g.hogar_id}'
    path=f'{base}/borradores/{draft_id}'
    draft=repo().get(path)
    if not draft or draft['uid']!=g.user['uid']: abort(404)
    payments=repo().list(base+'/pagosFijos')
    if request.method=='POST':
        if draft.get('confirmed'): return redirect('/movimientos')
        try:
            movements=[]
            for i,item in enumerate(draft['movements']):
                if request.form.get(f'skip_{i}'): continue
                movement=dict(item,monto=request.form.get(f'amount_{i}'),categoria=request.form.get(f'category_{i}'),fecha=request.form.get(f'date_{i}'),metodoPago=request.form.get(f'method_{i}','debito'),cuentaId=request.form.get('account','')[:80])
                validate_movement(movement)
                movements.append(movement)
            receipt=draft.get('receipt')
            if receipt and request.form.get('split'):
                if not receipt['productos'] or abs(sum(p['cantidad']*p['precio_unitario'] for p in receipt['productos'])-receipt['total'])>.02:
                    raise ValueError('El total de productos no coincide con el ticket. Guarda el total o corrige manualmente.')
                if not movements: raise ValueError('Selecciona el movimiento a guardar.')
                original=movements[0]
                movements=[dict(original,monto=p['cantidad']*p['precio_unitario'],descripcion=receipt['comercio']+' · '+p['nombre_normalizado'],categoria=request.form.get(f'product_category_{i}',p['categoria'])) for i,p in enumerate(receipt['productos'])]
            payment_id=request.form.get('payment_id')
            payment=next((p for p in payments if p['id']==payment_id),None)
            if payment_id and not payment: raise ValueError('Ese pago fijo no pertenece a tu hogar.')
            count=0
            for item in movements:
                if payment: item['pagoFijoId']=payment_id
                count+=save_movement(repo(),g.hogar_id,g.user['uid'],item,draft['origin'],deduplicate=True)
            if receipt and movements:
                repo().put(f'{base}/tickets/{draft_id}',dict(tienda=receipt['comercio'],fecha=receipt['fecha'],total=receipt['total'],productos=[dict(nombreOriginal=p['nombre_original'],nombreNormalizado=p['nombre_normalizado'],cantidad=p['cantidad'],precio=p['precio_unitario']) for p in receipt['productos']]))
                if not request.form.get('split'):
                    rule_key=hashlib.sha256(normalize(receipt['comercio']).encode()).hexdigest()
                    repo().put(f'{base}/reglasCategoria/{rule_key}',{'categoria':movements[0]['categoria']})
                for p in receipt['productos']:
                    key=hashlib.sha256((p['nombre_normalizado']+receipt['comercio']+g.hogar_id).encode()).hexdigest()
                    repo().put(f'{base}/preciosTicket/{key}',dict(producto=p['nombre_normalizado'],tienda=receipt['comercio'],precio=p['precio_unitario'],fecha=receipt['fecha'],fuente='ticket',demo=draft['demo']))
                if payment and receipt.get('datos_servicio'):
                    data=receipt['datos_servicio']
                    service=payment.get('datosServicio',{'historial':[]})
                    service['kwhUltimo']=data.get('kwh')
                    service['historial']=[h for h in service['historial'] if h.get('ticketId')!=draft_id]+[dict(periodo=receipt['fecha'],kwh=data.get('kwh'),monto=receipt['total'],ticketId=draft_id)]
                    payment.update(monto=receipt['total'],datosServicio=service,proximaFecha=data.get('fecha_limite') or payment['proximaFecha'])
                    repo().put(f'{base}/pagosFijos/{payment_id}',payment)
            draft['confirmed']=True
            repo().put(path,draft)
            flash(f'{count} movimiento(s) guardado(s). Los duplicados se omitieron.')
            return redirect('/movimientos')
        except ValueError as error: flash(str(error))
    return render_template('confirm.html',draft=draft,categories=CATEGORIES,payments=payments)

@bp.get('/reportes')
@login_required
def reports():
    from app.services.reports import report
    window=request.args.get('periodo','quincena')
    return render_template('reports.html',report=report(visible_movements(g.hogar_id,g.user['uid']),repo().list(f'hogares/{g.hogar_id}/tickets'),window))
