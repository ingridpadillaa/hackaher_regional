# PROMPT PARA CODEX — "Summa" (HackaTec 2026 · Reto HackaHer · Temática Fintech y Economía Familiar)

> Organización vigente: `frontend/` contiene React, recursos visuales y `legacy/{templates,static}`. `backend/` contiene Functions, Python, catálogos y pruebas del servidor. Los Markdown se guardan en la raíz o `docs/`; `.gitignore` y las configuraciones compartidas permanecen en la raíz. Ejecuta npm y Firebase desde la raíz; Python desde `backend/`. Las rutas de las secciones históricas deben interpretarse conforme a esta estructura.

> Guarda este archivo en la raíz del repositorio como `AGENTS.md`. Es la fuente de verdad del proyecto y **reemplaza la versión anterior** (que usaba el nombre provisional "Cochinito").

> Actualización de integración: el equipo autorizó Firebase Blaze. La configuración real se lee únicamente del `.env` existente, sin copiar sus valores ni versionarlos. Firebase Admin usa archivo o ADC con proyecto explícito; el frontend usa solo Authentication. Los archivos de usuario continúan procesándose en memoria. Gemini usa exclusivamente GEMINI_MODEL configurado.

> Actualización de producto y stack (septiembre de 2026): la instrucción más reciente del equipo aprueba React + Vite + TypeScript y Firebase Blaze (Hosting, Auth, Firestore y Functions Node.js). La UI vigente tiene solo Inicio, Carrito, Simulador y Perfil; cuenta → hogar → personalización es obligatoria una vez. El PDF UI/UX y el mensaje del equipo sustituyen las pantallas y navegación anteriores. El README de summa describe el estado implementado y los pendientes. Las secciones Flask/Spark de este archivo son referencia histórica donde contradigan esta actualización.

## 0. CAMBIOS RESPECTO A LA VERSIÓN ANTERIOR (aplícalos sobre lo ya construido)

1. **El producto se llama Summa.** El asistente de IA se llama **Jami**. Reemplaza "Cochinito" en todo el código, textos y plantillas.
2. **Sin plan Blaze de Firebase**: no hay Cloud Storage, Cloud Run, Cloud Scheduler ni Secret Manager. Archivos se procesan en memoria y se descartan; precios de PROFECO en SQLite local; jobs como comandos CLI; despliegue local (gunicorn) o Render.
3. **Se elimina el módulo "Pagos fijos"**. Los pagos fijos se capturan en la **personalización inicial** (onboarding) y se pueden editar desde Perfil → Personalización. Siguen alimentando "Próximos pagos" y la fórmula de disponible.
4. **Inicio rediseñado** (sección 7.3): tarjeta de ingreso/disponible, botón "+ Registrar gasto" arriba, próximos pagos, tarjeta de progreso (racha y meta).
5. **Registrar gasto** es una sola pantalla con **selector de método**: Ticket, Foto, Manual, PDF, Voz. Todo lo que no es manual se categoriza con IA y el usuario **acepta o cambia** la categoría.
6. **Mandado rediseñado** (sección 7.5): búsqueda, sugerencia predictiva, carrito "Mis próximas compras" y comparación dinámica de **3 supermercados cercanos** con botones verde/amarillo/rojo que redirigen al sitio del súper.
7. **Nuevo**: personalización detallada del hogar (integrantes, edades, estudios, trabajo, ingreso por persona), **presupuesto sugerido por categoría**, **alertas de presupuesto**, **recomendaciones por tipo de hogar**, **meta de ahorro óptima**, **racha de ahorro** con meta motivacional, **reportes con IA**, **centro de notificaciones** y **apartado de donativos**.
8. **Jami** guía la navegación (puede llevar al usuario a pantallas) además de responder sobre las finanzas del hogar con datos de la base de datos.
9. **Fuera de alcance**: tandas, hardware, mover dinero desde la app.
10. **Logo oficial** en `static/img/logo.png` (versión completa con la palabra SUMMA). Crea `static/img/logo-simbolo.png` con solo el símbolo (mano, casa y moneda) para favicon, ícono PWA y avatar de Jami. Colores de marca ajustados al logo (sección 4).
11. **CERO DATOS PREDETERMINADOS** (sección 13A): elimina todo monto, nombre, movimiento, producto, precio, tienda o estadística escrito directamente en plantillas, JavaScript o Python. Todo sale de Firestore, de PROFECO real o de los conectores. Busca en todo el repositorio y **lista en tu respuesta lo que encontraste y quitaste**.
12. **Firestore**: crea `firestore.rules` y `firestore.indexes.json` según el modelo de datos, y una verificación al iniciar la app que muestre claramente qué falta (variables de entorno, conexión a Firestore) en lugar de fallar en silencio (sección 13B).

---

## 1. Cómo quiero que trabajes

- Prototipo de hackathon: **la prioridad es que la demo funcione de punta a punta**. Trabaja por **fases** (sección 15); al terminar cada una la app arranca sin errores y haces commit.
- Si algo externo falla o no está (llaves, proveedor, archivo de PROFECO), usa el modo simulado y deja un `TODO` claro. No te bloquees.
- Código en inglés; **toda la interfaz en español de México**, con lenguaje sencillo, cálido y sin tecnicismos financieros (si usas uno, explícalo en una línea).
- No inventes endpoints de APIs externas: aísla cada llamada y documenta qué verificar.
- Nunca pongas llaves en el código. Todo por `.env` (incluye `.env.example`, y `.env` y claves `.json` en `.gitignore`).

---

## 2. Qué es Summa

**Summa es el copiloto financiero del hogar.** Aplicación web **mobile-first** (instalable como PWA) donde una familia registra y entiende su dinero —efectivo y digital— y, con IA, sabe cuánto puede gastar hoy, qué comprar y dónde, cuánto ahorrar y cómo va.

Contexto (para textos): en México solo el 58% de los adultos cubre sus gastos con sus ingresos y solo el 43% podría enfrentar una emergencia con un mes de ingresos (ENIF 2024).

La temática pide IA y análisis de datos para: optimización de canasta básica, gestión de deuda y crédito y predicción de gastos estacionales; cifrado y manejo ético de datos; Open Banking y OCR.

**Principios de producto:**
1. **Súper fácil e intuitivo**: cada acción importante en ≤ 3 toques; una acción principal por pantalla; textos cortos; estados vacíos que explican qué hacer.
2. **Funciona sin banco**: conectar el banco solo automatiza.
3. **La IA propone, la persona decide**: toda categorización automática se confirma.
4. **Solo datos reales**: la app nunca muestra cifras, productos o precios inventados. Si no hay datos suficientes, lo dice y explica qué hacer.

