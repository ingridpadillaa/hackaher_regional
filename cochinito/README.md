# Cochinito

Copiloto financiero del hogar para HackaTec 2026 / HackaHer. Flask + Jinja + Tailwind + Alpine + Chart.js, con Firebase en producción y una demo local sin credenciales.

## Ejecutar localmente

Desde la carpeta `cochinito`:

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
flask --app app run --debug --port 5055
```

Abrir **http://127.0.0.1:5055** y elegir **Conocer el Hogar Medina**. Cada entrada demo crea un hogar aislado con cuatro meses de movimientos, 14 tickets, pagos y precios ficticios. Para probar onboarding usa **Crear mi hogar demo**. La sesión local se conserva entre reinicios; sus claves se generan en `instance/` (ignorado por Git).

En este workspace ya existe un entorno en `../.venv`; puedes arrancar directamente con:

```sh
../.venv/bin/python -m flask --app app run --port 5055
```

Python objetivo: **3.12** (Docker y CI). Verificación local realizada con Python **3.13.7**. No se ejecutó Docker en este equipo.

## Qué incluye

- Onboarding en cinco pasos, creación/unión a hogares por código y QR, perfil y consentimientos.
- Presupuesto diario, salud financiera, próximos pagos, ahorro y temporadas.
- Movimientos manuales editables, categorías, filtros y privacidad por integrante.
- Ticket y recibo con confirmación, división por producto, aprendizaje de categoría y precios del hogar.
- Voz del navegador (si está disponible), captura por texto y PDF con revisión antes de importar.
- Reportes por periodo, dona, barras, gastos hormiga, crecimiento e inflación personal.
- Banco de prueba, tarjetas, sincronización idempotente, cifrado Fernet y failover persistente.
- Pagos fijos, registro de pago atómico, recurrencias, alertas y estimación de electricidad.
- Mandado compartido, reposición por tickets y comparación de precios con fuente/fecha.
- ETL de CSV/ZIP/XLSX con validación, huella, filtros geográficos y lotes de 400 escrituras.
- Calendario mexicano, apartados semanales y copiloto con ocho herramientas de lectura/cálculo.
- PWA con caché **solo de estáticos**, CSRF, cabeceras, reglas Firebase, exportación y borrado de datos.

Los reportes y el presupuesto usan movimientos visibles para la persona. Los movimientos privados de otros integrantes no se incluyen ni se revelan mediante alertas.

## Simulación e integraciones

| Servicio | Estado sin credenciales | Configuración real |
| --- | --- | --- |
| Persistencia | SQLite local a través de `firestore_repo.py` | `DATA_BACKEND=firestore` y ADC |
| Inicio de sesión | Cookie demo firmada, hogar aislado | Firebase correo/contraseña y Google |
| Gemini | Ejemplos explícitos de documentos y parser local de voz; copiloto determinista | `GEMINI_API_KEY`, modelo configurable y consentimiento |
| Bancos | Syncfy y Finerio del panel **también son simulaciones**, respaldadas por Banco de prueba | Adaptadores reales deshabilitados; TODO validar sandbox, widget, callbacks y esquemas |
| Precios | Semilla con `fuente=demo`; jamás se presenta como PROFECO real | Archivo oficial local o descubrimiento del portal |
| Despliegue | No desplegado | Docker, Cloud Run y configuración de Firebase incluidas |

No se inventaron endpoints bancarios. Los adaptadores reales fallan de forma controlada hasta completar el contrato con cada proveedor. `RECORD_RESPONSES` queda reservado para cuando existan respuestas reales validadas; no se grabaron datos bancarios reales.

El copiloto con Gemini selecciona funciones permitidas; Python ejecuta y presenta los resultados. Así, las cifras visibles no dependen de texto generado. Sin Gemini responde a las sugerencias de la demo con las mismas herramientas. Los simuladores también están disponibles en `POST /copiloto/simular` (sesión y CSRF requeridos).

Los archivos se procesan en memoria en modo local. En Firestore, se suben temporalmente a Cloud Storage y se eliminan en `finally`. Antes de enviar imágenes a Gemini la interfaz exige ocultar datos personales; el PDF elimina líneas de identidad, correos y números largos. Esta depuración no reemplaza la revisión del documento por la persona.

## Pruebas y calidad

```sh
pip install -r requirements-dev.txt
python -m pytest -q
ruff check --config pyproject.toml --select E4,E7,E9,F,I app scripts tests
ruff format --config pyproject.toml app scripts tests
djlint app/templates --profile=jinja --reformat
```

Prueba de navegador en macOS con Chrome instalado y servidor activo en 5055:

```sh
python scripts/browser_smoke.py
```

El script crea datos demo, recorre las pantallas en 390 px y escritorio, verifica ausencia de desbordamiento horizontal y guarda capturas en `/tmp/cochinito-*.png`. No usa credenciales de servicios reales.

## Semilla y PROFECO

```sh
python -m scripts.seed_demo --uid demo-cli
python -m scripts.seed_demo --uid demo-cli --reset
flask --app app profeco-sync --file /ruta/al/archivo-oficial.csv
flask --app app profeco-sync
```

`--reset` solo reemplaza el hogar `demo-<uid>` indicado y se limita a `DEMO_MODE=true`. La interfaz crea otra semilla al iniciar una nueva sesión demo; el UID de la sesión puede consultarse en la exportación personal.

`data/seed/precios_demo.csv` es exclusivamente un **fixture sintético para pruebas de formato**, no una descarga oficial. La demo normal no lo importa como PROFECO. El ETL conserva identidad de producto/presentación/marca y tienda; la comparación exige nombres coincidentes. TODO verificar el diccionario anual vigente, la cobertura de nombres de productos y el enlace real del portal antes de cargar datos de producción.

## Firebase y Cloud Run

1. Crear el proyecto y habilitar Authentication (Email/Password y Google), Firestore y Storage.
2. Copiar el JSON público de configuración web a `FIREBASE_WEB_CONFIG`. Configurar dominios autorizados de Authentication.
3. Establecer `DEMO_MODE=false`, `DATA_BACKEND=firestore`, `SECRET_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `ENCRYPTION_KEY` y `CRON_SECRET` con Secret Manager. Usar ADC del servicio en Cloud Run; no incluir archivos de cuenta de servicio en el contenedor.
4. Generar secretos con `python -c 'import secrets; print(secrets.token_hex(32))'` y la clave Fernet con `python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'`. Guardarlos fuera de Git.
5. Construir desde `cochinito/`; el Dockerfile escucha `$PORT` con Gunicorn. Ajustar el servicio/región en `firebase.json` y desplegar reglas y Hosting con Firebase CLI usando el proyecto elegido.
6. Configurar una política de ciclo de vida de un día en `uploads/` como respaldo si falla la eliminación inmediata. El job diario elimina sesiones de interfaz vencidas; configurar también limpieza de borradores antiguos.
7. Completar el aviso de privacidad (responsable, domicilio, contacto ARCO) y validar reglas con los emuladores antes de abrir a datos reales.

