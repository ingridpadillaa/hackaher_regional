import importlib
import os
import secrets
import hmac
from datetime import date
from flask import Flask, request, abort, g, render_template
from itsdangerous import URLSafeTimedSerializer, BadSignature
from .config import settings
from .services.firestore_repo import Repository


def create_app(test_config=None):
    app = Flask(__name__, instance_relative_config=True)
    app.config.update(settings())
    if test_config:
        app.config.update(test_config)
    if app.config['DATA_BACKEND'] == 'firestore':
        import firebase_admin
        if not firebase_admin._apps:
            firebase_admin.initialize_app(options={'projectId': os.getenv('FIREBASE_PROJECT_ID'),
                                                  'storageBucket': os.getenv('FIREBASE_STORAGE_BUCKET')})
    app.extensions['repo'] = Repository(app)
    serializer = URLSafeTimedSerializer(app.secret_key, salt='csrf')

    @app.before_request
    def protect():
        # Signed token bound to the only cookie forwarded by Firebase Hosting.
        import hashlib
        identity = hashlib.sha256(request.cookies.get('__session', '').encode()).hexdigest()
        g.csrf_token = serializer.dumps(identity)
        if request.method in ('POST', 'PUT', 'PATCH', 'DELETE') and not request.path.startswith('/jobs/'):
            token = request.headers.get('X-CSRF-Token') or request.form.get('csrf_token', '')
            try:
                if not hmac.compare_digest(serializer.loads(token, max_age=7200), identity):
                    abort(400)
            except BadSignature:
                abort(400, 'La sesión del formulario venció. Recarga la página.')

    @app.after_request
    def headers(response):
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['Referrer-Policy'] = 'same-origin'
        if not request.path.startswith('/static/'):
            response.headers['Cache-Control'] = 'no-store'
        if not app.config['DEMO_MODE']:
            response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
        return response

    @app.context_processor
    def context():
        return dict(demo_mode=app.config['DEMO_MODE'], today=date.today().isoformat())

    app.jinja_env.filters['money'] = lambda value: f'${float(value or 0):,.2f}'
    for name in ('auth', 'inicio', 'movimientos', 'pagos_fijos', 'mandado', 'calendario', 'perfil', 'copiloto', 'jobs'):
        app.register_blueprint(importlib.import_module(f'app.{name}').bp)

    @app.get('/health')
    def health():
        return {'status': 'ok'}

    @app.get('/sw.js')
    def worker():
        return app.send_static_file('sw.js')

    @app.errorhandler(400)
    @app.errorhandler(403)
    @app.errorhandler(404)
    @app.errorhandler(413)
    def error(err):
        return render_template('error.html', error=err), err.code

    return app