---

## 3. Stack técnico (plan gratuito de Firebase)

- **Python 3.12 + Flask** (application factory + blueprints), **Jinja2**, **Tailwind CSS** (CDN aceptable), **Alpine.js**, **Chart.js**.
- **PWA**: `manifest.json` + service worker básico (caché de estáticos).
- **Firebase (plan Spark)**: **Authentication** (Google y correo/contraseña) con el SDK JS en el cliente; **Cloud Firestore** vía `firebase-admin`. **No usar Cloud Storage.**
- **Archivos** (fotos, tickets, PDFs, audio): se reciben en Flask (multipart, máx. 10 MB), se procesan **en memoria** y se descartan. Nunca se guardan en disco ni en la nube. Texto de privacidad: "Tus fotos y documentos no se almacenan".
- **IA**: interfaz `LLMClient`; implementación por defecto **Gemini** (`google-genai`, capa gratuita de AI Studio), multimodal para visión. Variable `LLM_PROVIDER` para cambiar a otro proveedor (deja preparada una implementación `OpenAIClient` si hay llave).
- **Voz**: Web Speech API en el navegador (`lang="es-MX"`); el backend recibe texto.
- **PDF**: `pdfplumber`. **ETL**: `pandas`. **Precios PROFECO**: **SQLite** en `data/precios.db`.
- **Resiliencia**: `tenacity` + circuit breaker persistido en Firestore (`estadoProveedores`).
- **Servidor**: `gunicorn`; `Dockerfile` y `render.yaml`. Para ver en celular durante la demo: misma red local o túnel (documentar ngrok/Cloudflare Tunnel en el README).
- **Pruebas**: `pytest` para toda la lógica de negocio.
- **Minimiza escrituras a Firestore** (límite diario del plan gratuito): batch writes, resúmenes agregados, y seed demo ≤ 5,000 escrituras.

### Autenticación
1. El cliente inicia sesión con el SDK JS de Firebase y obtiene el ID token.
2. `POST /auth/session` → Flask verifica con `firebase_admin.auth` y crea una session cookie (`auth.create_session_cookie`).
3. La cookie se llama **`__session`** (compatibilidad futura con Firebase Hosting), `HttpOnly`, `Secure` en producción, `SameSite=Lax`.
4. Decorador `@login_required` carga `g.user` y `g.hogar_id`; si el usuario no ha completado la personalización, redirige a ella.

---

## 4. Sistema de diseño

**Marca**: logo oficial de Summa: la palabra **SUMMA** en arco sobre una casa (techo y ventana rosas, fachada rosa muy claro) con una moneda dorada con signo de pesos, sostenida por una mano rosa. Archivos:
- `static/img/logo.png`: logo completo (pantalla de bienvenida, aviso de privacidad, encabezado de escritorio).
- `static/img/logo-simbolo.png`: solo el símbolo, sin texto (favicon, íconos PWA 192/512 px, avatar de Jami, cabecera móvil). En tamaños pequeños nunca uses el logo con texto.
- Nunca deformes, recolorees ni agregues efectos al logo.

**Estética** (inspiración de referencias del equipo): fondos con degradados suaves rosa → durazno → lavanda, mucho espacio en blanco, tarjetas muy redondeadas, botones principales negros tipo píldora, cifras y títulos grandes en serif elegante.

**Tokens** (CSS variables en `:root`, reflejados en la config de Tailwind):
```
--bg:             #FFF7F4   /* blanco rosado cálido */
--surface:        #FFFFFF
--surface-soft:   #F7EFFA   /* lavanda muy clara para listas */
--brand-pink:     #EC3A6A   /* mano, techo y palabra SUMMA: acento principal */
--brand-coral:    #F58A72   /* acento secundario, degradados */
--brand-gold:     #F6B73C   /* moneda: logros, rachas, ahorro */
--brand-gold-dark:#B8741A   /* signo de pesos de la moneda */
--blush:          #FCEBE6   /* fachada de la casa del logo */
--lavender:       #CDB9EC
--ink:            #17131A   /* texto y botones principales */
--muted:          #7B7280
--success:        #2FA66A   /* ingresos, opción más barata */
--warning:        #F2B02E   /* segunda opción, avisos */
--danger:         #E5484D   /* gastos, alertas, opción más cara */
--gradient-hero:  linear-gradient(165deg, #FDF1F3 0%, #F7C6CF 45%, #F2A98F 75%, #C9A4C8 100%);
--gradient-card:  linear-gradient(150deg, #F9C9D6 0%, #F5A993 100%);
--radius-card:    24px;
--radius-pill:    999px;
```
- Tipografías (Google Fonts): **"Fraunces"** (o "Instrument Serif") para cifras grandes y títulos; **"Plus Jakarta Sans"** para todo lo demás.
- Botón primario: fondo `--ink`, texto blanco, píldora, ancho completo en móvil. Botón secundario: blanco con sombra suave.
- **Navegación inferior** (píldora flotante negra, ícono activo en `--brand-pink`): **Inicio · Movimientos · Mandado · Reportes · Perfil**.
- **Botón flotante de Jami** (círculo `--brand-pink` con el ícono de Jami) en todas las pantallas autenticadas.
- **Campana de notificaciones** en la cabecera con contador.
- Montos: gastos en `--danger` con "−", ingresos en `--success` con "+". Formato `$1,234.50` (MXN, es-MX).
- Accesibilidad: contraste AA, objetivos táctiles ≥ 44 px, etiquetas en formularios, `aria-live` en mensajes de confirmación.
- Diseño original: no copies logotipos ni ilustraciones de terceros (los logos de supermercados se muestran solo como texto).

---

## 5. Modelo de datos (Firestore)

