# Estado de la migración Summa
Código en la rama Rosy, entregado por fases con commits. No se ha publicado ni desplegado.

Implementado: cuentas vacías, diseño Summa e ilustraciones originales Jami, personalización de siete pasos, ingresos combinados, disponible desglosado, registro unificado con confirmación, presupuesto/ahorro por reglas, notificaciones limitadas, carrito/reposición, ETL PROFECO SQLite, comparación geográfica y por cobertura, Jami con herramientas, reportes con umbrales, banco simulado identificado, rachas con evidencia, metas y donativos externos.

Validación local: pytest con bases temporales, comprobación Ruff, compilación de todas las plantillas y validación Node de JavaScript estático y generado. El flujo nuevo hogar → pantallas principales → borrado se prueba con el cliente Flask. OCR se prueba con respuestas controladas; no se hizo una llamada de pago ni se leyó un documento real mediante IA.

Pendientes externos:
- Logo oficial Summa no incluido en los archivos recibidos; se usa texto Summa y el avatar original Jami. No se generaron logo-simbolo ni iconos oficiales 192/512.
- Configurar Firebase Auth/Firestore, Gemini y ENCRYPTION_KEY. Reglas/índices no desplegados ni verificados con emulador.
- Descargar/cargar el archivo real de PROFECO. Las pruebas de ETL usan fixtures temporales explícitos, sin presentarlos como datos reales.
- Syncfy/Finerio requieren contratos y credenciales sandbox; no se inventaron endpoints. Grabación de respuestas reales queda pendiente de habilitar esos adaptadores.
- Redirección de búsqueda configurada para Chedraui; otras cadenas requieren dominios/URLs verificados y un sku_map real para precargar carritos. El ranking muestra solo las tiendas con precios suficientes.
- DONATION_URL y datos del responsable del aviso ARCO pendientes de configuración.
- Docker y Render no ejecutados. Render gratuito no conserva cambios de SQLite tras reinicios/despliegues; vuelve a cargar PROFECO desde fuente oficial. El despliegue local conserva data/precios.db.
- No se repitió la revisión visual en Chrome: la ejecución anterior del navegador fue rechazada. No se afirma validación visual de esta migración.

Las estimaciones son de planificación. La personalización pide confirmar un monto para la meta; no inventa un costo de viaje/escuela. El historial de chat se mantiene en sessionStorage y se elimina al cerrar sesión.

## Integración Firebase/Gemini
Se agregó inicialización única Admin con archivo/ADC, variables web separadas, recuperación de contraseña, Gemini con modelo configurable y validación de disponibilidad, y scripts/check_connections.py. El archivo .env no se encontró en las raíces comprobadas; la verificación real queda pendiente de su ruta. No se copiarán las claves del chat a archivos. Ver docs/CONEXIONES.md para pasos exactos.
