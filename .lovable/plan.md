

## Presencia en Tiempo Real con Actividad y Seccion

### Objetivo
Mejorar el sistema de presencia actual para mostrar en el Admin Panel no solo si un usuario esta conectado, sino tambien:
- Si esta **activo** (interactuando: mouse, teclado, scroll) o **inactivo** (pagina abierta pero sin interaccion)
- En que **seccion/pagina** se encuentra actualmente
- Todo actualizado en **tiempo real** usando el canal de Realtime de la base de datos

### Cambios

**1. Ampliar la tabla `profiles` con nuevos campos**

Agregar dos columnas a `profiles`:
- `activity_status` (text, default `'idle'`): valores `'active'` o `'idle'`
- `current_section` (text, nullable): la ruta/seccion donde se encuentra (ej. "Contratos", "Dashboard", "Admin")

Habilitar Realtime en la tabla `profiles` para que los cambios se reflejen instantaneamente en el Admin Panel.

**2. Mejorar el hook `usePresenceHeartbeat`**

Reescribir el hook para:
- Escuchar eventos `mousemove`, `keydown` y `scroll` en el documento
- Mantener un estado interno `active` vs `idle` con un timeout de 2 minutos de inactividad
- Enviar heartbeat cada 30 segundos (en lugar de 60) incluyendo: `last_seen_at`, `activity_status` y `current_section`
- Obtener `current_section` a partir de `window.location.pathname`, mapeado a nombres legibles (ej. `/contracts` -> "Contratos")

**3. Actualizar el indicador en AdminPanel**

Reemplazar el indicador actual de dos estados por tres estados:
- **Verde pulsante** + "Activo" -- usuario interactuando en los ultimos 2 minutos
- **Verde solido** + "Conectado" -- usuario con sesion abierta pero sin interaccion reciente
- **Gris** + "Desconectado" -- sin heartbeat en los ultimos 5 minutos

Ademas, mostrar la seccion actual debajo del estado (ej. "en Contratos").

**4. Suscripcion Realtime en AdminPanel**

Agregar una suscripcion al canal Realtime de `profiles` para que la tabla de usuarios se actualice automaticamente sin necesidad de recargar la pagina.

### Detalle tecnico

```text
Navegador del usuario                          Base de datos
+---------------------------+                  +--------------------+
| Detecta eventos:          |   cada 30s       | profiles           |
|  - mousemove              | ---------------> | .last_seen_at      |
|  - keydown                |   UPDATE          | .activity_status   |
|  - scroll                 |                   | .current_section   |
|                           |                  +--------------------+
| Si no hay evento en 2min  |                         |
|  -> status = 'idle'       |                   Realtime broadcast
| Si hay evento reciente    |                         |
|  -> status = 'active'     |                         v
+---------------------------+                  +--------------------+
                                               | AdminPanel         |
                                               | (suscripcion RT)   |
                                               |                    |
                                               | Verde pulsante:    |
                                               |   Activo en X      |
                                               | Verde solido:      |
                                               |   Conectado en X   |
                                               | Gris:              |
                                               |   Desconectado     |
                                               +--------------------+
```

### Mapa de secciones

| Ruta              | Nombre mostrado    |
|-------------------|--------------------|
| `/`               | Inicio             |
| `/contracts`      | Contratos          |
| `/contracts/:id`  | Detalle Contrato   |
| `/admin`          | Administracion     |
| `/alerts`         | Alertas            |
| `/purchase-orders`| Ordenes de Compra  |
| `/opex`           | OPEX               |
| `/capex`          | CAPEX              |
| `/reports`        | Reportes           |
| `/kpi`            | KPI                |
| `/suppliers`      | Proveedores        |
| `/maintenance`    | Mantenciones       |

### Archivos afectados
- **Nueva migracion SQL**: agregar columnas `activity_status` y `current_section` + habilitar Realtime en `profiles`
- **Modificado**: `src/hooks/usePresenceHeartbeat.ts` (deteccion de actividad, seccion actual, heartbeat mejorado)
- **Modificado**: `src/pages/AdminPanel.tsx` (tres estados visuales, seccion actual, suscripcion Realtime)

