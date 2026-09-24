# Entrega en Rosy

Se implementaron las doce fases del prototipo con un commit por fase. Los commits son locales; no se publicó la rama ni se desplegaron servicios.

| Fase | Resultado |
| --- | --- |
| 1 | Factory Flask, blueprints, Firebase auth, diseño, PWA, Docker/configuración |
| 2 | Hogar demo reproducible con cuatro meses, 14 tickets y precios etiquetados |
| 3 | Onboarding y presupuesto, salud, colchón y próximos pagos |
| 4 | Captura manual, ticket, categorías, privacidad, confirmación y lista |
| 5 | Voz, recibos y PDF con extracción o ejemplos explícitos |
| 6 | Reportes y comparaciones entre periodos |
| 7 | Banco de prueba, failover persistente, cifrado, sincronización y panel |
| 8 | Pagos fijos, tarjetas, recurrencias, alertas y registro atómico |
| 9 | ETL por bloques, reposición y mandado compartido |
| 10 | Calendario y previsión de temporadas |
| 11 | Copiloto con herramientas de backend y modo local |
| 12 | Reglas, privacidad, exportación/borrado, revisión y pruebas |

## Validado localmente

- 40 pruebas pytest: reglas de negocio, deduplicación, resúmenes, pagos, ETL, privacidad, endpoints y borrado.
- Revisión Ruff: sin errores en las reglas configuradas.
- Chrome real sin interfaz, móvil y escritorio: el recorrido inicial pasó sin errores JavaScript ni desbordamiento horizontal. Una comprobación posterior completó también onboarding, QR y failover, pero detectó un error de sintaxis en la configuración de Tailwind añadida después. Se corrigió y se validó con Node; no se repitió Chrome tras la corrección porque se rechazó el permiso de ejecución.
- Inicio de Flask y respuesta de `/health`.

## Límites y pendientes externos

- Firebase Auth/Firestore/Storage y Gemini están implementados, pero no se validaron contra cuentas reales ni emuladores en este equipo.
- Los adaptadores reales Syncfy/Finerio son fronteras deshabilitadas, con TODO explícito; la demo usa simulaciones para los tres proveedores. Requieren sandbox, contratos de respuesta y widget autorizado. No se hicieron conexiones bancarias reales.
- El ETL se probó con archivos sintéticos; falta validar el archivo anual/diccionario actual de PROFECO. Los fixtures no se presentan como precios oficiales.
- Docker/Cloud Run/Hosting/Scheduler no fueron ejecutados ni desplegados. Python 3.12 está configurado en Docker/CI; las pruebas locales usaron 3.13.7.
- Completar los datos del responsable y revisar el aviso de privacidad antes de admitir datos reales.
- Los estilos y gráficas usan CDN. La PWA cachea recursos propios estáticos; no ofrece registros financieros sin conexión ni cachea datos privados.
- La comparación de precios exige identidad coincidente de producto. El mapeo del catálogo real de PROFECO y normalización entre marcas debe calibrarse con archivos/tickets reales.
- Grabación/reproducción de respuestas bancarias reales y cola de sincronización inmediata en Cloud Run quedan pendientes hasta habilitar proveedores reales.
