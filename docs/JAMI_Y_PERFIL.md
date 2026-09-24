# Perfil, Jami y demostración

## Perfil

Selecciona una persona dentro de **Tu hogar** para editar nombre, edad, estudios, ocupación, ingreso y periodicidad. Elimina perfiles desde ese mismo editor, con confirmación. Solo administra el hogar su propietario; el perfil administrador se conserva. Al eliminar un perfil con cuenta vinculada se retira su acceso al hogar, sin borrar la cuenta de Authentication ni los movimientos históricos.

Ingreso mensual, municipio y permisos se muestran durante el registro. Después desaparecen de Perfil. El servidor conserva el municipio y los permisos originales aunque se intente modificarlos desde una petición manual. El ingreso agregado se calcula a partir de los integrantes actuales.

**Estilo de vida** ofrece a Jami contexto cualitativo sobre hábitos; **Metas prioritarias** indica qué temas priorizar. Ambas influyen en los consejos generativos cuando Gemini está configurado y autorizado. No modifican presupuestos ni crean metas con importe; estas se crean en Simulador.

## Jami

La burbuja aparece en todas las pantallas, incluidos registro y formularios. El chat se conserva solo en memoria de la sesión y se limpia al cambiar de cuenta. La consulta autenticada usa exclusivamente el hogar de la sesión.

Sin Gemini o sin permiso de IA, Jami ofrece una guía y respuestas basadas en reglas y cifras calculadas de la base; la interfaz lo identifica como **sin IA**. Con Gemini, el modelo añade orientación cualitativa a las cifras calculadas; no escribe movimientos ni ejecuta transferencias. El contexto usa ingreso agregado y datos mínimos, sin nombres de integrantes ni correos. Los estilos y prioridades se envían como datos, nunca como instrucciones.

Para activar generación se necesitan:

- Una clave válida de Gemini con acceso y cuota.
- El identificador exacto de un modelo habilitado para esa clave.
- Permiso de IA durante el registro del hogar.

El backend lee `geminiKey` y `geminiModel` del JSON `SUMMA_INTEGRATIONS`. En local, agrégalos al JSON existente en `backend/functions/.secret.local`, conservando las demás integraciones. No pegues claves en el chat, en variables `VITE_*` ni en archivos versionados. Reinicia el emulador de Functions tras cambiar el secreto.

En la nube se usa el secreto de Secret Manager del mismo nombre. Esta entrega **no despliega** Functions ni Hosting: publicar el chatbot en producción requiere una entrega posterior autorizada. Referencia del proveedor: [GenerateContent de Gemini](https://ai.google.dev/api/generate-content).

## Demo Hack

El resumen verificado está en [DEMO_HACK_RESUMEN.md](DEMO_HACK_RESUMEN.md). Las cuentas de ensayo usan los perfiles Rosy y Vane. Sus correos y contraseñas están en `backend/.demo-hack-access.local`, excluido de Git.

El dataset real está en Firebase `hackaher`, documento `hogares/demo-hack`. Se copió también a los emuladores `demo-summa` para ensayar en localhost sin desplegar. Las bases son independientes: modificar una no sincroniza la otra. Los emuladores sin exportación pierden los datos al detenerse; puedes restaurar solo esta demo, con los emuladores encendidos, ejecutando desde la raíz:

```sh
node backend/scripts/mirror-hack-demo.mjs
```

La copia lee únicamente documentos de la demo en la nube y escribe únicamente a los hosts locales de Auth y Firestore. Si la demo ya existe localmente, no la sobrescribe.

Para inspeccionar el plan de carga en la nube, `node backend/scripts/seed-hack-demo.mjs` no escribe. La opción `--apply --confirm-demo` realiza la carga exclusivamente en el hogar marcado de ensayo; si ya existe, no lo sobrescribe. No genera precios de supermercado ni evidencia bancaria ficticia presentada como real.
