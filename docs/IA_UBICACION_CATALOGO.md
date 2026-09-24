# Fases 4–6: IA, ubicación, invitaciones y PROFECO

## Tickets con Gemini

El backend procesa el archivo en memoria y solicita líneas, categorías y total. Cuando las líneas cuadran, agrupa los importes por categoría sin volver a sumar el total. Cuando no cuadran, conserva el total como un único movimiento por revisar y muestra una advertencia. La persona puede editar importe, fecha, nota y categoría antes de guardar.

Las correcciones de categoría se recuerdan solo si la persona lo elige, para la misma descripción normalizada dentro de su hogar. `hogares/{id}/categoryRules/{hash}` contiene la categoría y auditoría. `analyzedSources/{hash}` registra fuentes confirmadas para alertar sobre duplicados; confirmar deliberadamente uno requiere marcar la casilla correspondiente. Los borradores mantienen propietario, caducidad e índices ya utilizados.

## Ubicación sin Google Maps Platform

`home.location` contiene municipio, estado, fuente y coordenadas opcionales. El navegador solicita permiso al pulsar «Usar mi ubicación»; se puede rechazar y escribir el municipio. No hay seguimiento continuo. La ubicación del hogar se guarda al confirmar, y solo quien lo administra puede modificarla. La zona del carrito es temporal. Abrir el enlace de Google Maps comparte el punto o consulta con Google. No requiere clave de Maps/Places; no hay valoraciones de Google conectadas ni cálculo de rutas.

## Invitaciones

Códigos aleatorios de 32 caracteres, caducidad de siete días, QR descargable y enlace compartible. La administración puede renovar o revocar. Los enlaces sobreviven al registro/inicio de sesión mediante sessionStorage y muestran el nombre del hogar antes de confirmar la unión. Nunca cambian de hogar automáticamente. Las invitaciones antiguas reciben caducidad una sola vez.

## Catálogo real

Fuente: https://datos.profeco.gob.mx/datos_abiertos/qqp.php

Diccionario: https://datos.profeco.gob.mx/diccionarioDatosQQP.php

Se descargó el archivo oficial 2026 y normalizó julio para Monterrey, Nuevo León: **2,183 productos, 6 sucursales, 5,919 observaciones**; última observación **2026-07-31**. SHA256 del ZIP: `172bd1a44c17ac35da36d8584bca710b4b85c100f861c5788fa291a6109a15a5`.

El archivo normalizado local está en `backend/data/profeco-catalog.json` (ignorado por Git). Solo se cargó al emulador `demo-summa`; no se publicó ni escribió en producción.

```sh
python3 backend/scripts/import-profeco.py --file /ruta/qqp-2026.zip --state 'Nuevo León' --municipality Monterrey --period 07-2026 --source-url 'URL oficial de descarga' --output backend/data/profeco-catalog.json
node backend/scripts/load-profeco.mjs --file backend/data/profeco-catalog.json
node backend/scripts/load-profeco.mjs --file backend/data/profeco-catalog.json --emulator
```

El primer comando normaliza, el segundo valida sin escribir y el tercero importa exclusivamente al emulador. Al reiniciar un emulador sin persistencia hay que repetir la carga.

`catalogProducts` identifica producto + marca + presentación. `stores` identifica sucursal + dirección + municipio/estado y coordenadas oficiales. `prices` conserva la última observación por producto/sucursal con precio, fecha, fuente y URL. `catalogImports/profeco` guarda procedencia y huella del archivo.

Se comparan hasta cuatro sucursales, por cobertura/precio o distancia aproximada. Con coordenadas se limita a 20 km y se omiten sucursales sin coordenadas. Sin ellas, se consulta por municipio. Un producto manual no se equipara automáticamente a uno del catálogo. Las listas incompletas muestran subtotal y faltantes, nunca un total artificialmente barato. Las observaciones de más de 30 días se excluyen salvo aceptación explícita de referencias históricas. No se crean carritos en sitios externos ni se promete disponibilidad actual: se ofrece lista copiable y enlace a la sucursal en Maps.

## Validación

`npm test`, `npm run build`, `npm run test:integration`, `npm run test:browser`, `node backend/scripts/phases456-integration.mjs` y `python3 -m unittest discover -s backend/tests -p test_profeco_catalog.py`. Las integraciones requieren emuladores; las pruebas del catálogo requieren cargar el archivo local. No ejecutan escrituras en producción.