```
usuarios/{uid}
  nombre, email, hogarId, rol ("admin"|"integrante"), personalizacionCompleta: bool,
  consentimientos { openBanking, iaDatos, ubicacion, fecha }, creadoEn

hogares/{hogarId}
  nombre, estado, municipio, codigoPostal, ubicacion? {lat, lng},
  esDemo: bool (true solo si lo creó el comando seed-demo),
  tipoHogar (calculado: "unipersonal"|"pareja"|"familia_con_hijos_pequenos"|
             "familia_con_hijos_escolares"|"familia_extensa"|"adultos_mayores"|"estudiantes"),
  ingresoMensualTotal (calculado), codigoInvitacion, creadoEn
  ├─ integrantes/{id}
  │    nombre, edad, parentesco, escolaridad ("ninguna"|"primaria"|"secundaria"|
  │    "preparatoria"|"universidad"|"posgrado"), estudiaActualmente: bool,
  │    nivelQueEstudia?, ocupacion, tipoEmpleo ("formal"|"informal"|"independiente"|
  │    "hogar"|"estudiante"|"jubilado"|"desempleado"), ingreso, periodicidadIngreso
  │    ("semanal"|"quincenal"|"mensual"|"variable"), diaDeCobro?, uid? (si tiene cuenta)
  ├─ pagosFijos/{id}          nombre, tipo ("servicio"|"suscripcion"|"renta"|"colegiatura"|
  │                           "credito"|"tarjeta_credito"|"otro"), monto, periodicidad,
  │                           diaDePago, proximaFecha, categoria,
  │                           datosCredito? {saldo, pagosRestantes},
  │                           datosTarjeta? {limite, disponible, pagoMinimo, pagoSinIntereses, fechaLimite},
  │                           origen ("personalizacion"|"banco")
  ├─ presupuesto/{AAAA-MM}    porCategoria {categoria: montoSugerido}, ahorroSugerido, generadoPor ("reglas"|"ia")
  ├─ movimientos/{id}         monto (>0), tipo ("gasto"|"ingreso"|"transferencia"),
  │                           categoria, categoriaSugeridaIA?, confianzaIA?, descripcion, comercio,
  │                           fecha, metodoPago ("efectivo"|"debito"|"credito"|"transferencia"),
  │                           origen ("manual"|"ticket"|"foto"|"pdf"|"voz"|"banco"),
  │                           integranteId, privado: bool, ticketId?, externalId?, hashDedup, creadoEn
  ├─ tickets/{id}             tienda, cadena, fecha, total, productos:
  │                           [{nombreOriginal, nombreNormalizado, productoId, cantidad, precioUnitario, categoria}]
  ├─ productosHogar/{productoId}   nombreNormalizado, compras: [{fecha, cantidad, precio, tienda}],
  │                                intervaloPromedioDias, proximaCompraEstimada, cantidadHabitual
  ├─ carrito/actual           items: [{productoId, nombre, cantidad, origen ("prediccion"|"busqueda")}], actualizadoEn
  ├─ metas/{id}               nombre (ej. "Viaje a Oaxaca"), motivacion, montoObjetivo, fechaObjetivo,
  │                           aporteSugeridoSemanal, ahorrado, activa: bool, emoji
  ├─ racha/estado             diasActuales, mejorRacha, ultimoDiaEvaluado, comodinesDisponibles,
  │                           historial: [{fecha, cumplido: bool, motivo}]  (últimos 60)
  ├─ notificaciones/{id}      tipo, titulo, mensaje, severidad, accion? {ruta}, leida, creadaEn
  ├─ recomendaciones/{AAAA-MM-DD}  items: [{titulo, detalle, impactoEstimado, categoria}]
  ├─ reglasCategoria/{comercioNormalizado}  categoria
  ├─ conexiones/{id}          proveedor, estado, ultimaSincronizacion, error?
  ├─ cuentas/{id}             tipo, institucion, saldo, ultimos4, conexionId
  └─ resumenes/{AAAA-MM}      ingresos, egresos, ahorro, porCategoria {categoria: monto}

secretosConexion/{conexionId}   proveedor, externalLinkId (cifrado Fernet)   // solo backend
precios/{productoId__tiendaId}  (SOLO fuente="ticket"): producto, tienda, cadena, municipio, lat, lng, precio, fecha
eventosTemporada/{id}           nombre, fechaInicio, fechaFin, categoria, gastoReferencia
estadoProveedores/{nombre}      fallosConsecutivos, circuitoAbiertoHasta, ultimoOk
```
SQLite `data/precios.db`: tablas `precios_profeco` (producto_id, producto, presentacion, marca, categoria, cadena, tienda, direccion, estado, municipio, lat, lng, precio, fecha) y `profeco_meta` (huella, fecha, filas, errores). Índices por producto_id, cadena, municipio.

Todo acceso a Firestore pasa por `services/firestore_repo.py`. `resumenes/{mes}` se actualiza atómicamente con cada movimiento. `hashDedup = sha256(fecha|monto|descripcionNormalizada|cuenta)`.

---

## 6. Categorías

Gastos: **Súper · Comida fuera · Transporte · Servicios · Vivienda · Educación · Salud · Hogar · Ropa · Entretenimiento · Suscripciones · Créditos · Ahorro · Otros**.
Ingresos: **Sueldo · Negocio · Apoyos · Otros ingresos**.
Cada una con ícono y color derivado de la paleta.

---

## 7. Pantallas

### 7.1 Bienvenida / Login
Inspirada en el boceto y referencias: fondo `--gradient-hero` a pantalla completa; logo de Summa al centro; título serif "Empieza gratis"; subtítulo "Organiza el dinero de tu hogar con ayuda de Jami."; botones apilados: **[Continuar con Google]** (blanco), **[Continuar con correo]** (negro), enlace "Ya tengo cuenta"; pie: "Al continuar aceptas los Términos y el Aviso de privacidad".

### 7.2 Crea tu hogar (personalización inicial)
Pantalla de entrada con ilustración de casita y el texto "Crea tu hogar". Opciones: **[Crear mi hogar]** o **[Unirme con código]**. Flujo en pasos con barra de progreso, un tema por pantalla, preguntas cortas y botón "Siguiente":
1. **Tu hogar**: nombre ("Hogar Medina"), estado, municipio, código postal; permiso opcional de ubicación (para supermercados cercanos; si lo niega, se usa el municipio).
2. **¿Quiénes viven aquí?**: tarjetas por integrante con nombre, edad, parentesco, escolaridad, si estudia actualmente (y nivel), ocupación y tipo de empleo. Botón "+ Agregar persona".
3. **Ingresos**: por integrante: monto, periodicidad y día de cobro (o "variable").
4. **Pagos fijos**: plantillas con un toque (Luz, Agua, Gas, Internet, Celular, Renta, Colegiatura, Streaming, Tarjeta de crédito, Crédito/préstamo, Otro) → monto, periodicidad y día de pago; para crédito: saldo y pagos restantes; para tarjeta: fecha límite y pago para no generar intereses.
5. **Tu motivación** (opcional): "¿Para qué te gustaría ahorrar?" (viaje, emergencia, escuela, casa, otro) + nombre y fecha deseada. Summa calcula el monto sugerido y lo muestra.
6. **Conecta tu banco** (opcional): explicación breve + [Conectar] / [Ahora no].
7. **Privacidad**: consentimientos claros → [Empezar].
Al terminar: se calcula `tipoHogar`, presupuesto sugerido, meta de ahorro óptima, y se muestra Inicio. Todo es editable después en **Perfil → Personalización**.

