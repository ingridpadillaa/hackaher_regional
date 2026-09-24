# Summa · Jami

Plataforma del hogar con **React + Vite + TypeScript + Tailwind CSS**, conectada mediante funciones autenticadas a Firebase. Interfaz en español de México, basada en las cinco diapositivas de `HackHer Regional UI - UX.pdf` y en las indicaciones del equipo.

## Actualización · fases 1–3

El modelo vigente es [versión 2](MODELO_DATOS.md). El reporte mensual diferencia ingresos recibidos habituales/adicionales, gastos y transferencias; el presupuesto es un límite independiente. Los ingresos de perfiles son previsiones. Las metas admiten aportaciones/retiros declarados y una racha semanal sin exigir conexión bancaria. La evidencia bancaria sigue separada y no se simula. La agenda permite programar y confirmar cobros, pagos y aportaciones; la confirmación se registra de forma idempotente.

La interfaz usa fondos arena, Jami circular sin nombre fuera del chat y Perfil sin las tarjetas de estilo de vida, prioridades duplicadas ni personalización del asistente. El historial y la gráfica comparten el mes seleccionado. Las descripciones históricas de racha exclusivamente bancaria y presupuesto basado en ingreso de las secciones siguientes quedan sustituidas por este modelo. Esta actualización se verificó en emuladores y no se ha desplegado a producción.

## Estado

La aplicación React está implementada en `frontend/` y el backend TypeScript en `backend/functions/`. Compila y su recorrido principal se probó en Chrome móvil con Firebase Emulator Suite. El despliegue a `hackaher` **no se ejecutó: el permiso para publicar fue rechazado**. La versión Python permanece en `backend/app/` como referencia histórica; no participa en el build de React.

## Cuatro módulos

El acceso sigue **crear cuenta/iniciar sesión → crear o unirse a un hogar → personalizar → Inicio**. Los perfiles incluyen nombre, edad, parentesco, estudios, ocupación, ingreso y periodicidad. La personalización es persistente: al regresar, una cuenta completa abre Inicio. La barra inferior aparece después del onboarding y contiene exactamente cuatro destinos.

| Módulo    | Implementación                                                                                                                                                                                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inicio    | Presupuesto mensual, gastos por categoría, calendario con la próxima fecha relevante, historial por mes y campana que abre un panel lateral. Alertas de presupuesto y recomendaciones de ahorro; pronósticos solo cuando hay historial comparable. |
| Carrito   | Búsqueda en el catálogo, lista persistente, selección, cantidades y comparación de hasta tres tiendas. Incluye Aurrera, Walmart y H‑E‑B con enlaces oficiales.                                                                                     |
| Simulador | Creación/edición de metas con título y monto, barra de progreso y simulación de aportes diarios, semanales o mensuales. Racha calculada únicamente a partir de evidencia bancaria verificada.                                                      |
| Perfil    | Integrantes, estudios, trabajo e ingresos, estilo de vida, prioridades, tono de Jami, notificaciones y consentimientos. La persona administradora edita la configuración compartida.                                                               |

**Registrar movimiento** abre un modal con gasto/ingreso. Manual permite monto, categoría y nota; PDF permite subir un archivo; Audio permite grabar y editar la transcripción; Ticket permite abrir la cámara o elegir una foto. La IA propone categorías para métodos no manuales y requiere confirmación antes del guardado. Todos los movimientos confirmados aparecen en el historial. Montos en MXN, aunque el ejemplo visual del PDF use otro símbolo.

Las cifras y personas de las diapositivas son ejemplos visuales y no se cargan como datos de usuario. El logo se muestra desde una imagen original extraída del PDF; las ilustraciones de Jami reutilizan los recursos existentes del proyecto.

## Firebase

- Proyecto: **`hackaher`**, plan **Blaze**.
- Firestore: **`(default)`**, ubicación **`nam5`**, verificada.
- Functions: segunda generación, Node.js 22, región `us-central1`, máximo 3 instancias.
- Hosting: `frontend/dist`, HTTPS y reescritura de rutas a `index.html`.
- Authentication: correo/contraseña habilitado; dominios `localhost`, `hackaher.web.app` y `hackaher.firebaseapp.com` verificados. El botón Google requiere que el proveedor Google también esté habilitado; ese flujo no se ha probado con una cuenta real.
- Se habilitó Secret Manager y se guardó la llave sandbox de Syncfy en `SUMMA_INTEGRATIONS`.

