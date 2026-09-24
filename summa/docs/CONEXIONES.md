# Firebase y Gemini: conexión y prueba local

La app lee el `.env` existente en la raíz del repositorio, sin copiar sus valores a otros archivos. También admite la raíz de HackHerRegio y, como compatibilidad, `summa/.env`; solo se lee el primero encontrado. `ENV_FILE` permite indicar otra ruta. Las variables ya presentes en el proceso tienen prioridad. No pegues secretos en comandos ni los agregues a Git.

Firebase puede utilizar Blaze. El frontend carga únicamente Firebase Authentication modular desde gstatic; no se necesita `npm install firebase`, Analytics ni Storage para este flujo. Las fotos siguen procesándose en memoria.

## Variables

Obligatorias: `FLASK_SECRET_KEY`, `FIREBASE_PROJECT_ID`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `ENCRYPTION_KEY`; para web: `FIREBASE_WEB_API_KEY`, `FIREBASE_WEB_AUTH_DOMAIN`, `FIREBASE_WEB_APP_ID`. `FIREBASE_WEB_PROJECT_ID` puede omitirse para reutilizar `FIREBASE_PROJECT_ID` y, si se declara, debe coincidir.

`GOOGLE_APPLICATION_CREDENTIALS` apunta al archivo de cuenta de servicio existente. Una ruta relativa se resuelve respecto al directorio del `.env`. Sin esta variable se utilizan Application Default Credentials (ADC), apropiadas para Cloud Run con su cuenta de servicio. El proyecto siempre es explícito; el Admin SDK se inicializa una sola vez por proceso.

Compatibilidad: se admite `SECRET_KEY` como alias anterior de `FLASK_SECRET_KEY`, y el antiguo JSON `FIREBASE_WEB_CONFIG`. Los campos separados `FIREBASE_WEB_*` tienen prioridad y solo sus campos públicos permitidos se inyectan en HTML. Nunca se envían al navegador credenciales Admin ni Gemini.

Opcionales: `FIREBASE_WEB_STORAGE_BUCKET`, `FIREBASE_WEB_MESSAGING_SENDER_ID`, `FIREBASE_WEB_MEASUREMENT_ID`. No activan Storage ni Analytics. `CRON_SECRET` es obligatorio únicamente para ejecutar jobs por HTTP. Las variables de bancos, PROFECO, donativos y OpenAI son opcionales para el recorrido manual/ticket.

`GEMINI_MODEL` no tiene valor predeterminado. En cada arranque se consultan los modelos que admiten generateContent. Si falta el modelo o no aparece, `/health` y la pantalla de captura muestran un diagnóstico con los modelos disponibles; el registro manual sigue funcionando. Texto tiene timeout de 15 segundos y visión de 30 segundos por intento; la extracción validada permite dos intentos en total.

## Preparación en Firebase Console

1. Authentication → Sign-in method: habilita Google y Email/Password. Configura el correo de soporte solicitado por Google.
2. Authentication → Settings → Authorized domains: agrega `localhost` y el dominio que uses. Abre la app siempre con el mismo host; para estos pasos usa localhost.
3. Crea Cloud Firestore, base `(default)`, en el proyecto configurado. La cuenta de servicio necesita permisos para datos de Firestore y para leer usuarios y crear/verificar cookies de sesión en Firebase Auth. El script comprueba lectura de usuarios; la creación de cookies se confirma al iniciar sesión.
4. Reemplaza las llaves que fueron pegadas en el chat mediante IAM/AI Studio y actualiza únicamente tu archivo local. No guardes el JSON de credenciales en Git.

## Comandos exactos

Desde Terminal:

```sh
cd /Users/rosyherrerat/Desktop/HackHerRegio/hackaher_regional
source .venv/bin/activate
cd summa
python scripts/check_connections.py
```

Si el `.env` está en otra ubicación:

```sh
ENV_FILE=/ruta/al/archivo/.env python scripts/check_connections.py
```