### 7.3 Inicio (según boceto)
De arriba abajo:
1. **Cabecera**: saludo ("Hola, Ana"), campana de notificaciones y botón **[+ Registrar gasto]** arriba a la derecha (píldora negra).
2. **Tarjeta principal** (`--gradient-card`, cifras en serif):
   - "Hoy puedes gastar" **$222** (cifra grande).
   - Debajo, en dos columnas: "Ingreso del periodo $6,000" y "Disponible hasta el 30 sep $2,000".
   - Barra delgada de avance del periodo (gastado vs. disponible).
   - Tocar la tarjeta abre "¿Cómo se calcula?" con el desglose de la fórmula en lenguaje simple.
3. **Próximos pagos**: lista de los próximos 15 días (pagos fijos de la personalización + temporadas del calendario), con fecha, monto e ícono. Enlace "Ver calendario".
4. **Tarjeta Progreso**: racha de ahorro (🔥 N días), meta motivacional con barra de avance ("Viaje a Oaxaca: $3,200 de $8,000"), y aporte sugerido de esta semana.
5. **Recomendación de Jami del día** (una sola, corta, con botón de acción).
6. **Checklist de primeros pasos** hasta completarse (registra tu primer gasto, sube un ticket, conecta tu banco).

### 7.4 Registrar gasto (según boceto)
Pantalla única con título "Registrar gasto" y un **selector de método** (lista desplegable o segmentado grande, recordando el último usado):

- **Ticket**: foto de un ticket de compra con productos (súper, farmacia, tienda). La IA extrae tienda, fecha, total y **cada producto**. Alimenta Movimientos, **Mandado** (`productosHogar`) y precios de tickets. Opción "Dividir por categoría" si el ticket es mixto.
- **Foto**: foto de cualquier otro comprobante o nota (recibo de luz, nota de la tiendita, comprobante de transferencia, factura). La IA extrae comercio, fecha, monto y, si es servicio, lo vincula al pago fijo correspondiente.
- **Manual**: teclado numérico grande → **cuadrícula de categorías con íconos** → opcionales (descripción, fecha = hoy, método de pago, quién, privado) → Guardar. **Sin IA.**
- **PDF**: estado de cuenta o factura en PDF → lista de movimientos detectados → confirmación masiva o uno por uno → deduplicación.
- **Voz**: botón de micrófono grande; **formato libre** ("ayer pagué 320 de la colegiatura con tarjeta", "85 de tacos y 40 del camión", "me cayó la quincena, 6 mil"). Puede generar varios movimientos; si falta el monto, pregunta "¿Cuánto fue?".

**Confirmación de categoría (Ticket, Foto, PDF, Voz)**: tras el análisis aparece una hoja inferior con el resumen y el mensaje **"Este gasto de $348 se registrará en Educación"** con dos botones: **[Aceptar]** y **[Cambiar categoría]** (abre la cuadrícula; al elegir, guarda). Si la persona corrige, se guarda la regla en `reglasCategoria`. Mientras la IA analiza: pantalla "Jami está leyendo tu ticket…" con animación suave. Si la IA falla: pasar a captura manual con los datos que sí se extrajeron.

Después de guardar: mensaje breve, actualización inmediata de "Hoy puedes gastar" y, si aplica, alerta de presupuesto.

### 7.5 Mandado (según boceto)
De arriba abajo:
1. **Barra de búsqueda** de productos (busca en el historial del hogar, luego en el catálogo de PROFECO).
2. **Tarjeta "✨ Sugerencia predictiva según tu consumo"** (se puede cerrar): productos que el hogar compra cada cierto tiempo y que "ya le tocan", por ejemplo "1 Leche deslactosada Lala 1 L". Cada fila: nombre con presentación, casilla/ícono para agregar al carrito y controles **+ / −** de cantidad (precargada con la `cantidadHabitual`). Texto pequeño: "Sueles comprarlo cada 7 días".
3. **Tarjeta "🛒 Mis próximas compras"** (el carrito): lo que realmente quiere comprar; se agregan productos desde la sugerencia o desde la búsqueda; editar cantidad, quitar. Se guarda en `carrito/actual`.
4. **Tarjeta "Compara tu carrito"** (se recalcula en vivo al cambiar el carrito): las **3 mejores opciones de supermercados cercanos**, en tarjetas horizontales con nombre de la cadena/tienda, **total estimado**, distancia, cobertura ("9 de 10 productos") y fecha de los precios. Cada tarjeta tiene el botón **[Ir a comprar]** coloreado por ranking **dentro de esas 3**: **verde** (`--success`) la más barata, **amarillo** (`--warning`) la segunda, **rojo** (`--danger`) la más cara. Debajo: "Ahorras $X eligiendo la opción verde".

**Algoritmo de comparación**:
- Tiendas candidatas: de `precios_profeco` (SQLite) + precios de tickets, dentro de `RADIO_KM` (env, default 5 km) de la ubicación del hogar (Haversine con lat/lng); si no hay ubicación, mismo municipio.
- Por tienda: precio más reciente de cada producto del carrito (coincidencia por `productoId`; si no, búsqueda difusa por nombre normalizado + presentación). Prioridad: precio de ticket más reciente que el de PROFECO.
- Solo tiendas con cobertura ≥ 70% del carrito; los faltantes se estiman con la mediana regional y se marcan "precio estimado".
- Ordenar por total estimado; tomar las 3 primeras.

**Redirección al súper** ("Ir a comprar"): nosotros solo armamos y redirigimos; la compra se completa en el sitio del súper.
- Archivo `data/supermercados.json` configurable por cadena: `{cadena, dominio, plataforma ("vtex"|"otra"), url_busqueda, sales_channel}` y un mapeo opcional `data/sku_map.json` (`productoId → sku` por cadena).
- Si la cadena es VTEX y todos los productos tienen SKU: construir `https://{dominio}/checkout/cart/add?sc={sc}&sku={sku}&qty={n}&seller=1&sku=...` (el parámetro `sc` una vez; `sku`, `qty` y `seller` por producto).
- Si no: abrir la búsqueda del primer producto en el sitio de la cadena y mostrar la lista copiable del carrito.
- Abrir en pestaña nueva; registrar el clic (para métricas).

**Sin datos suficientes** (nunca inventar):
- Sin tickets o con menos de 2 compras de un producto: la tarjeta de sugerencia muestra "Sube tus tickets del súper y Jami aprenderá qué compras y cada cuándo" con botón **[Subir ticket]**. Opcional: un enlace "Ver productos de la canasta básica" que abre la búsqueda filtrada por la categoría de canasta básica del catálogo de PROFECO real (sin cantidades ni sugerencias inventadas).
- Sin precios de PROFECO o de tickets en la zona: la tarjeta de comparación muestra "Aún no hay precios de tu zona" y explica que se llenará con los tickets que suba el hogar.
- Menos de 3 tiendas con cobertura suficiente: mostrar solo las que existan (1 o 2), con los colores correspondientes a su posición.

