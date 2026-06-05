## Problema

En **Registro de Reuniones** (Atención Especial), al presionar el botón de eliminar (papelera) y luego confirmar o cancelar, la aplicación se "colapsa": el diálogo sigue viéndose pero **nada se puede clickear** en toda la página.

### Causa confirmada (reproducida en el preview)

El `AlertDialog` de confirmación de borrado está anidado **dentro** del `Dialog` principal del registro de reuniones (`src/components/special-attention/MeetingsRegistryDialog.tsx`). Cuando se cierra el `AlertDialog` interno, la librería de UI (Radix) deja por error el estilo `pointer-events: none` pegado en el `<body>`, lo que bloquea todos los clicks de la app. Es un bug conocido al anidar dos modales.

## Solución

Eliminar el congelamiento de forma robusta, sin cambiar el comportamiento ni el diseño:

1. **Limpiar el bloqueo de `pointer-events`** cuando se cierra la confirmación de borrado. Agregar un `useEffect` que, cuando `deleteId` vuelve a `null` (y al desmontar el componente), restablezca `document.body.style.pointerEvents` para que la página vuelva a ser clickeable.

2. **Sacar el `AlertDialog` del anidamiento.** Reestructurar el `return` para que el `AlertDialog` de confirmación se renderice como hermano del `Dialog` (dentro de un fragmento), no dentro de él. Esto evita el conflicto de focus/scroll-lock entre los dos modales y previene la causa raíz.

## Validación

- Reproducir en el preview: abrir Registro de Reuniones → eliminar una reunión → confirmar; y repetir → cancelar.
- Verificar que tras cerrar la confirmación la página/diálogo sigue siendo interactivo (botones "Expandir todo", "Registrar", cerrar X funcionan).
- Confirmar que el borrado sigue funcionando (la reunión desaparece del historial) y que no hay errores en consola.

## Archivos afectados

- `src/components/special-attention/MeetingsRegistryDialog.tsx`
