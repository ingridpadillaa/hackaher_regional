# Summa

Copiloto financiero del hogar · HackaTec 2026 / HackaHer.

**React + Vite + TypeScript + Tailwind CSS**, con Firebase Hosting, Authentication, Firestore y Cloud Functions (Node.js/TypeScript). Proyecto: `hackaher`, plan Blaze; Firestore `(default)` en `nam5`.

La nueva interfaz implementa cuatro módulos: **Inicio, Carrito, Simulador y Perfil**, precedidos por cuenta, hogar y personalización obligatoria. Código en `summa/web/` y `summa/functions/`. El recorrido principal se comprobó con emuladores y Chrome móvil.

**Publicación pendiente:** el permiso para desplegar fue rechazado. Gemini necesita clave/modelo; los carritos externos necesitan catálogo e integración; Syncfy está configurado para sandbox, sin ahorro bancario real.

Consulta [instalación, arquitectura, pruebas, integraciones y despliegue](summa/README.md). La versión Python/Flask permanece como referencia en `summa/app/`.