### 7.6 Movimientos
Lista agrupada por día con filtros (categoría, integrante, método de pago, origen) e insignia de origen. Botón "+ Registrar gasto". Los movimientos privados de otros integrantes no se muestran.

### 7.7 Reportes (con IA)
- Selector semana / quincena / mes.
- Resumen: ingresos, egresos, ahorro, comparación vs. periodo anterior.
- **Presupuesto vs. real por categoría** (barras de progreso con color: verde < 80%, amarillo 80–100%, rojo > 100%).
- **Dona por categoría** y **barras ingresos vs. egresos** (últimos 6 periodos).
- **Predicción**: gasto estimado del resto del mes por categoría y del próximo mes.
- **Recomendaciones de Jami** (3–5): generadas con datos agregados del hogar + tipo de hogar, cada una con impacto estimado ("Si reduces comida fuera a $1,200, ahorras $600 al mes").
- **Próximas temporadas** (calendario mexicano) con gasto estimado y cuánto apartar por semana.

### 7.8 Perfil
Personalización (hogar, integrantes, ingresos, **pagos fijos**, ubicación), metas, conexiones bancarias (Open Banking), notificaciones, privacidad (descargar mis datos, borrar cuenta, consentimientos), **estado de proveedores** (demo), **"Apoya a Summa"** (donativos), cerrar sesión.

### 7.9 Calendario (desde "Ver calendario" en Inicio)
Temporadas y celebraciones mexicanas (seed): Día de Reyes, cuesta de enero, predial, San Valentín, Semana Santa, Día del Niño, Día de las Madres, vacaciones de verano, regreso a clases, Fiestas Patrias, Día de Muertos, Buen Fin, aguinaldo, posadas, Navidad. Cada una con gasto estimado para ese hogar y apartado semanal. Destaca las relevantes al tipo de hogar (regreso a clases solo si hay integrantes estudiando).

### 7.10 Notificaciones
Centro de notificaciones (campana) con lista, estado leído/no leído y acción que lleva a la pantalla correspondiente. Aviso tipo *toast* dentro de la app cuando se genera una alerta en tiempo real (al registrar un gasto). Web push con Firebase Cloud Messaging es **opcional** (fase final, si hay tiempo).

### 7.11 Apoya a Summa (donativos)
- Sección en Perfil y tarjeta discreta que aparece **solo** después de un logro (meta alcanzada, racha de 7/30 días) con el texto: "¿Summa te ayudó? Si quieres, puedes apoyarnos para seguir mejorando."
- Botón que abre un enlace externo configurable (`DONATION_URL`, p. ej. un enlace de cobro de un procesador de pagos). **Summa no procesa pagos ni guarda datos de tarjeta.**
- Nunca bloquea funciones, no aparece cuando el usuario está en alerta de presupuesto, y se puede ocultar ("No volver a mostrar").

### 7.12 Jami (asistente)
- Panel inferior tipo chat, abierto desde el botón flotante. Presentación: "Hola, soy Jami. Te ayudo a organizar el dinero de tu hogar."
- **Preguntas sugeridas** según la pantalla actual y el estado del hogar: "¿Cuánto puedo gastar hoy?", "¿En qué se me fue el dinero esta quincena?", "¿Me alcanza para el regreso a clases?", "¿Cómo voy con mi meta?", "¿Dónde me sale más barato mi mandado?", "¿Cómo registro un ticket?".
- **Guía de navegación**: Jami puede responder con **botones de acción** que llevan a pantallas (ej. "Abrir Registrar gasto → Ticket", "Ir a Mandado"). Implementa una herramienta `navegar(ruta, parametros)` que el frontend convierte en botón.
- **Conectado a la base de datos** mediante *function calling* (no inventa cifras):
  `hoy_puedo_gastar()`, `resumen_periodo(periodo)`, `gastos_por_categoria(categoria, periodo)`, `presupuesto_vs_real(periodo)`, `proximos_pagos(dias)`, `estado_meta()`, `estado_racha()`, `comparar_carrito()`, `sugerencias_mandado()`, `proxima_temporada()`, `simular_compra_a_meses(monto, meses, tasa_anual?)`, `costo_real_credito(monto, pago, periodicidad, numero_pagos)`, `navegar(ruta)`.
- Reglas: español claro y breve; cifras solo desde herramientas; indicar estimaciones; no recomendar productos de inversión específicos; nunca pedir contraseñas; datos mínimos al LLM (sin nombres completos, correos ni números de cuenta).
- Historial de la conversación solo en la sesión del navegador (no se guarda en Firestore).

---

## 8. Reglas de negocio (con pruebas en `tests/`)

**8.1 Disponible y "Hoy puedes gastar"**
```
periodo = desde el último cobro hasta el próximo cobro del hogar
          (con varios integrantes: se usa el calendario combinado de cobros; el periodo termina en el próximo cobro de cualquiera)
ingreso_periodo = Σ ingresos de integrantes que caen en el periodo
                  (periodicidad "variable": promedio de los 2 periodos más bajos de los últimos 6; sin historial: monto × 0.9)
comprometido = Σ pagos fijos con proximaFecha en el periodo y no pagados
               (tarjeta de crédito: pagoSinIntereses)
apartados = aporte a la meta/ahorro del periodo + apartado de la próxima temporada prorrateado
gastado = Σ gastos del periodo pagados con efectivo/débito/transferencia
          (compras con crédito no restan aquí; se reflejan en el pago de la tarjeta)
disponible = ingreso_periodo − comprometido − apartados − gastado
hoy = max(0, disponible / días_restantes)
```
Si `disponible < 0`: mostrar $0 y alerta "Esta quincena vas $X por encima". Endpoint `/api/inicio/desglose` devuelve cada término para la vista "¿Cómo se calcula?".

**8.2 Doble conteo de tarjetas**: compra con crédito = `gasto` (cuenta en reportes). Pago de tarjeta desde débito = `transferencia` (no cuenta como gasto). Detectar por descripción ("PAGO TDC", "PAGO TARJETA"…) y cuenta destino.

**8.3 Tipo de hogar** (`tipoHogar`): reglas por número de integrantes, edades y ocupación (ej. algún integrante 6–17 años estudiando → `familia_con_hijos_escolares`; todos ≥ 60 → `adultos_mayores`).

