
## Objetivo

Agregar un botón **"Sincronizar desde GeoLoc original"** dentro del módulo GeoLoc, visible solo para administradores, que dispare la re-sincronización de código desde el proyecto original.

---

## Realidad técnica importante

La re-sincronización de **código fuente** entre proyectos Lovable **no la puede ejecutar la app en runtime**: solo yo (el agente) puedo leer archivos de otro proyecto del workspace y escribirlos en este. Un botón en la UI **no puede modificar archivos `.tsx` del repositorio** por sí solo.

Por eso el botón funcionará así:

### Cómo funciona el botón

1. Aparece en la cabecera del módulo GeoLoc, solo para usuarios con rol `admin`.
2. Al hacer clic abre un diálogo con:
   - Última fecha de sincronización (guardada en tabla `geoloc_sync_log`).
   - Resumen de la última operación (archivos actualizados, conflictos).
   - Botón **"Solicitar sincronización"**.
3. Al confirmar:
   - Inserta un registro en `geoloc_sync_requests` con `status = 'pending'`, `requested_by`, `requested_at`.
   - Muestra un mensaje: *"Solicitud registrada. Pídele al asistente Lovable: 'ejecuta la sincronización de GeoLoc pendiente'. El agente leerá la solicitud, traerá los cambios del proyecto original y marcará la solicitud como completada."*
4. Yo, en el siguiente mensaje tuyo (ej. "ejecuta sync GeoLoc"), reviso solicitudes pendientes, hago el diff con el proyecto original, traigo los archivos respetando los marcados como "adaptados", y registro el resultado en `geoloc_sync_log` (archivos cambiados, conflictos).
5. La próxima vez que abras el diálogo, ves el resultado de esa corrida.

Esto da **trazabilidad y un punto de control en la UI**, aunque el trabajo real lo ejecuto yo.

---

## Cambios concretos

### Base de datos (migración)

```sql
create table public.geoloc_sync_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references auth.users(id),
  requested_at timestamptz not null default now(),
  status text not null default 'pending', -- pending | running | completed | failed
  notes text
);

create table public.geoloc_sync_log (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.geoloc_sync_requests(id),
  executed_at timestamptz not null default now(),
  files_updated int default 0,
  files_skipped_protected int default 0,
  conflicts jsonb default '[]'::jsonb,
  summary text
);
```

- RLS: solo admins (`has_role(auth.uid(), 'admin')`) pueden insertar/leer.

### Frontend

- **`src/geoloc/components/layout/Header.tsx`**: agregar botón `RefreshCw` "Sincronizar GeoLoc" visible solo si `has_role admin`.
- **Nuevo `src/geoloc/components/panels/GeoLocSyncDialog.tsx`**: muestra última sincronización y botón "Solicitar sincronización".
- **Nuevo hook `src/geoloc/hooks/useGeoLocSync.ts`**: lee `geoloc_sync_log` (último registro) y permite insertar en `geoloc_sync_requests`.

### Memoria

- Crear `mem://features/geoloc/sync-policy` con:
  - Nombre del proyecto upstream (te preguntaré cuál es al implementar).
  - Lista de archivos "adaptados" a no sobreescribir (vacía por ahora; se llenará cuando se hagan adaptaciones de Drive).
  - Procedimiento: revisar `geoloc_sync_requests` con `status='pending'`, ejecutar diff, escribir resultado en `geoloc_sync_log`, marcar request como `completed`.

---

## Flujo de uso para ti

1. Click en "Sincronizar GeoLoc" en el módulo → "Solicitar sincronización".
2. Me escribes: *"ejecuta la sincronización de GeoLoc pendiente"*.
3. Yo proceso la solicitud y te resumo qué cambió.
4. Vuelves a abrir el diálogo y ves el log.

## Lo que NO se hace en este plan

- No se adapta storage a Drive (eso sigue como plan separado).
- No se sincronizan POIs.
- No hay sincronización 100% automática sin intervención del agente (limitación de Lovable).

¿Apruebas?