La función callable `api` comprueba identidad, pertenencia al hogar y autorización en cada operación. Las escrituras de movimientos son idempotentes por identificador de solicitud. Firestore niega todo acceso directo del navegador: React usa Functions, y estas usan Admin SDK con comprobaciones explícitas. No se envían credenciales Admin al frontend.

El nuevo esquema comparte `usuarios` y `hogares`, con subcolecciones `members`, `movements`, `goals`, `cart`, `drafts`, `bankEvidence`, `notifications` y `readNotifications`. Usa `invitations`, `bankConnections`, `rateLimits` y `products` como colecciones de backend. **No hay migración automática de datos de la versión Flask**; esta implementación se preparó para el proyecto sin datos reales indicado por el equipo.

## Desarrollo local

Requisitos: Node.js 22, npm, Firebase CLI y Java compatible con el emulador Firestore. En esta computadora las pruebas se ejecutaron con Node.js 24; el runtime de despliegue está fijado a 22.

Desde la raíz del repositorio:

```sh
npm ci
cp frontend/.env.example frontend/.env.local
```

Completa en `frontend/.env.local` la configuración pública de la app web Firebase. **No agregues secretos a variables `VITE_*`: se incluyen en el navegador.** La configuración pública local de `hackaher` ya se descargó durante la preparación y no se versiona.

Para trabajar con datos aislados, en dos terminales:

```sh
npm run build --workspace backend/functions
npm run emulators
```

```sh
VITE_USE_EMULATORS=true npm run dev --workspace frontend -- --port 5173
```

Abre `http://127.0.0.1:5173`. Los emuladores usan el proyecto ficticio `demo-summa`: Auth en 9099, Firestore en 8085, Functions en 5001 y consola local en 4000. Para pruebas sin proveedores externos, `backend/functions/.secret.local` debe contener `SUMMA_INTEGRATIONS={}`. Este archivo está ignorado por Git. La prueba explícita de Syncfy requiere el secreto sandbox local.

## Integraciones y límites actuales

### Gemini: captura PDF, audio y ticket

El flujo y la validación están implementados, pero **falta configurar y probar la clave y el modelo de Gemini**. El backend lee `geminiKey` y `geminiModel` del secreto JSON `SUMMA_INTEGRATIONS`, equivalentes a `GEMINI_API_KEY` y `GEMINI_MODEL` en la versión anterior. Sin ellos se informa la indisponibilidad y el registro manual continúa funcionando.

Se aceptan archivos de hasta 10 MB; el backend valida tipo, firma y tamaño. Los originales se procesan en memoria. Solo se guarda el resultado extraído como borrador de confirmación, con vencimiento de una hora. Los archivos no se suben a Storage. El borrado automático por TTL de borradores vencidos y contadores `rateLimits` deberá habilitarse en Firestore antes de un uso sostenido; la autorización ya rechaza borradores vencidos.

### Syncfy/Paybook: sandbox

La llave proporcionada se validó con una consulta al API oficial. También se comprobó en Chrome que una sesión creada por el backend abre el widget oficial sin errores; la sincronización completa de una institución aún no se ha recorrido. El backend crea un usuario seudónimo por cuenta y entrega solo un token de sesión breve al widget oficial, que recibe directamente las credenciales de la institución. Summa no captura contraseñas bancarias.

`connectBank` abre la sesión; `syncBank` consulta cuentas/transacciones y conserva únicamente conteos y estado de la prueba. Todo se etiqueta **Sandbox · Datos de prueba**. No se importan saldos de prueba al presupuesto ni se adjudican días de racha o aportes a metas con esos datos.

**Pendiente para banca real:** contrato/llave de producción, validación de tipos de cuenta y transferencias, importación paginada, sincronización diaria y conciliación del ahorro. El cálculo de racha está probado con evidencia aislada, pero todavía no existe una fuente productiva que escriba esa evidencia ni alimente el avance real de las metas.

### Carritos y precios

El catálogo `products` debe cargarse desde datos reales. Cada producto incluye `name`, `searchName` en minúsculas, `unit` y `offers` por tienda (`aurrera`, `walmart`, `heb`), con `price`, `date`, `source`, `municipality` y, opcionalmente, `productUrl` oficial. Solo se comparan listas completas con precios de hasta 30 días del municipio del hogar. No se inventan precios ni se clasifican como más baratas tiendas sin datos.