**8.4 Presupuesto sugerido por categoría**:
- Base: proporciones de gasto de hogares mexicanos (ENIGH 2024: alimentos ≈ 38%, transporte ≈ 20%, vivienda y energía ≈ 15%, educación ≈ 10%) como punto de partida, en `data/presupuesto_base.json`.
- Ajustes por tipo de hogar (ej. Educación sube si hay estudiantes; Salud sube con adultos mayores) y por pagos fijos declarados (se respetan como mínimos).
- Ajuste por historial real: tras 30 días, mezcla 50/50 entre la base y el promedio real, acotando cambios bruscos.
- Siempre reserva primero el **ahorro sugerido** (8.5).
- Guardar en `presupuesto/{mes}`; la IA puede redactar la explicación, pero los montos salen de estas reglas.

**8.5 Meta de ahorro óptima**:
- `capacidad = ingreso_mensual − pagos_fijos − gasto_esencial_estimado` (Súper, Servicios, Transporte, Salud, Educación, Vivienda).
- `ahorro_sugerido = clamp(capacidad × 0.5, ingreso × 0.05, ingreso × 0.20)`; si `capacidad ≤ 0`, sugerir 3% y mostrar recomendaciones para liberar dinero.
- **Fondo de emergencia**: objetivo = 3 meses de gasto esencial; mientras no se alcance 1 mes, el 60% del ahorro sugerido va al fondo y el 40% a la meta motivacional.
- **Meta motivacional** (ej. viaje): `aporte_semanal = (monto − ahorrado) / semanas_restantes`; si supera el 40% del ahorro sugerido, proponer nueva fecha realista.

**8.6 Racha de ahorro**:
- Se evalúa una vez al día (comando `flask evaluar-rachas` y también al abrir la app si el día anterior no se evaluó).
- Un día cuenta como **"día de ahorro"** si: el gasto discrecional del día (todo excepto pagos fijos y categorías esenciales comprometidas) ≤ "Hoy puedes gastar" de ese día **y** no hubo un gasto marcado como atípico. Con banco conectado, además se verifica con los movimientos importados y el saldo (si el saldo bajó más que el disponible diario, no cuenta).
- **1 comodín por semana** que protege la racha (se consume automáticamente).
- Hitos 3, 7, 14, 30, 60 días con celebración visual (dorado `--brand-gold`) y notificación.
- Mostrar en Inicio (Progreso) y en la meta: "Llevas 🔥 12 días ahorrando para tu viaje".

**8.7 Reposición (Mandado)**: por `productoId` con ≥ 2 compras: `intervalo = promedio de días entre compras`; `próxima = última + intervalo`; sugerir si `próxima ≤ hoy + 3`; cantidad = `cantidadHabitual` (moda de cantidades).

**8.8 Normalización de productos**: el LLM convierte nombres de ticket ("LECHE DESL LALA 1LT") a `nombreNormalizado` ("Leche deslactosada Lala 1 L") y los enlaza con el catálogo de PROFECO cuando hay coincidencia (producto + marca + presentación); `productoId` = slug estable.

**8.9 Temporadas**: gasto estimado = promedio del hogar en esa ventana en años previos; sin historial, `gastoReferencia × (ingreso_hogar / ingreso_referencia)`; apartado semanal = faltante / semanas restantes.

**8.10 Alertas y notificaciones**:
- **Presupuesto**: categoría al 80% y al 100% del presupuesto del mes; ritmo de gasto (si al día 10 ya se gastó > 50% de una categoría).
- Gasto atípico (> 2.5× promedio de la categoría), posible duplicado (mismo monto y comercio en ≤ 48 h).
- Pago fijo por vencer (≤ 3 días), tarjeta de crédito (fecha límite ≤ 5 días o uso > 80%).
- Temporada próxima (30 días antes), hitos de racha, meta alcanzada.
- Máximo 3 notificaciones proactivas por día para no saturar.

**8.11 Categorización**: 1) regla aprendida del hogar → 2) categoría del proveedor bancario mapeada → 3) LLM con la lista fija (devuelve categoría y confianza) → 4) "Otros". Siempre se confirma con el usuario (excepto registro manual, donde la elige él).

**8.12 Recomendaciones por perfil**: diariamente (comando) se generan 3–5 recomendaciones con datos **agregados** (presupuesto vs. real, tipo de hogar, temporadas, precios del mandado). Las cifras las calcula el backend; el LLM solo redacta. Ejemplos: "Tu hogar gasta 40% más en comida fuera que el presupuesto sugerido", "En tu lista del súper, cambiar de tienda te ahorra $142".

---

## 9. Open Banking: conectores con failover

Interfaz `BankProvider` (`connectors/base.py`): `health_check`, `create_connect_session`, `list_accounts`, `list_transactions(since)`, `list_credit_cards`, `delete_link`. Modelos normalizados: `NormalizedAccount`, `NormalizedTransaction` (externalId, fecha, monto con signo, descripcion, referencia, saldo?, categoriaProveedor?), `NormalizedCreditCard` (limite, disponible, saldo, pagoMinimo, pagoSinIntereses, fechaLimite).

Adaptadores:
- `syncfy.py` (Syncfy, antes Paybook Sync; base de referencia `https://opendata-api.syncfy.com/v1`; API key sandbox/producción; tokens por usuario de corta vida; SDK `sync-py`). **Verificar endpoints en su documentación.**
- `finerio.py` (Finerio Connect; base de referencia `https://apiv2.finerioconnect.com/`). Mapear su categorización a la nuestra.
- `simulated.py`: fixtures JSON con la misma forma que los normalizados; institución **"Banco de prueba"** (nunca el nombre de un banco real). Incluye nómina quincenal, tarjeta con saldo/pago mínimo/pago sin intereses, suscripción que subió, cargo duplicado, pago de tarjeta próximo.

Router (`router.py`): orden `PROVIDER_ORDER` (default `syncfy,finerio,simulated`; `simulated` solo si `DEMO_MODE=true`); circuit breaker persistido en `estadoProveedores/{nombre}` (3 fallos o timeout > 8 s → abierto 5 min → prueba half-open); `tenacity` con 3 reintentos (1, 2, 4 s). Conexión nueva → primer proveedor sano. Conexión existente → solo su proveedor; si está caído se conservan datos, se muestra "Última actualización: hace X" y se reintenta; > 24 h → ofrecer "Reconectar por otra vía". **La UI nunca consulta al proveedor en vivo**; lee Firestore. Grabar respuestas reales en `fixtures/recorded/` con `RECORD_RESPONSES=true`. Panel "Estado de proveedores" en Perfil con botón (solo `DEMO_MODE`) para **forzar fallo** y demostrar el failover.