El script imprime solo nombres y estados. Compara las variables con `.env.example`, crea/lee/borra `_healthcheck/prueba`, lista como máximo un usuario sin imprimirlo y envía a Gemini únicamente «responde OK». Si `_healthcheck/prueba` ya existe, no lo sobrescribe. Si no puede eliminar su propio documento, informa FALLA. La ausencia de SQLite genera AVISO y no bloquea las demás comprobaciones. Código de salida 0 significa que las comprobaciones obligatorias pasaron.

Para reglas e índices, desde `summa/`, selecciona el proyecto correcto con Firebase CLI y ejecuta:

```sh
firebase login
firebase use --add
firebase deploy --only firestore:rules,firestore:indexes
```

Las reglas protegen pertenencia al hogar y movimientos privados. Los secretos, estado de proveedores y `_healthcheck` están cerrados al cliente. Las escrituras del hogar y movimientos pasan por Flask/Admin SDK para validar membresías, importes, deduplicación y resúmenes atómicos; no se habilitan escrituras directas del navegador. Los índices incluyen integrante/fecha, categoría/fecha, privado/fecha y notificación leída/fecha. El Admin SDK usa IAM y no estas reglas. No se han desplegado reglas automáticamente ni ejecutado el emulador.

Arranca una instancia nueva, distinta de los servidores locales anteriores:

```sh
LOCAL_MODE=false DEMO_MODE=false APP_ENV=development FLASK_SKIP_DOTENV=1 python -m flask --app app run --host 127.0.0.1 --port 5057
```

Si usaste `ENV_FILE`, agrega esa misma variable a este comando. Abre **http://localhost:5057/auth/login**. En HTTP local la cookie `__session` es HttpOnly y SameSite=Lax, sin Secure; con `APP_ENV=production` o Cloud Run se fuerza Secure. No uses el servidor de desarrollo en producción.

## Recorrido de punta a punta

1. Pulsa **Continuar con Google** y autoriza la ventana emergente. El ID token se intercambia por `__session`; una cuenta nueva llega a **Crea tu hogar**. No se usa una cuenta de ejemplo.
2. Completa hogar, municipio e integrantes. Agrega ingreso, periodicidad y próxima fecha de cobro. Captura pagos habituales y, si quieres, una meta.
3. En Privacidad, acepta el aviso y activa el consentimiento opcional de IA para probar el ticket. Guarda. Debe abrirse Inicio con el disponible y su desglose.
4. **Registrar gasto → Manual**: elige monto, categoría, fecha y método. Guarda y comprueba el registro en Movimientos y el cambio en Inicio.
5. **Registrar gasto → Ticket**: usa una foto JPG/PNG/WebP legible, de menos de 10 MB. Oculta datos personales, confirma la casilla y pulsa Analizar. Revisa importe, fecha, productos y categoría; acepta o corrige. Confirma que aparece en Movimientos. Las compras con crédito se reflejan en reportes y en el pago de tarjeta, no como salida inmediata de efectivo.
6. Si Gemini falla, debe aparecer el aviso de indisponibilidad con enlace a **captura manual**. Los datos ya guardados permanecen.
7. **Perfil → Cerrar sesión**: vuelve al login; abrir Inicio debe pedir acceso. Inicia de nuevo con Google: el hogar completo debe abrir Inicio.
8. Prueba **Crear cuenta** con otro correo, **Iniciar sesión** y **Olvidé mi contraseña**. La recuperación solicita solo el correo y muestra un mensaje que no revela si la cuenta existe.

## Verificaciones automáticas

```sh
python -m pytest -q
ruff check --config pyproject.toml --select E4,E7,E9,F,I app scripts tests
```

Las pruebas usan credenciales ficticias y mocks de SDK; no hacen llamadas reales ni escriben en Firestore. La prueba Google popup y la lectura de un ticket real deben realizarse en el navegador con tu cuenta.

Referencias oficiales: [Firebase Admin](https://firebase.google.com/docs/admin/setup), [cookies de sesión](https://firebase.google.com/docs/auth/admin/manage-cookies), [autenticación por correo](https://firebase.google.com/docs/auth/web/password-auth), [listado de modelos Gemini](https://ai.google.dev/api/models).
