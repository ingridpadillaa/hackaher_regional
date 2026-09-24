# Conexión bancaria personal con Syncfy

## Estado de esta entrega

El flujo está implementado y probado con proveedor simulado y Firebase local. La consulta real de disponibilidad, el 24 de septiembre de 2026, devolvió únicamente **BBVA Personal (Sandbox)** y **BBVA Empresas (Sandbox)** para la clave configurada. No se conectó una cuenta bancaria real, no se capturaron credenciales personales y no se desplegó a producción.

La habilitación real depende de Syncfy: el equipo debe obtener acceso a BBVA Personal de producción para esta integración (y confirmar el tipo de cuenta compatible). Los IDs de sandbox no proporcionan ese permiso. No basta con cambiar una bandera. La app verifica el catálogo, la habilitación explícita del servidor y bloquea banca real en emuladores y hogares marcados de demostración.

## Recorrido de usuario

1. Usar una cuenta personal de Summa, en un hogar distinto de Hacka, e iniciar sesión recientemente (15 minutos como máximo para operaciones bancarias).
2. Simulador → Conectar mi banco → Mi cuenta real BBVA. La pantalla muestra disponibilidad; si no existe acceso real, el botón permanece deshabilitado.
3. Aceptar consentimiento **individual**, independiente del administrador y las preferencias compartidas del hogar. Abrir el componente oficial de Syncfy y completar allí la autenticación requerida por BBVA. La app no tiene campos propios para contraseña bancaria, NIP o token.
4. Consultar cuentas disponibles, identificadas por terminación, tipo y moneda. Seleccionar cuál revisar. Syncfy puede haber consultado todas las cuentas disponibles en el portal autorizado, aunque Summa importe solo la seleccionada.
5. Revisar movimientos confirmados de los últimos 30 días en MXN. Paginación de 100 registros; pendientes, deshabilitados, eliminados, futuros o incompletos se excluyen. No se presenta una lista parcial como historial completo. Se muestra cuántos registros se omitieron y si hay otra página.
6. Seleccionar movimientos y elegir explícitamente gasto, ingreso o transferencia, categoría y tipo de ingreso. En tarjetas de crédito, revisar pagos, devoluciones y compras para evitar contar dos veces; el signo del proveedor no decide automáticamente la clasificación. Coincidencias con registros manuales por fecha/importe requieren confirmación adicional.
7. Confirmar la importación privada. Los demás integrantes no ven esos movimientos ni sus cifras en reportes. El flujo no envía información a Gemini ni crea evidencia de ahorro verificado. El chat de Jami sigue sus propias reglas y consentimiento; puede utilizar los agregados visibles del usuario cuando este lo consulta.
8. Desconectar revoca el usuario dedicado de esta integración en Syncfy. El historial importado se conserva, salvo que el usuario elija por separado «Borrar mis movimientos importados», lo que recalcula reportes del hogar actual. No se modifica el banco.

## Controles implementados

- API autenticada: UID y hogar derivan de Firebase Auth y de la membresía comprobada por el backend. No se aceptan UID ni ID de hogar suministrados como autoridad por el navegador.
- Usuarios Syncfy dedicados por cuenta de Summa y entorno. No se reutilizan los vínculos del adaptador antiguo ni usuarios Syncfy compartidos.
- La clave Syncfy permanece en `SUMMA_INTEGRATIONS`; el navegador recibe solamente el token de sesión específico del usuario para el widget, en memoria.
- `privateBankConnections/{uid}/modes/{live|sandbox}` conserva consentimiento versionado, referencia externa y estado. La revocación bloquea nuevas consultas antes de contactar al proveedor y permanece pendiente si este falla.
- Exclusión por usuario/entorno evita importaciones y desconexiones concurrentes. Tokens, contraseñas, cuentas completas y respuestas crudas del proveedor no se registran en logs.
- Borrador minimizado y cifrado con AES-256-GCM, contexto ligado a UID/entorno/borrador, vigencia de cinco minutos, ubicado en `bankReviewDrafts/current`. El servidor verifica su vigencia incluso si el borrado físico aún no ocurre. El cierre intenta descartarlo; desconexión y borrado lo eliminan. Firestore TTL elimina revisiones abandonadas después del vencimiento, de forma diferida, **solo tras desplegar la política**. Los emuladores no garantizan ese borrado automático.
- `privateBankImports/{uid}/items/{hash}` impide repetir una importación por identidad bancaria. La creación del movimiento y su recibo es atómica. Los importes y fechas salen del borrador validado, no de campos arbitrarios del cliente.
- Movimientos con `source=syncfy`, `bankMode`, `ownerUid` y `private=true`. La privacidad es entre usuarios de la aplicación; no equivale a cifrado de extremo a extremo frente a administradores técnicos de Firebase. Las reglas Firestore siguen negando acceso directo al cliente.
- Solo el hogar demo admite importar movimientos sandbox, claramente marcados de prueba. Las credenciales bancarias reales no deben introducirse en ese entorno.
- No hay endpoints de pagos, transferencias ni modificación de datos del banco. La app consulta lo ya sincronizado por Syncfy; para actualizar la conexión/autenticación se vuelve al widget. No se implementó sincronización automática mediante webhooks.

## Configuración pendiente antes de usar una cuenta real

En el secreto del backend se requieren `syncfyKey`, `syncfyLiveEnabled: true` y `bankDataKey` (32 bytes aleatorios codificados como 64 caracteres hexadecimales). La clave de cifrado ya está generada en `.secret.local`, sin imprimirla ni versionarla. Conservar las claves Gemini existentes. No habilitar live hasta que el catálogo de la clave muestre BBVA Personal real. La configuración local no modifica Secret Manager.

Después de contar con acceso de producción, publicar Functions, reglas/TTL y frontend HTTPS con Firebase Authentication real. Verificar el widget y la revocación con una cuenta autorizada antes de abrir el servicio a más personas. La revisión de seguridad funcional realizada aquí no sustituye una auditoría independiente ni garantiza ausencia de riesgos.

El aviso público describe el tratamiento técnico; los datos de contacto del responsable y el procedimiento de privacidad deben completarse antes de abrir el prototipo al público.

## Verificación reproducible

```sh
npm test
npm run build
node backend/scripts/check-bbva.mjs
node backend/scripts/bank-private-integration.cjs
node frontend/scripts/bank-private-browser.mjs
```

`check-bbva` es de solo lectura y solo imprime disponibilidad y nombres de conectores. La prueba de integración requiere emuladores; simula todas las respuestas de Syncfy y comprueba aislamiento, cifrado, caducidad, selección manipulada, deduplicación, revocación fallida/reintento y eliminación personal. La prueba de navegador utiliza el acceso local de Hacka y respuestas ficticias para probar la interfaz; no abre una sesión bancaria real.

Referencias oficiales: [Quickstart de Syncfy](https://github.com/Paybook/sync-rest), [colección de Syncfy](https://www.postman.com/syncfy/syncfy-public-resources/documentation/j3zmuyb/open-banking-quickstart), [índices y TTL en Firebase](https://firebase.google.com/docs/reference/firestore/indexes/).
