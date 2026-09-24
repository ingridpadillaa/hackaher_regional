# Perfil, Jami y demostración

> Referencia histórica. Para el modelo vigente consulta MODELO_DATOS.md; ubicación e invitaciones en IA_UBICACION_CATALOGO.md. La demo actualizada de fase 7 es [Hacka](FASE_7_DEMO_HACKA.md), aislada en emuladores; la demo Hack descrita abajo se conserva.

## Perfil

Selecciona una persona dentro de **Tu hogar** para editar nombre, edad, estudios, ocupación, ingreso y periodicidad. Elimina perfiles desde ese mismo editor, con confirmación. Solo administra el hogar su propietario; el perfil administrador se conserva. Al eliminar un perfil con cuenta vinculada se retira su acceso al hogar, sin borrar la cuenta de Authentication ni los movimientos históricos.

Ingreso mensual, municipio y permisos se muestran durante el registro. Después desaparecen de Perfil. El servidor conserva el municipio y los permisos originales aunque se intente modificarlos desde una petición manual. El ingreso agregado se calcula a partir de los integrantes actuales.

**Estilo de vida** ofrece a Jami contexto cualitativo sobre hábitos; **Metas prioritarias** indica qué temas priorizar. Ambas influyen en los consejos generativos cuando Gemini está configurado y autorizado. No modifican presupuestos ni crean metas con importe; estas se crean en Simulador.

## Jami

La burbuja aparece en todas las pantallas, incluidos registro y formularios. El chat se conserva solo en memoria de la sesión y se limpia al cambiar de cuenta. La consulta autenticada usa exclusivamente el hogar de la sesión.

Sin Gemini o sin permiso de IA, Jami ofrece una guía y respuestas basadas en reglas y cifras calculadas de la base; la interfaz lo identifica como **sin IA**. Con Gemini, el modelo añade orientación cualitativa a las cifras calculadas; no escribe movimientos ni ejecuta transferencias. El contexto usa ingreso agregado y datos mínimos, sin nombres de integrantes ni correos. Los estilos y prioridades se envían como datos, nunca como instrucciones.

Para activar generación se necesitan:

- Una clave válida de Gemini con acceso y cuota.
- El identificador exacto de un modelo habilitado para esa clave.
- Permiso de IA durante el registro del hogar.

El backend lee `geminiKey` y `geminiModel` del JSON `SUMMA_INTEGRATIONS`. En local, agrégalos al JSON existente en `backend/functions/.secret.local`, conservando las demás integraciones. No pegues claves en el chat, en variables `VITE_*` ni en archivos versionados. Reinicia el emulador de Functions tras cambiar el secreto.

En la nube se usa el secreto de Secret Manager del mismo nombre. Esta entrega **no despliega** Functions ni Hosting: publicar el chatbot en producción requiere una entrega posterior autorizada. Referencia del proveedor: [GenerateContent de Gemini](https://ai.google.dev/api/generate-content).

## Demo Hack

El resumen verificado está en [DEMO_HACK_RESUMEN.md](DEMO_HACK_RESUMEN.md). Las cuentas de ensayo usan los perfiles Rosy y Vane. Sus correos y contraseñas están en `backend/.demo-hack-access.local`, excluido de Git.

El dataset real está en Firebase `hackaher`, documento `hogares/demo-hack`. Se copió también a los emuladores `demo-summa` para ensayar en localhost sin desplegar. Las bases son independientes: modificar una no sincroniza la otra. Los emuladores sin exportación pierden los datos al detenerse; puedes restaurar solo esta demo, con los emuladores encendidos, ejecutando desde la raíz:

```sh
node backend/scripts/mirror-hack-demo.mjs
```

La copia lee únicamente documentos de la demo en la nube y escribe únicamente a los hosts locales de Auth y Firestore. Si la demo ya existe localmente, no la sobrescribe.

Para inspeccionar el plan de carga en la nube, `node backend/scripts/seed-hack-demo.mjs` no escribe. La opción `--apply --confirm-demo` realiza la carga exclusivamente en el hogar marcado de ensayo; si ya existe, no lo sobrescribe. No genera precios de supermercado ni evidencia bancaria ficticia presentada como real.

## Integración Gemini comprobada

La clave local existente y el modelo configurado `gemini-3.8-flash` se verificaron contra el proveedor. El cliente común `backend/functions/src/gemini.ts` sirve a extracción y chat. Los esquemas de salida se validan de nuevo con Zod; archivos incompatibles, importes inválidos, fechas futuras y respuestas incompletas se rechazan. La clave sigue únicamente en el secreto del backend.

- Ticket/foto y PDF: lectura y clasificación automáticas.
- Audio o transcripción escrita: extracción de movimientos y categorías.
- Confirmación: el análisis crea un borrador, no un movimiento. La persona puede corregir la categoría o descartar una fila antes de guardar. Se conserva la categoría sugerida junto con la categoría confirmada.
- Jami: orientación generativa con datos agregados, contexto de estilo de vida/prioridades y las últimas cuatro preguntas de la sesión. Las cifras se calculan en el servidor y se mantienen separadas de los consejos del modelo.

Se probaron llamadas reales con comprobantes y audio sintéticos, sin documentos personales. No se desplegaron Functions ni Hosting. El secreto local no actualiza por sí solo Secret Manager ni la aplicación en producción.

Pruebas habituales: `npm test`, `npm run test:integration`, `npm run build`. Las pruebas reales siguientes consumen cuota de Gemini y se ejecutan solo de forma explícita desde la raíz:

```sh
node backend/scripts/gemini-live-smoke.mjs /ruta/a/audio-sintetico.wav
node frontend/scripts/gemini-browser-smoke.mjs
```

La primera genera comprobantes sintéticos en `/tmp` y verifica texto, imagen, PDF, audio WAV opcional y chat. La segunda necesita los emuladores y Vite encendidos y el comprobante creado por la primera; crea un hogar exclusivamente local, verifica que el análisis no guarde automáticamente y confirma una categoría corregida.