Pipeline de sincronización: cuentas + tarjetas + transacciones → normalizar → dedup → categorizar → marcar transferencias → upsert → tarjetas como pagos fijos (`origen="banco"`) → evaluar racha → alertas → resúmenes. Identificadores de conexión cifrados (Fernet, `ENCRYPTION_KEY`) en `secretosConexion`.

---

## 10. PROFECO: Quién es Quién en los Precios (ETL a SQLite)

Fuente: `https://datos.profeco.gob.mx/datos_abiertos/` (un archivo por año, "Quien es Quien en los Precios 2026", más metadatos y diccionario; enlaces `file.php?t=<token>`; actualización irregular).

`services/profeco_etl.py` + comando `flask profeco-sync [--file RUTA]`:
1. Descubrir el enlace buscando en el HTML el `<a>` con texto `Quien es Quien en los Precios {año}` (fallback año anterior). No hardcodear el token.
2. Descargar en streaming; SHA-256; si coincide con `profeco_meta.huella`, terminar.
3. Detectar formato (CSV / ZIP / XLSX) y codificación (`utf-8`, luego `latin-1`).
4. Leer por bloques (`chunksize=100_000`).
5. Validar columnas con un `COLUMN_MAP` único. Columnas esperadas aproximadas (confirmar con el diccionario): `PRODUCTO, PRESENTACION, MARCA, CATEGORIA, CATALOGO, PRECIO, FECHAREGISTRO, CADENACOMERCIAL, GIRO, NOMBRECOMERCIAL, DIRECCION, ESTADO, MUNICIPIO, LATITUD, LONGITUD`. Si faltan obligatorias (producto, precio, fecha, cadena/tienda, estado) → abortar y registrar error.
6. Filtrar por `PROFECO_ESTADOS` (y opcional `PROFECO_MUNICIPIOS`), normalizando mayúsculas y acentos.
7. Precio vigente por (producto+presentación+marca, tienda): el más reciente.
8. Escribir en SQLite (transacción, `INSERT OR REPLACE`); registrar en `profeco_meta`.
- Con `--file` procesa un archivo local (carga inicial del hackathon).
- Mostrar siempre "Fuente · fecha" en cada precio y la leyenda "Precios de referencia; pueden variar en tienda".

---

## 11. Comandos (reemplazan tareas programadas)

`flask seed-demo [--reset]` · `flask profeco-sync [--file]` · `flask sync-banks` · `flask provider-health` · `flask daily-alerts` · `flask evaluar-rachas` · `flask generar-recomendaciones`.
También expuestos como `POST /jobs/*` protegidos con `X-Cron-Secret` (para un cron externo en producción). Idempotentes.

---

## 12. IA: prompts y esquemas

Respuestas del LLM en **JSON validado con pydantic**; si no valida, reintentar una vez y luego degradar a captura manual.
- **Ticket** → `{comercio, cadena, fecha, total, productos:[{nombre_original, nombre_normalizado, marca?, presentacion?, cantidad, precio_unitario, categoria}], categoria_sugerida, confianza}`
- **Foto** → `{tipo_documento: "recibo_luz"|"recibo_agua"|"recibo_gas"|"recibo_internet"|"nota"|"comprobante_transferencia"|"factura"|"otro", comercio, fecha, monto, categoria_sugerida, confianza, datos_servicio?: {periodo_inicio, periodo_fin, kwh?, fecha_limite?}}`
- **Voz** → `{movimientos:[{tipo, monto|null, categoria, descripcion, fecha ISO (resolviendo "ayer", "el lunes" con zona America/Monterrey), metodo_pago|null, integrante|null}], faltantes:[]}`
- **PDF** → texto por página con `pdfplumber` → `[{fecha, descripcion, monto con signo, referencia}]` → categorización por lote.
- **Recomendaciones** y **explicación de presupuesto**: el LLM recibe solo cifras agregadas ya calculadas y redacta.
- Nunca enviar al LLM nombres completos, correos, números de cuenta ni direcciones exactas.

---

## 13. Seguridad y privacidad

- Sesión verificada en cada vista/endpoint; `hogarId` siempre desde la sesión.
- `firestore.rules`: cada usuario lee/escribe su documento y el hogar donde es integrante; movimientos `privado=true` solo para su `integranteId`; `secretosConexion`, `estadoProveedores` sin acceso desde cliente; `precios` y `eventosTemporada` solo lectura para autenticados. (El backend usa Admin SDK; las reglas protegen cualquier acceso directo desde el cliente.)
- CSRF en formularios, cabeceras de seguridad (Flask-Talisman), límite de tamaño de subida, validación de tipo de archivo.
- Archivos procesados en memoria y descartados. Fernet para identificadores de conexión. Logs sin datos personales.
- **Aviso de privacidad** (Ley Federal de Protección de Datos Personales en Posesión de los Particulares): qué se guarda y para qué, derechos ARCO, cómo borrar la cuenta. Frases visibles: "No vendemos tus datos ni los usamos para publicidad de terceros." "Nunca vemos ni guardamos tus contraseñas bancarias." "Tus fotos y documentos no se almacenan."
- Descargar mis datos (JSON) y borrar cuenta.
- La ubicación solo se usa para supermercados cercanos y es opcional.

---

## 13A. Datos reales y estados vacíos (obligatorio)

1. **Prohibido** escribir directamente en plantillas, JavaScript o Python montos, nombres de personas, movimientos, productos, precios, tiendas, saldos, rachas o estadísticas de usuario. Todo se obtiene de:
   - **Firestore**: datos que captura el usuario o que llegan de su banco.
   - **SQLite de PROFECO**: cargada desde el archivo oficial descargado.
   - **Conectores bancarios**: Syncfy / Finerio (sandbox o producción).
2. **Datos de catálogo permitidos** (no son datos del usuario), en archivos de `/data` con su fuente documentada en un comentario o `README`: categorías e íconos, calendario de temporadas mexicanas (nombres y fechas), proporciones base del presupuesto (ENIGH 2024), configuración de cadenas de supermercados (`supermercados.json`), textos de ayuda.
3. **Usuario nuevo = app vacía**. Cada pantalla tiene un **estado vacío** con ilustración ligera, una frase que explica qué falta y un botón de acción:
   - Inicio sin ingresos: "Completa tu personalización para calcular cuánto puedes gastar" → [Completar].
   - Movimientos: "Registra tu primer gasto" → [+ Registrar gasto].
   - Reportes: "Necesitamos al menos 7 días de registros para tu primer reporte" (mostrar cuántos días lleva).
   - Mandado: ver sección 7.5.
   - Progreso: "Define tu meta y empieza tu racha" → [Crear meta].
   - Notificaciones: "Todo en orden por ahora".
