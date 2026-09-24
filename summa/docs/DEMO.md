# Recorrido Summa
1. Inicia sesión y crea un hogar con sus datos reales. Sin Firebase, LOCAL_MODE=true permite un hogar local vacío.
2. Completa los siete pasos. Revisa ingresos y próximos cobros; agrega pagos habituales y una meta opcional.
3. Inicio muestra el disponible y su fórmula. Sin ingresos muestra qué falta.
4. Registrar gasto → Manual funciona sin IA. Ticket, Foto, Voz y PDF necesitan consentimiento y una llave válida. Revisa el resultado y acepta/corrige categorías; originales nunca se guardan.
5. Mandado → agrega productos. Dos compras del mismo producto permiten estimar reposición. Sin precios oficiales o tickets comparables no aparecen tiendas ficticias.
6. Reportes: 7 días para hábitos y 30 para proyecciones. Generar recomendaciones requiere IA disponible.
7. Jami: “Llévame a mi mandado” funciona como navegación; las respuestas financieras mediante herramientas requieren Gemini.
8. DEMO_MODE=true habilita Banco de prueba. Perfil → conectar → sincronizar por CLI → confirmar movimientos. Forzar fallo abre el circuito; no se pierden registros existentes. Syncfy/Finerio siguen deshabilitados hasta validar acceso real.
9. Cierra el día después de registrar tus gastos. La racha se evalúa al día siguiente; días sin evidencia no suman.
10. Para un ensayo separado, crea primero una cuenta Firebase distinta y ejecuta `flask --app app seed-demo --email CUENTA --confirm`. No genera precios ni tiendas. `--reset` rechaza hogares reales.
