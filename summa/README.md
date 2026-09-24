# Summa · Jami
Aplicación Flask del hogar. Cuentas nuevas vacías; no se simulan recibos ni precios.

## Desarrollo
Python 3.12. Crea un entorno virtual, instala `requirements.txt`, copia `.env.example` a `.env` y configura `FLASK_SECRET_KEY` (secreto aleatorio persistente).
Para trabajar sin Firebase activa explícitamente `LOCAL_MODE=true`; SQLite local no se usa como sustituto silencioso de Firestore. `DEMO_MODE=true` habilita únicamente el banco de prueba.
Arranque: `flask --app app run --host 0.0.0.0 --port 5055`. En el celular abre la IP LAN de la computadora en el mismo Wi-Fi. Para HTTPS utiliza un túnel ngrok o Cloudflare Tunnel y agrega su dominio a Firebase Authentication.
Producción: `gunicorn 'app:create_app()' --bind 0.0.0.0:8080` o Docker. Configura Firebase Auth (Google/correo), Firestore Spark, credenciales ADC o GOOGLE_APPLICATION_CREDENTIALS, FIREBASE_PROJECT_ID y FIREBASE_WEB_CONFIG. El JSON web incluye apiKey, authDomain, projectId y appId. Nunca subas credenciales al repositorio.

## Firebase
Desde este directorio: `firebase deploy --only firestore:rules,firestore:indexes`.
Los accesos de escritura pasan por Flask para proteger membresías, importes y resúmenes atómicos. Las reglas del cliente limitan lectura al hogar y bloquean secretos. `/health` muestra configuración faltante en desarrollo o a administradores autenticados.
No se usa Storage ni servicios que requieran Blaze. Fotos y documentos se reciben en memoria (máximo 10 MB) y se descartan. Solo se guardan datos confirmados. PROFECO se almacena en SQLite local.

## Integraciones
GEMINI_API_KEY y consentimiento explícito habilitan Jami. Sin llave aparece un mensaje de indisponibilidad con captura manual. Syncfy/Finerio necesitan credenciales y contratos verificados; sus adaptadores no inventan respuestas.
Logo oficial pendiente de entrega. Las ilustraciones originales de Jami están en `app/static/img/`; el nombre Summa se muestra como texto.
Auditoría de datos retirados: `docs/AUDITORIA_DATOS.md`.

## Verificación
`python -m pytest -q`. Las pruebas usan una base temporal y fixtures aislados; nunca la base real.

Proveedor alternativo opcional: instala `openai`, configura `LLM_PROVIDER=openai`, `OPENAI_API_KEY` y `OPENAI_MODEL` compatible con visión y Structured Outputs. Extracción mediante Responses parse con Pydantic y store=false; referencia: https://developers.openai.com/api/docs/guides/structured-outputs . El chat con function calling utiliza Gemini.
