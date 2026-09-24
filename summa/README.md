# Summa · Jami
Aplicación Flask del hogar. Cuentas nuevas vacías; no se simulan recibos ni precios.

Consulta primero [la guía de conexión Firebase/Gemini y prueba local](docs/CONEXIONES.md). El `.env` real se lee de la raíz; no se copia al proyecto ni a `.env.example`.

## Desarrollo
Python 3.12. Crea un entorno virtual, instala `requirements.txt`, usa el `.env` existente de la raíz y configura `FLASK_SECRET_KEY` (secreto aleatorio persistente).
Para trabajar sin Firebase activa explícitamente `LOCAL_MODE=true`; SQLite local no se usa como sustituto silencioso de Firestore. `DEMO_MODE=true` habilita únicamente el banco de prueba.
Arranque: `flask --app app run --host 0.0.0.0 --port 5055`. En el celular abre la IP LAN de la computadora en el mismo Wi-Fi. Para HTTPS utiliza un túnel ngrok o Cloudflare Tunnel y agrega su dominio a Firebase Authentication.
Producción: `gunicorn 'app:create_app()' --bind 0.0.0.0:8080` o Docker. Configura Firebase Auth (Google/correo), Firestore Spark, credenciales ADC o GOOGLE_APPLICATION_CREDENTIALS, FIREBASE_PROJECT_ID y las variables FIREBASE_WEB_*. El JSON web anterior sigue siendo compatible. Nunca subas credenciales al repositorio.

## Firebase
Desde este directorio: `firebase deploy --only firestore:rules,firestore:indexes`.
Los accesos de escritura pasan por Flask para proteger membresías, importes y resúmenes atómicos. Las reglas del cliente limitan lectura al hogar y bloquean secretos. `/health` muestra configuración faltante en desarrollo o a administradores autenticados.
No se usa Storage ni servicios que requieran Blaze. Fotos y documentos se reciben en memoria (máximo 10 MB) y se descartan. Solo se guardan datos confirmados. PROFECO se almacena en SQLite local.

## Integraciones
GEMINI_API_KEY, GEMINI_MODEL y consentimiento explícito habilitan Jami. Sin llave aparece un mensaje de indisponibilidad con captura manual. Syncfy/Finerio necesitan credenciales y contratos verificados; sus adaptadores no inventan respuestas.
Logo oficial pendiente de entrega. Las ilustraciones originales de Jami están en `app/static/img/`; el nombre Summa se muestra como texto.
Auditoría de datos retirados: `docs/AUDITORIA_DATOS.md`.

## Verificación
`python -m pytest -q`. Las pruebas usan una base temporal y fixtures aislados; nunca la base real.

Proveedor alternativo opcional: instala `openai`, configura `LLM_PROVIDER=openai`, `OPENAI_API_KEY` y `OPENAI_MODEL` compatible con visión y Structured Outputs. Extracción mediante Responses parse con Pydantic y store=false; referencia: https://developers.openai.com/api/docs/guides/structured-outputs . El chat con function calling utiliza Gemini.

## Mantenimiento sin servicios Blaze
Ejecuta desde este directorio con `flask --app app` seguido de:
- `seed-demo --email CUENTA --confirm` (cuenta de ensayo aparte; `--reset` solo para esDemo).
- `profeco-sync --file RUTA` (CSV, ZIP o XLSX oficial); sin `--file`, descubre el archivo anual en el portal PROFECO.
- `sync-banks`, `provider-health`, `daily-alerts`, `evaluar-rachas`, `generar-recomendaciones`.
Los jobs operativos tienen también `POST /jobs/NOMBRE` con `X-Cron-Secret`. El seed destructivo se mantiene exclusivamente como CLI con confirmación. No programes llamadas a jobs sin el secreto. Las tareas son repetibles y usan bloqueos persistidos.

En Render usa el blueprint `summa/render.yaml` desde la raíz del repo y agrega credenciales como secretos del entorno. Su disco gratuito es efímero: la base de precios necesita recarga tras reinicios; Firestore conserva los datos de hogares. Para demo estable se recomienda ejecución local. No hay requisitos de Cloud Storage, Cloud Run, Scheduler ni Secret Manager.

Configuración de supermercados: `data/supermercados.json` solo guarda destinos oficiales; no precios ni sucursales. La búsqueda Chedraui fue verificada. Para VTEX, completa SKU reales por producto; sin todos los SKU, el botón abre una búsqueda y permite copiar la lista. Compara solo con ≥70% de cobertura, marca los faltantes estimados y muestra hasta tres sucursales.

Consulta `docs/ESTADO.md` para las verificaciones realizadas y las integraciones pendientes, y `docs/DEMO.md` para el recorrido. Para usar el adaptador alternativo OpenAI instala opcionalmente su SDK; no es necesario para el flujo Gemini.