4. **Umbrales mínimos antes de calcular** (si no se cumplen, mostrar "Aún no hay suficientes datos" y qué falta):
   - "Hoy puedes gastar": al menos un ingreso registrado en la personalización.
   - Presupuesto real vs. sugerido: 7 días de registros (antes solo se muestra el sugerido).
   - Predicción de gasto: 30 días de datos.
   - Reposición: 2 compras del mismo producto.
   - Recomendaciones de Jami: 7 días de registros; antes, solo consejos de uso de la app.
   - Temporadas: sin historial se usa la referencia escalada al ingreso real del hogar, marcada como "estimación".
5. **La IA nunca completa datos por su cuenta**: si no puede leer un ticket, una foto, un PDF o una frase de voz, muestra el error y ofrece captura manual con lo que sí extrajo. Si el LLM no está disponible, las funciones de IA muestran "Jami no está disponible en este momento" y el resto de la app sigue funcionando.
6. **Jami** solo responde cifras que devuelven las herramientas; si una herramienta no tiene datos, lo dice.
7. **Banco simulado**: solo existe si `DEMO_MODE=true`, se muestra como "Banco de prueba" con una etiqueta visible "Datos de prueba", y sus movimientos llevan `origen="banco"` y `esPrueba=true`. En producción no aparece.
8. **Revisión**: al terminar la fase 1, busca en todo el repositorio valores escritos a mano (montos con `$`, nombres propios, arreglos de productos o movimientos en plantillas/JS) y reporta la lista de lo que quitaste.

## 13B. Firestore: reglas, índices y verificación

- Genera `firestore.rules` con las reglas de la sección 13 y `firestore.indexes.json` con los índices compuestos que necesiten las consultas (por ejemplo, `movimientos` por `integranteId` + `fecha`, por `categoria` + `fecha`, por `privado` + `fecha`; `notificaciones` por `leida` + `creadaEn`).
- En el README, indica el comando exacto para desplegarlos: `firebase deploy --only firestore:rules,firestore:indexes`.
- Si una consulta devuelve un error de índice faltante, registra en el log el enlace que da Firestore para crearlo.
- **Verificación al iniciar** (`app/health.py`, ejecutada en `create_app` y visible en `/health` solo para administradores o en desarrollo):
  - Variables de entorno obligatorias presentes (`FLASK_SECRET_KEY`, `GOOGLE_APPLICATION_CREDENTIALS` o credenciales por defecto, `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_*`, `GEMINI_API_KEY`, `ENCRYPTION_KEY`).
  - Conexión a Firestore (lectura de prueba).
  - Existencia de `data/precios.db` y fecha de la última carga de PROFECO.
  - Estado de los proveedores bancarios.
  - Si falta algo, mostrar una página clara en desarrollo ("Falta la variable GEMINI_API_KEY en .env") y registrar el error; nunca fallar en silencio ni usar valores por defecto inventados.

## 14. Datos para ensayar la demo (`flask seed-demo`, solo manual)

- **Nunca** se ejecuta automáticamente, ni al iniciar la app, ni en migraciones, ni en pruebas contra la base real.
- Requiere confirmación explícita: `flask seed-demo --email cuenta-demo@... --confirm`.
- Crea el hogar en una **cuenta aparte** de ensayo, marcado con `esDemo: true`, y nunca modifica hogares de usuarios reales. `flask seed-demo --reset` solo borra hogares con `esDemo: true`.
- **No crea precios de supermercados** ni tiendas: los precios siempre vienen de PROFECO real o de tickets reales.
- Contenido: un hogar con integrantes, ingresos y pagos fijos, y movimientos y tickets de ejemplo claramente identificables como ensayo. Máximo ~5,000 escrituras.
- **Recomendación del equipo para la demo final**: usar la app con datos reales de un integrante desde hoy (gastos reales, tickets reales del súper) en lugar del hogar de ensayo.

---

## 15. Fases de entrega (en este orden)

1. **Refactor a Summa + base**: nombre, logo y colores oficiales, sistema de diseño, navegación, auth con `__session`, sin Storage, **eliminación de datos predeterminados (13A) con reporte**, `firestore.rules`, `firestore.indexes.json`, verificación de arranque (13B), README.
2. **Bienvenida/Login + Crea tu hogar** (personalización completa) + `tipoHogar`.
3. **Inicio** (tarjeta con fórmula y desglose, próximos pagos, progreso) con todos sus estados vacíos. El comando `seed-demo` (sección 14) se hace aquí, solo manual.
4. **Registrar gasto**: Manual + Ticket con confirmación de categoría.
5. **Foto, Voz y PDF**.
6. **Presupuesto sugerido + meta de ahorro óptima + alertas de presupuesto + centro de notificaciones**.
7. **Mandado**: productos del hogar desde tickets, sugerencia predictiva, carrito, búsqueda.
8. **PROFECO ETL (SQLite) + comparación de 3 supermercados con colores + redirección**.
9. **Jami** con function calling, preguntas sugeridas y navegación.
10. **Reportes con IA** (presupuesto vs. real, predicción, recomendaciones) + calendario.
11. **Conectores**: simulado + router con failover + panel; luego Syncfy; luego Finerio.
12. **Racha de ahorro** con metas + hitos.
13. **Apoya a Summa** (donativos).
14. **Seguridad final**, privacidad, pruebas, revisión de accesibilidad y pulido visual.

Criterio de "listo" por fase: arranca sin errores, flujo principal probado a mano, pruebas en verde, commit.

---

## 16. Guion de la demo (lo que DEBE funcionar)

Se hace con **datos reales** capturados por el equipo (hogar real de un integrante, gastos y tickets reales), no con información predeterminada.

1. Bienvenida → Crea tu hogar (personalización en vivo) → Inicio con "Hoy puedes gastar" y su desglose.
2. **+ Registrar gasto → Ticket**: "Este gasto se registrará en Súper" → Aceptar → baja el disponible.
3. **Voz**: "ayer gasté 150 en gasolina" → Aceptar.
4. Alerta: "Llevas 85% de tu presupuesto de comida fuera".
5. **Mandado**: sugerencia predictiva → agregar al carrito → 3 supermercados con botones verde/amarillo/rojo → Ir a comprar.
6. **Jami**: "¿Me alcanza para el regreso a clases?" y "Llévame a mi mandado".
7. **Progreso**: racha 🔥 y meta de viaje.
8. **Resiliencia**: forzar fallo de Syncfy → la app sigue funcionando.

## 17. Fuera de alcance

Mover dinero o pagar desde la app, procesar donativos dentro de la app, tandas, hardware, notificaciones push nativas de tiendas de apps.
