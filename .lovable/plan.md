## Objetivo

Que al pulsar **"Solicitar sincronización"** en el diálogo de GeoLoc, el agente Lovable ejecute la sincronización de inmediato, sin que tengas que escribir manualmente el comando en el chat.

## Realidad sobre créditos

- La sincronización **siempre consume créditos** porque la ejecuta el agente Lovable (yo) leyendo el proyecto upstream con herramientas `cross_project` y reescribiendo archivos `.tsx` aquí.
- **No es posible hacerlo desde una Edge Function** leyendo GitHub: las edge functions no pueden modificar el código fuente del proyecto Lovable (solo tocan BD y Storage).
- Por lo tanto: cada click = 1 corrida del agente = créditos consumidos. Queda registrado para que sea consciente.

## Cambios

### 1. Disparo automático del chat al hacer click

En `GeoLocSyncDialog.tsx`, tras insertar la solicitud, emitir un `window.parent.postMessage` con el mensaje predefinido `"ejecuta la sincronización de GeoLoc pendiente"` para que el chat de Lovable lo reciba y lo procese automáticamente.

Esto funciona dentro del editor/preview de Lovable. En producción (app publicada) no hay agente, así que el botón degrada a la solicitud actual + toast informativo.

Detección: `window.parent !== window` y origen contiene `lovable.app` / `lovable.dev`.

### 2. UX del botón

- Texto cambia a: **"Sincronizar ahora (consume créditos)"**.
- Tooltip/nota debajo: *"Cada sincronización ejecuta al agente Lovable y consume créditos. Solo úsalo cuando haya cambios reales en el proyecto original."*
- Tras el click:
  - Inserta `geoloc_sync_requests` con `status='pending'`.
  - Hace `postMessage` al chat.
  - Cierra el diálogo.
  - Toast: *"Sincronización iniciada. Revisa el chat."*

### 3. Estado de la solicitud

Mantener el flujo actual de `geoloc_sync_log`. Cuando yo procese la solicitud, escribiré el resultado ahí y la próxima apertura del diálogo lo mostrará.

## Lo que NO se hace

- No se elimina el sistema de tabla `geoloc_sync_requests` (sigue siendo el registro de auditoría).
- No se intenta sync vía edge function + GitHub (técnicamente no permite escribir el código fuente del proyecto).
- No se cambia la lógica del agente al procesar la solicitud (sigue igual).

## Archivos tocados

- `src/geoloc/components/panels/GeoLocSyncDialog.tsx` — añadir `postMessage` y nuevo copy del botón.

¿Apruebas?
