# Cochinito

Python 3.12 + Flask. Modo demo local con SQLite; producción con Firebase.

```sh
cd cochinito
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
flask --app app run --debug --port 5000
```

Abrir http://127.0.0.1:5000. El modo demo no requiere credenciales. Su cookie se permite en HTTP local; en producción `__session` es Secure, HttpOnly y SameSite=Lax.

Para producción configurar `DEMO_MODE=false`, `DATA_BACKEND=firestore`, `SECRET_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_CONFIG` (JSON público del proyecto), credenciales de servicio mediante ADC, `ENCRYPTION_KEY` (Fernet), `CRON_SECRET` y opcionalmente `GEMINI_API_KEY`. No subir `.env` ni credenciales. Docker usa Python 3.12 y `$PORT`.

## Referencias
- [Sesiones Firebase](https://firebase.google.com/docs/auth/admin/manage-cookies)
- [JSON estructurado Gemini](https://ai.google.dev/gemini-api/docs/structured-output)
