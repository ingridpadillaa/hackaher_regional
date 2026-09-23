import time
import uuid
from datetime import timedelta
from functools import wraps
from flask import Blueprint, render_template, request, current_app, redirect, url_for, g, abort, jsonify
from itsdangerous import URLSafeTimedSerializer, BadSignature
from app.services.firestore_repo import repo

bp = Blueprint('auth', __name__, url_prefix='/auth')


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        cookie = request.cookies.get('__session')
        try:
            if current_app.config['DEMO_MODE']:
                uid = URLSafeTimedSerializer(current_app.secret_key, salt='demo').loads(cookie or '', max_age=432000)['uid']
            else:
                from firebase_admin import auth
                uid = auth.verify_session_cookie(cookie or '', check_revoked=True)['uid']
        except Exception:
            return redirect(url_for('auth.login'))
        user = repo().get(f'usuarios/{uid}')
        if not user:
            return redirect(url_for('auth.login'))
        g.user = dict(user, uid=uid)
        g.hogar_id = user.get('hogarId')
        if g.hogar_id and not repo().get(f'hogares/{g.hogar_id}/integrantes/{uid}'):
            abort(403)
        if not g.hogar_id and request.endpoint not in ('inicio.onboarding', 'auth.logout', 'perfil.privacy'):
            return redirect(url_for('inicio.onboarding'))
        return view(*args, **kwargs)
    return wrapped


def session_response(value):
    response = jsonify(ok=True, next='/')
    response.set_cookie('__session', value, max_age=432000, httponly=True,
                        secure=not current_app.config['DEMO_MODE'], samesite='Lax')
    return response


@bp.get('/login')
def login():
    return render_template('login.html', firebase_config=current_app.config['FIREBASE_WEB_CONFIG'])


@bp.post('/session')
def create_session():
    if current_app.config['DEMO_MODE']:
        abort(404)
    from firebase_admin import auth
    try:
        token = request.get_json()['token']
        claims = auth.verify_id_token(token)
        if time.time() - claims['auth_time'] > 300:
            abort(401)
        cookie = auth.create_session_cookie(token, expires_in=timedelta(days=5))
        uid = claims['uid']
        if not repo().get(f'usuarios/{uid}'):
            repo().put(f'usuarios/{uid}', {'nombre': claims.get('name', 'Mi perfil'), 'email': claims.get('email', ''), 'hogarId': None, 'rol': 'admin'})
        return session_response(cookie)
    except (ValueError, KeyError):
        abort(401)


@bp.post('/demo')
def demo():
    if not current_app.config['DEMO_MODE']:
        abort(404)
    uid = uuid.uuid4().hex
    repo().put(f'usuarios/{uid}', {'nombre': 'Rosy', 'email': '', 'hogarId': None, 'rol': 'admin'})
    if request.form.get('seed'):
        from scripts.seed_demo import seed_household
        seed_household(repo(), uid)
    cookie = URLSafeTimedSerializer(current_app.secret_key, salt='demo').dumps({'uid': uid})
    response = redirect('/')
    response.set_cookie('__session', cookie, max_age=432000, httponly=True, secure=False, samesite='Lax')
    return response


@bp.post('/logout')
def logout():
    response = redirect(url_for('auth.login'))
    response.delete_cookie('__session')
    return response
