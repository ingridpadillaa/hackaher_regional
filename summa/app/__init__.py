import hmac
import importlib

from flask import Flask, abort, g, render_template, request
from itsdangerous import BadSignature, URLSafeTimedSerializer

from app.services.clock import local_today

from .config import settings
from .services.firestore_repo import Repository


def create_app(test_config=None):
    app = Flask(__name__, instance_relative_config=True)
    app.config.update(settings(load_file=not (test_config or {}).get("TESTING")))
    if test_config:
        app.config.update(test_config)
    from io import BytesIO

    from flask import Request

    class MemoryRequest(Request):
        def _get_file_stream(self, total_content_length, content_type, filename=None, content_length=None):
            return BytesIO()

    app.request_class = MemoryRequest
    try:
        if app.config["DATA_BACKEND"] == "firestore":
            from .services.firebase_admin_client import initialize

            app.extensions["firebase_admin"] = initialize(app.config)
        app.extensions["repo"] = Repository(app)
    except Exception:
        app.logger.error(
            "No se pudo inicializar Firestore; revisa ADC, GOOGLE_APPLICATION_CREDENTIALS y FIREBASE_PROJECT_ID."
        )
    from .health import check

    check(app)
    from .services.server_session import FirebaseUISessionInterface

    app.session_interface = FirebaseUISessionInterface()
    serializer = URLSafeTimedSerializer(app.secret_key, salt="csrf")

    @app.before_request
    def protect():
        if request.content_length and request.content_length > app.config["MAX_CONTENT_LENGTH"]:
            abort(413)
        if not app.extensions["health"]["ready"] and not request.path.startswith(("/static/", "/health")):
            return render_template("setup.html", health=app.extensions["health"]), 503
        # Signed token bound to the only cookie forwarded by Firebase Hosting.
        import hashlib

        identity = hashlib.sha256(request.cookies.get("__session", "").encode()).hexdigest()
        g.csrf_token = serializer.dumps(identity)
        if request.method in ("POST", "PUT", "PATCH", "DELETE") and not request.path.startswith("/jobs/"):
            token = request.headers.get("X-CSRF-Token") or request.form.get("csrf_token", "")
            try:
                if not hmac.compare_digest(serializer.loads(token, max_age=7200), identity):
                    abort(400)
            except BadSignature:
                abort(400, "La sesión del formulario venció. Recarga la página.")

    @app.after_request
    def headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin-allow-popups"
        response.headers["Permissions-Policy"] = "camera=(self), microphone=(self), geolocation=(self)"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdn.tailwindcss.com https://www.gstatic.com https://apis.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com; frame-src https://*.firebaseapp.com; object-src 'none'; base-uri 'self'; form-action 'self' https://www.chedraui.com.mx"
        )

        if not request.path.startswith("/static/"):
            response.headers["Cache-Control"] = "no-store"
        if app.config["SESSION_COOKIE_SECURE"]:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

    @app.context_processor
    def context():
        from .services.donations import donation_url

        unread = 0
        if getattr(g, "hogar_id", None):
            unread = sum(
                not n.get("leida")
                for n in app.extensions["repo"].list(f"hogares/{g.hogar_id}/notificaciones")
            )
        return dict(
            unread_notifications=unread,
            donation_url=donation_url(),
            firebase_config=app.config["FIREBASE_WEB_CONFIG"],
            gemini_status=app.extensions.get("gemini_status", {}),
            local_mode=app.config.get("LOCAL_MODE")
            or (app.config.get("TESTING") and not app.config.get("TEST_FIREBASE_AUTH")),
            demo_mode=app.config["DEMO_MODE"],
            today=local_today().isoformat(),
        )

    app.jinja_env.filters["money"] = lambda value: f"${float(value or 0):,.2f}"
    for name in (
        "auth",
        "inicio",
        "movimientos",
        "pagos_fijos",
        "mandado",
        "calendario",
        "perfil",
        "copiloto",
        "jobs",
    ):
        app.register_blueprint(importlib.import_module(f"app.{name}").bp)

    @app.get("/health")
    def health():
        if not (app.debug or app.config.get("LOCAL_MODE") or app.config.get("TESTING")):
            from .auth import login_required

            @login_required
            def admin_health():
                if g.user.get("rol") != "admin":
                    abort(403)
                return app.extensions["health"]

            return admin_health()
        return app.extensions["health"]

    @app.get("/sw.js")
    def worker():
        return app.send_static_file("sw.js")

    @app.errorhandler(400)
    @app.errorhandler(403)
    @app.errorhandler(404)
    @app.errorhandler(413)
    def error(err):
        return render_template("error.html", error=err), err.code

    import click

    @app.cli.command("profeco-sync")
    @click.option("--file", "file_path", type=click.Path(exists=True))
    def profeco_sync(file_path):
        from .services.profeco_etl import sync_prices

        try:
            click.echo(sync_prices(app.extensions["repo"], file_path))
        except ValueError as error:
            raise click.ClickException(str(error))

    @app.cli.command("seed-demo")
    @click.option("--email", required=True)
    @click.option("--confirm", is_flag=True)
    @click.option("--reset", is_flag=True)
    def seed_demo_command(email, confirm, reset):
        if not confirm or "@" not in email:
            raise click.ClickException("Se requiere --email de una cuenta aparte y --confirm.")
        from .services.demo_seed import seed_demo

        try:
            uid, hid = seed_demo(app.extensions["repo"], email, reset)
            click.echo(f"Hogar de ensayo creado: {hid}. Cuenta: {uid}. Sin precios ni tiendas.")
        except ValueError as error:
            raise click.ClickException(str(error))

    def register_job(name):
        @app.cli.command(name)
        def command():
            from .jobs import run

            result = run(name)
            click.echo(result)

    for job_name in (
        "sync-banks",
        "provider-health",
        "daily-alerts",
        "evaluar-rachas",
        "generar-recomendaciones",
    ):
        register_job(job_name)

    return app
