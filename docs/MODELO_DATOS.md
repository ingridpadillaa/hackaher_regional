# Modelo de datos de Summa · versión 2

Implementado en Firebase Functions; React usa únicamente la función autenticada `api`. Firestore no permite acceso directo del navegador. Los hogares existentes se actualizan de forma aditiva al cargarlos, una vez desplegado este backend. No es necesario crear colecciones vacías en Firestore: aparecen al escribir su primer documento.

## Identidad y autorización

- `usuarios/{uid}`: nombre, email, hogarId, rol, personalizacionCompleta, creadoEn. Identidad proporcionada por Firebase Auth.
- `hogares/{homeId}`: name, ownerUid, invitationCode, schemaVersion=2, currency=MXN, timezone=America/Monterrey, preferences, personalized, createdAt, migratedAt.
- `hogares/{homeId}/members/{memberId}`: name, age, relationship, education, occupation, income, period, accountUid opcional. Un perfil no equivale a una cuenta. Los perfiles vinculados conservan el ID de Auth para comprobar membresía; los demás conservan su ID actual.
- `invitations/{code}`: homeId, createdBy. Se conserva el flujo existente. Caducidad y revocación corresponden a la fase de invitaciones, no a esta entrega.

Cada operación del backend deriva el hogar del usuario autenticado y comprueba su membresía. Administración de integrantes, preferencias y presupuestos: solo ownerUid. Movimientos, aportaciones y agenda: integrantes que terminaron el registro. Nunca se acepta un homeId enviado por el navegador como autorización.

## Finanzas (subcolecciones de cada hogar)

| Colección               | Campos principales                                                                                                                                      | Fuente de verdad                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| incomePlans             | memberId, amount, frequency, nextDate nullable, source=profile, active                                                                                  | Expectativa declarada en el perfil; se sincroniza al editarlo. No genera ingresos recibidos. |
| movements               | type=gasto/ingreso/transferencia, incomeKind=regular/extra, amount, category, note, date, method, ownerUid, private, createdAt, metadatos IA opcionales | Registro confirmado de movimientos.                                                          |
| budgets/{AAAA-MM}       | amount, source, updatedBy, updatedAt                                                                                                                    | Límite mensual elegido explícitamente. Cero/ausente significa sin presupuesto.               |
| goals                   | name, target, targetDate opcional, saved, ownerUid, createdAt                                                                                           | Objetivo y saldo materializado. saved no es editable directamente desde el cliente.          |
| savingsEntries          | goalId, type=contribution/withdrawal/opening, amount, date, note, source, verified, ownerUid, createdAt                                                 | Libro de aportaciones y retiros. Se actualiza junto con goals.saved en transacción.          |
| schedules               | title, kind=income/payment/saving, amount, nextDate, frequency, anchorDay, category, goalId opcional, active, updatedBy                                 | Próximo cobro/pago/aportación programado. No significa que ocurrió.                          |
| scheduleCompletions     | ownerUid, date, dueDate                                                                                                                                 | Recibo de cumplimiento; ID determinista evento_fecha evita duplicados.                       |
| notifications           | title, message, kind, ownerUid opcional, createdAt                                                                                                      | Avisos persistidos; alertas de presupuesto se derivan de registros.                          |
| readNotifications/{uid} | ids                                                                                                                                                     | Avisos leídos por cada cuenta.                                                               |
| drafts                  | transcript, warning, movements, method, model, ownerUid, expiresAt, used                                                                                | Borrador IA temporal, sin archivos originales.                                               |
| bankEvidence            | date, netSavings, source, verified                                                                                                                      | Evidencia bancaria, separada del ahorro declarado.                                           |

Los importes son MXN, con precisión de centavos. Las fechas financieras son ISO `YYYY-MM-DD` y se comparan en America/Monterrey. `createdAt` registra cuándo se capturó, no reemplaza la fecha del movimiento.

### Cálculos

- Ingresos recibidos = movimientos ingreso habituales + adicionales.
- Movimientos antiguos sin incomeKind se consideran adicionales (semántica anterior); no se reescriben.
- Balance de movimientos = ingresos recibidos − gastos. No es saldo bancario ni patrimonio.
- Presupuesto restante = límite elegido − gastos. Las transferencias no alteran ingresos ni gastos.
- Ingresos previstos de los perfiles nunca se suman automáticamente a los recibidos.
- Ahorro de una meta = saldo previo + aportaciones − retiros. Registrar ahorro no crea ingresos ni gastos: documenta dinero apartado, no una transferencia bancaria ejecutada.
- Racha declarada = semanas consecutivas (lunes a domingo) con aportaciones menos retiros mayores a cero. Se permite que la semana actual siga pendiente; si no es positiva, se empieza por la anterior. Saldos iniciales y fechas futuras no acreditan rachas.
- La simulación solo calcula cuánto tardaría una aportación hipotética.

El reporte se recalcula por mes consultado desde `movements` y `budgets`; no se crea una colección redundante de resúmenes que pueda quedar desactualizada. Los eventos mensuales preservan su día de referencia: 31 enero → 28 febrero → 31 marzo. La frecuencia cada 14 días se identifica explícitamente, sin confundirla con dos cobros mensuales.

## Catálogo y conectores conservados

`products/{id}` mantiene name, searchName, unit y offers por tienda con price, date, source, municipality y productUrl opcional. `hogares/{id}/cart/current` conserva items y updatedAt. La normalización futura en productos/sucursales/precios se realizará con el cargador de PROFECO de la fase 6, sin fabricar catálogo en esta entrega. `bankConnections/{uid}` y `rateLimits` permanecen privados al backend. Los secretos solo están en Secret Manager/configuración local ignorada por Git.

## Migración y conservación

`ensureFinanceSchema` ejecuta una transacción por hogar con versión menor a 2:

1. Conserva usuarios, perfiles, cuentas vinculadas, movimientos, metas y carrito.
2. Crea incomePlans a partir del perfil, sin inventar fechas de cobro.
3. Conserva cada saldo anterior de meta en una entrada `opening_{goalId}`, source=legacy, verified=false. No genera racha.
4. Conserva el presupuesto anterior únicamente para el mes de migración con source=legacy. No proyecta el ingreso actual sobre meses pasados.
5. Marca schemaVersion=2. Los reintentos y aperturas siguientes no recrean saldos iniciales.

Los campos antiguos lifestyle, priorities y assistantTone pueden seguir almacenados para evitar pérdida de información; ya no se solicitan en Perfil ni se envían a Gemini. Jami usa un tono cercano y las metas registradas.

No hay borrado masivo, carga de tres meses, ni modificación de hogares de producción durante el desarrollo. Para aplicar esta versión al entorno público se requiere desplegar el backend y frontend; la migración corre al abrir cada hogar.

## Índices y verificación

Las consultas nuevas son de un campo: movements.date, savingsEntries.date y schedules.nextDate. Usan los índices automáticos de Firestore; no requieren índices compuestos. Se conservan los índices históricos de la aplicación anterior. Las reglas de acceso directo permanecen cerradas y se comprueban en emulador.

Pruebas: `npm test`, `npm run test:integration` (Firebase Emulator Suite) y `npm run test:browser` (Vite en modo emulador y Chrome). Cubren periodos, ingresos extra, exclusión de transferencias, aislamiento entre hogares, retiros inválidos, idempotencia, rachas y agenda.
