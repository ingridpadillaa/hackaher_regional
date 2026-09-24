# Piloto de transferencia de mandado a H-E-B

## Resultado del 24 de septiembre de 2026

**No se ha verificado un carrito real en H-E-B.** La navegación aislada recibió «Access denied · Error 15» del servicio de seguridad del sitio; la consulta HTTP respondió 403. No se intentó eludir el bloqueo, iniciar sesión ni pagar.

La fase queda parcialmente implementada: mecanismo de preparación y validación, interfaz y prueba reproducible. La transferencia permanece deshabilitada hasta obtener evidencia real. No se afirma que exista un convenio, que el checkout de H-E-B acepte el enlace ni que tengamos precios/inventario vigentes.

## Tres productos candidatos

Son fichas reales del catálogo público, identificadas mediante búsqueda; no se cargan como lista predeterminada de ningún hogar. Cantidades elegidas exclusivamente para probar la transferencia:

| Producto | Cantidad de paquetes | Ficha oficial |
| --- | ---: | --- |
| Leche Lala Entera 1 L | 2 | https://www.heb.com.mx/lala-leche-entera-1-l-1108/p |
| Verde Valle Arroz Súper Extra 900 g | 1 | https://www.heb.com.mx/verde-valle-arroz-super-extra-900-gr-252246/p |
| Huevo Blanco Bachoco 30 pz | 1 | https://www.heb.com.mx/bachoco-huevo-blanco-30-pz-742568/p |

Los números de las URLs son referencias de ficha; **no se asumen como SKU de checkout**. Faltan verificar `itemId/sku`, vendedor y canal comercial desde una sesión o integración permitida de H-E-B. Las fichas indexadas no acreditan existencia actual ni disponibilidad para Monterrey. No se extrajeron precios de búsqueda para mezclarlos con PROFECO.

## Implementación

- `prepareRetailerCart` es una operación autenticada y sujeta a membresía del hogar. Recibe la lista actual y consulta configuración y equivalencias privadas al backend.
- `retailerIntegrations/heb` debe contener `enabled=true` y `verification` con status=verified, checkedAt, salesChannel, evidenceId, quantitiesMatched=true y existingCartPreserved=true. La verificación expira a los siete días; representa compatibilidad del mecanismo, no una garantía de stock/precio.
- `retailerProductMappings/heb_{productId}` contiene productId, sku, seller, salesChannel, productUrl, match=exact y verifiedAt. Debe corresponder a la misma marca/presentación del producto interno. Solo un proceso administrativo puede registrar estas equivalencias; no se aceptan identificadores externos aportados directamente por el navegador.
- No se crearon documentos con estado verificado, ni equivalencias supuestas. Sin configuración válida, la respuesta incluye `ready=false` y `url=null`.
- El generador acepta hasta 40 productos, cantidades enteras de 1–99 y un solo canal; rechaza productos sin equivalencia, duplicados, productos por peso o URLs ajenas a H-E-B. Nunca omite silenciosamente parte del mandado para mostrar un carrito «completo».
- El enlace usa el patrón de VTEX `/checkout/cart/add` con grupos `sku`, `qty`, `seller` y canal `sc`, documentado como mecanismo de recuperación de carrito. Su funcionamiento específico en H-E-B sigue pendiente. No contiene datos personales, sesiones, direcciones ni pagos.
- El usuario verá «Comprobar envío a H-E-B». Solo una respuesta verificada habilita «Abrir mi mandado en H-E-B». Editar la lista invalida el enlace anterior. La apertura siempre es una acción explícita; no altera carritos externos al cargar Summa.
- El sitio receptor decide sucursal, existencias, precios y pago. Reabrir un enlace podría cambiar cantidades existentes: el usuario debe revisar el carrito final.

## Prueba reproducible

Desde la raíz, con Chrome instalado:

```sh
node frontend/scripts/heb-cart-probe.mjs
```

La ejecución abre una sesión anónima nueva. Si encuentra denegación o desafío de acceso, se detiene. Guarda únicamente el informe sanitizado en `/tmp/summa-heb-pilot/report.json`; no conserva cookies ni credenciales. Código de salida 2 significa no verificado/bloqueado, nunca éxito.

Cuando exista acceso permitido y se hayan verificado los identificadores, crear un JSON local con `candidates` basado en `backend/scripts/heb-pilot-products.mjs`. Cada candidato necesita `checkout: {sku, seller, salesChannel}`. No adivinar estos valores. Ejecutar:

```sh
node frontend/scripts/heb-cart-probe.mjs --manifest /ruta/heb-pilot-verificado.json --test-cart
```

Esta opción añade productos únicamente al carrito de la sesión aislada. Comprueba que los tres artículos y cantidades se recibieron, y que reabrir un enlace de un artículo conserva los otros dos; registra el efecto en la cantidad repetida. Consulta el carrito mediante la API pública documentada de VTEX, solo después de superar la navegación normal. Nunca paga. No activa automáticamente la integración en Firestore.

Antes de habilitar la funcionalidad para usuarios: comprobar también selección de sucursal, disponibilidad, sesión con carrito preexistente, cambios de precio y recuperación de productos faltantes. La automatización aislada no equivale a autorización comercial de H-E-B.

## Pruebas locales

```sh
npm test
npm run build
node frontend/scripts/retailer-cart-browser.mjs
```

Pruebas unitarias cubren expiración, equivalencias completas, dominio, cantidades y composición del enlace. La prueba de interfaz usa Firebase local y un enlace ficticio que **no abre**: comprueba que el estado no verificado carece de enlace y que editar la lista invalida una preparación anterior.

## Continuación

Resolver el acceso permitido con H-E-B o verificar el piloto desde un entorno donde la tienda funcione normalmente; no usar proxies ni técnicas para evadir el bloqueo. Después completar la equivalencia de productos y validar el carrito receptor antes de activar el botón. La predicción del mandado a partir de compras detalladas y la extensión a tres supermercados siguen siendo etapas posteriores; este piloto valida exclusivamente la transferencia externa.

Referencias: [Añadir productos con VTEX](https://developers.vtex.com/docs/guides/add-cart-items), [sesión y checkout](https://developers.vtex.com/docs/guides/headless-cart-and-checkout), [patrón de enlace en el código de VTEX](https://github.com/vtex-apps/abandoned-cart). Este último repositorio está marcado sin mantenimiento; por eso el patrón requiere prueba en la tienda concreta.