**Pendiente:** cargar el catálogo/PROFECO y obtener integraciones verificadas para transferir carritos completos. Por ahora, los botones permiten copiar la lista y abrir el sitio oficial, y lo explican expresamente; no afirman que el carrito externo esté armado. Los productos manuales necesitan vinculación a identificadores de catálogo para poder compararse.

### Tendencias

Se incluyen fechas mexicanas fijas (Reyes, Día del Niño, Día de las Madres, Fiestas Patrias, Día de Muertos y Navidad). El gasto adicional usa el historial comparable del hogar; sin historial aparece un estado vacío, no un monto inventado. Las fechas variables como regreso a clases y Buen Fin requieren un calendario oficial actualizado antes de incorporarse.

## Pruebas y compilación

```sh
npm test
npm run test:integration
npm run test:browser
npm run build
```

`npm test` prueba cálculos y validación mediante el runner de Node. Integración necesita los emuladores activos. La prueba de navegador necesita Vite en modo emulador y Google Chrome; crea solo cuentas y datos locales de prueba. Comprueba el onboarding obligatorio, cuatro módulos, persistencia, simulación y el regreso a Inicio al iniciar sesión de nuevo. Las capturas quedan en `/tmp/summa-ui/`.

La prueba bancaria explícita se ejecuta con `node backend/scripts/bank-smoke.mjs`: además del entorno local, utiliza el sandbox de Syncfy. No forma parte de los tests automáticos ordinarios.

## Publicación pendiente

Cuando se autorice el despliegue, desde la raíz del repositorio:

```sh
npm run deploy
```

Esto compila ambos paquetes y ejecuta:

```sh
firebase deploy --project hackaher --only hosting,functions,firestore:rules,firestore:indexes
```

Para desplegar únicamente las reglas e índices:

```sh
firebase deploy --project hackaher --only firestore:rules,firestore:indexes
```

No se ha ejecutado un despliegue exitoso ni una prueba pública. El primer despliegue habilitará los servicios requeridos por Functions y concederá a su identidad acceso al secreto. La facturación permanece en el mismo proyecto Blaze.

## Documentación y referencia anterior

`backend/app/`, sus pruebas Python y las guías `docs/CONEXIONES.md`, `docs/ESTADO.md` y `docs/DEMO.md` describen la versión Flask. No deben usarse como instrucciones del frontend React. Se conservan para consultar lógica que aún no se haya portado.

Referencias: [Firebase Hosting](https://firebase.google.com/docs/hosting/), [funciones callable](https://firebase.google.com/docs/functions/callable), [secretos](https://firebase.google.com/docs/functions/config-env), [Syncfy REST](https://github.com/Paybook/sync-rest), [widget oficial](https://github.com/Paybook/sync-widget), [variables Vite](https://vite.dev/guide/env-and-mode).

## Perfil y chatbot

Consulta [Perfil, Jami y demostración](JAMI_Y_PERFIL.md) para la edición centralizada de integrantes, el chatbot y la configuración de Gemini. El ingreso mensual se calcula desde los perfiles; no se pide otro monto junto a los permisos.


## Racha diaria de constancia

El Simulador muestra `activity`, independiente de la racha histórica de ahorro.
Cuenta por usuario autenticado: un gasto de hoy guardado hoy (manual, ticket,
PDF, audio o pago confirmado en agenda), o `confirmNoExpense`. La fecha se
calcula en el servidor con America/Monterrey. Los registros antiguos o de otro
integrante no completan el día. Los movimientos bancarios importados no acreditan
una revisión personal. Abrir la app por sí solo tampoco cuenta.

Las confirmaciones se guardan en
`hogares/{hogarId}/dailyActivity/{uid}/days/{AAAA-MM-DD}`, sin crear movimientos.
Un gasto posterior sustituye la confirmación; cada fecha cuenta solo una vez.
El cálculo utiliza los movimientos existentes, por lo que eliminar un gasto
retira esa evidencia. La racha admite completar hoy hasta medianoche y conserva
la mejor secuencia y los días del mes. La tarjeta se refresca al abrir el
Simulador, recuperar el foco y cada minuto mientras es visible.

Verificación: `npm test` y, con emuladores activos,
`node backend/scripts/activity-integration.mjs`.
