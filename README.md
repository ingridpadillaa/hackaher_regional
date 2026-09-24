# Summa

Copiloto financiero del hogar · HackaTec 2026 / HackaHer.

React + Vite + TypeScript + Tailwind CSS, con Firebase Hosting, Authentication, Firestore y Cloud Functions. La interfaz tiene cuatro módulos: **Inicio, Carrito, Simulador y Perfil**.

## Organización

```text
frontend/                 Interfaz React, estilos e imágenes
  src/                    Pantallas y componentes
  public/                 Recursos públicos de la app
  assets/                 Propuestas visuales del equipo
  legacy/                 Plantillas y estáticos de la versión Flask
  scripts/                Comprobaciones de navegador
backend/                  Lógica del servidor
  functions/              API TypeScript de Firebase Functions
  app/                    Backend Python/Flask de referencia
  data/                   Catálogos y datos locales
  tests/                  Pruebas Python
  scripts/                Integraciones y herramientas del servidor
  firestore.rules         Reglas de acceso
  firestore.indexes.json  Índices
  Dockerfile              Imagen del backend Flask
  render.yaml             Configuración de Render para Flask
docs/                     Documentación Markdown
AGENTS.md                 Instrucciones del proyecto
.gitignore                Exclusiones de Git
package.json              Comandos y workspaces compartidos
package-lock.json         Versiones de dependencias
firebase.json             Configuración de Firebase y emuladores
```

Todo archivo Markdown queda fuera de `frontend/` y `backend/`. Las configuraciones compartidas de npm, Firebase, Docker y CI permanecen en la raíz o `.github/`.

## Desarrollo

Desde la raíz del repositorio, con Node.js 22 y npm:

```sh
npm ci
cp frontend/.env.example frontend/.env.local
npm run dev
```

Completa la configuración pública de Firebase en `frontend/.env.local`. Los secretos del servidor nunca deben ponerse en variables `VITE_*`.

Para trabajar con emuladores, consulta [la guía de desarrollo](docs/DESARROLLO.md).

```sh
npm test
npm run build
```

Para la versión Python de referencia:

```sh
python -m pip install -r backend/requirements.txt
cd backend
python -m pytest -q
flask --app app run --debug
```

La imagen Flask se construye desde la raíz con `docker build -f backend/Dockerfile -t summa-backend .`. Incluye las plantillas de `frontend/legacy/`. En Render, usa `backend/render.yaml` como ruta del Blueprint; el contexto es la raíz del repositorio.

## Finanzas y experiencia · fases 1–3

Reportes por mes con ingresos recibidos separados de previsiones, presupuesto mensual independiente, aportaciones y retiros por meta, racha semanal declarada y agenda de cobros/pagos/aportaciones. Fondos arena, Jami circular y Perfil simplificado. La migración aditiva a versión 2 se ejecuta al cargar cada hogar, conservando sus datos. Consulta [el modelo de datos](docs/MODELO_DATOS.md). No se ha desplegado esta actualización a producción ni cargado el dataset de demostración.

## Documentación

- [Desarrollo, integraciones y despliegue](docs/DESARROLLO.md).
- [Configuración de conexiones Python](docs/CONEXIONES.md).
- [Catálogos del backend](docs/DATOS.md).
- [Diseño inicial del equipo](docs/DISENO_INICIAL.md), conservado como referencia histórica.

La versión Flask se conserva como referencia y no participa en el build de React. El despliegue público continúa pendiente; subir código a GitHub no despliega la aplicación.