La cookie de autenticación se llama **`__session`**, con HttpOnly, Secure y SameSite=Lax en producción. Los mensajes de interfaz se guardan en servidor asociados a esa cookie; no dependen de una segunda cookie que Hosting descartaría. Las escrituras de negocio pasan por Flask/Admin SDK y sus validaciones. Las reglas de cliente bloquean roles, membresía, resúmenes, secretos y estado de proveedores.

La demo SQLite es para desarrollo local. Cloud Run requiere Firestore: no usar SQLite como almacén compartido de varias instancias.

## Jobs

Todos requieren `X-Cron-Secret` y cuentan con exclusión mutua persistente. Configurar Cloud Scheduler con zona **America/Monterrey**:

| Endpoint POST | Cron |
| --- | --- |
| `/jobs/profeco-sync` | `0 3 * * *` |
| `/jobs/sync-banks` | `0 */6 * * *` |
| `/jobs/provider-health` | `*/5 * * * *` |
| `/jobs/daily-alerts` | `0 8 * * *` |

En demo, un hilo local procesa una conexión recién creada. En Cloud Run, el job de sincronización procesa las conexiones pendientes/activas. TODO incorporar una cola de tareas para disparo inmediato en producción y OIDC de Scheduler además del secreto. Para volúmenes grandes de PROFECO, ejecutar la carga local; la versión HTTP limita su ventana de trabajo y devuelve pendiente ante fallo.

## Documentos

- [Guion de demo](docs/DEMO.md)
- [Estado de fases y límites de validación](docs/ESTADO.md)
- [Sesiones Firebase](https://firebase.google.com/docs/auth/admin/manage-cookies)
- [Gemini: JSON estructurado](https://ai.google.dev/gemini-api/docs/structured-output) y [function calling](https://ai.google.dev/gemini-api/docs/function-calling)
- [Referencia oficial Syncfy](https://github.com/Paybook/sync-rest) y [Finerio](https://www.finerioconnect.com/en/products/open-finance-in-a-box)
- [Portal PROFECO](https://datos.profeco.gob.mx/datos_abiertos/)
- [Texto vigente de la LFPDPPP](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf). El aviso incluido es un borrador para el prototipo, no una validación legal.
