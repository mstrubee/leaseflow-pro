

## Indicador de Estado Conectado/Desconectado de Usuarios

### Objetivo
Agregar un indicador visual en la tabla de usuarios del Panel de Administracion que muestre si cada usuario esta conectado (online) o desconectado (offline).

### Enfoque
Se utilizara un campo `last_seen_at` en la tabla `profiles` que se actualiza periodicamente mientras el usuario tiene la aplicacion abierta. Si la ultima actividad fue hace menos de 5 minutos, se considera "conectado".

### Cambios

**1. Base de datos -- agregar campo `last_seen_at`**
- Agregar columna `last_seen_at` (timestamp with time zone, nullable) a la tabla `profiles`.
- Crear politica RLS para que cada usuario pueda actualizar su propio `last_seen_at`.

**2. Hook de presencia -- `usePresenceHeartbeat`**
- Crear un nuevo hook `src/hooks/usePresenceHeartbeat.ts`.
- Cada 60 segundos, actualiza `profiles.last_seen_at = now()` para el usuario autenticado.
- Se ejecuta al montar y luego en intervalo.

**3. Integrar el heartbeat en la app**
- Llamar `usePresenceHeartbeat()` desde `MainLayout` (o `App.tsx`) para que funcione en todas las paginas mientras el usuario esta logueado.

**4. Mostrar indicador en la tabla de usuarios (AdminPanel)**
- Agregar una nueva columna "Estado" en la tabla de usuarios.
- Mostrar un punto verde con texto "Conectado" si `last_seen_at` fue hace menos de 5 minutos.
- Mostrar un punto gris con texto "Desconectado" en caso contrario o si es null.
- Incluir el campo `last_seen_at` en la interfaz `Profile` y en la consulta existente.

### Detalle tecnico

```text
+------------------+       cada 60s        +-------------------+
|  usePresence     | --------------------> | profiles          |
|  Heartbeat       |  UPDATE last_seen_at  | .last_seen_at     |
+------------------+                       +-------------------+
                                                   |
                                           leido por AdminPanel
                                                   |
                                           +-------------------+
                                           | Indicador visual  |
                                           | verde/gris        |
                                           +-------------------+
```

### Archivos afectados
- **Nueva migracion SQL**: agregar columna `last_seen_at` + politica RLS
- **Nuevo**: `src/hooks/usePresenceHeartbeat.ts`
- **Modificado**: `src/components/layout/MainLayout.tsx` (agregar hook)
- **Modificado**: `src/pages/AdminPanel.tsx` (interfaz Profile, columna en tabla, indicador visual)
