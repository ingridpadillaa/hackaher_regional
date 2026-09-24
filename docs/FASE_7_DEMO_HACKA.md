# Fase 7 · Hogar Hacka

Demo aislada en Firebase Emulator Suite, proyecto `demo-summa`, hogar `demo-hacka-v2`. No reemplaza `demo-hack`, no escribe en Firebase de producción y no despliega la aplicación. La interfaz muestra «Hogar de demostración · Datos ficticios».

## Contenido cargado

Periodo: **1 de julio al 24 de septiembre de 2026** (tres meses calendario, el actual hasta la fecha). Integrantes con cuentas independientes: **Rosy Herrera** (administración) y **Vane Ramirez** (integrante). Importes, edades y ocupaciones son ficticios para ensayo.

| Mes | Nóminas recibidas | Ingresos extra | Gastos | Presupuesto |
| --- | ---: | ---: | ---: | ---: |
| Julio | $27,000 | $900 | $16,835 | $18,000 |
| Agosto | $27,000 | $900 | $15,565 | $18,000 |
| Septiembre | $27,000 | $900 | $15,255 | $18,000 |

Cada mes incluye $1,000 de transferencias entre cuentas propias que no se suman a ingresos ni gastos. Los ingresos previstos de los perfiles tampoco se suman a lo recibido.

Metas: fondo de emergencia con $4,350 y viaje con $2,400. Estos saldos se derivan de 24 aportaciones semanales y tres retiros; no son cifras sueltas cargadas a la meta. Racha declarada de 12 semanas a la fecha de carga. No hay evidencia bancaria ficticia ni conexión bancaria simulada presentada como real.

Incluye tres próximos eventos (pago, cobro y ahorro), presupuestos de cada mes, notificación de demo, invitación vigente con QR y carrito de cuatro productos reales de PROFECO. Los registros financieros llevan `esPrueba` y `seedTag`. El catálogo conserva fechas y fuentes reales; activar referencias históricas para comparar precios de julio.

## Acceso y reproducción

Las credenciales generadas están únicamente en `backend/.demo-hacka-v2-access.local`, ignorado por Git y con permisos de archivo 0600. No se envían correos. Abrir la aplicación local y usar uno de esos accesos.

Con emuladores Auth 9099, Firestore 8085 y Functions 5001, y el catálogo PROFECO local disponible:

```sh
node backend/scripts/load-profeco.mjs --file backend/data/profeco-catalog.json --emulator
node backend/scripts/seed-hacka-v2.mjs
node backend/scripts/seed-hacka-v2.mjs --apply --confirm-demo
```

Sin opciones solo muestra el plan. La carga escribe exclusivamente a localhost, de forma atómica en Firestore, y no sobrescribe una demo existente. La demo anterior se conserva. El generador calcula los últimos tres meses calendario respecto al día de ejecución; no genera movimientos futuros. Si el emulador pierde su estado, los comandos anteriores lo restauran, usando los accesos locales guardados.

## Guion de demostración

1. Entrar como Rosy y observar la etiqueta de datos ficticios y la alerta de presupuesto.
2. Abrir reportes y alternar julio/agosto/septiembre: comprobar ingresos extra y gastos por categoría.
3. Revisar las metas y su historial de aportaciones/retiros; explicar que la racha se basa en ahorro declarado.
4. En la agenda, confirmar un evento para ver cómo crea el registro correspondiente. La operación modifica solo esta demo.
5. Abrir Carrito, habilitar referencias históricas y guardar/comparar hasta cuatro sucursales. Revisar cobertura, faltantes, fuente y fecha; no hay checkout externo.
6. En Perfil, descargar el QR o renovar la invitación. Entrar como Vane para comprobar los permisos de integrante.
7. Registrar un ticket propio de prueba con Gemini, revisar las categorías antes de guardar y comprobar el aviso al repetirlo. La extracción real requiere conexión y cuota del proveedor; no se precargan respuestas de IA simuladas.

## Verificación

```sh
npm run build
node --test backend/scripts/hacka-dataset.test.mjs
node backend/scripts/verify-hacka-v2.mjs
node frontend/scripts/hacka-browser.mjs
```

El generador se prueba también en un cambio de año y un año bisiesto. La verificación consulta ambos usuarios y compara los tres reportes contra el manifiesto local `backend/data/hacka-v2-manifest.json`; ejecutar antes de modificar manualmente la demo. La prueba de navegador requiere Vite en 5173 y Chrome. No se crean precios de mercado ni movimientos bancarios ficticios para completar funcionalidades que dependen de proveedores externos.
