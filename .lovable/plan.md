# Plan: Espejo del módulo GEOLOC + Storage en Drive

## Contexto

El proyecto **GEOLOC original** ([GeoLoc](/projects/539697f7-2650-4d5a-a297-18f86170697b)) almacena POIs en su propia base de datos Supabase (`tcmyidycqdrrtwuaovbk`), con RLS por `user_id` (auth de ese proyecto). Este proyecto (gPlanet) es un **Supabase distinto** y no puede leer directamente esa base con la sesión local.

**Restricción clave:** Los `auth.users.id` del proyecto original ≠ los de gPlanet. No se puede simplemente "compartir tabla". Hay que **importar** los POIs y mantenerlos sincronizados como espejo.

## Objetivos

1. **Carga inicial**: Importar todos los POIs (y carpetas) existentes en GEOLOC original a este módulo.
2. **Espejo automático**: Cuando cambien los POIs en el original, este módulo se actualiza solo (one-way: original → gPlanet).
3. **Diferencia única**: Aquí los archivos asociados se sincronizan adicionalmente a **Google Drive** (no en el original).

---

## Arquitectura

```text
[GEOLOC original DB]  ──(Edge Function pull)──►  [gPlanet DB: pois espejo]
   tcmyidycqdrrtwuaovbk                              tgxiqvfpirwvhktgqqfa
                                                          │
                                                          └──► Google Drive
                                                               (capa de storage extra)
```

- **Pull periódico** (cron) desde el original usando su **service_role key** (guardada como secret en gPlanet).
- **Mapeo de usuarios** vía email (auth.users de ambos proyectos) en una tabla `geoloc_user_map`.
- **Espejo idempotente**: usar `id` original como `source_id`; UPSERT por `(source_project, source_id)`.

---

## Pasos

### 1. Schema (migración)

Ajustar tablas locales `pois` y `poi_folders` (ya creadas en pasos previos):
- Agregar columnas: `source_project TEXT`, `source_id UUID`, `source_user_id UUID`, `synced_at TIMESTAMPTZ`, `is_mirror BOOLEAN DEFAULT false`.
- Índice único `(source_project, source_id)` para upsert.
- Tabla nueva `geoloc_user_map (gplanet_user_id UUID, source_user_id UUID, email TEXT, PRIMARY KEY(gplanet_user_id, source_user_id))`.
- Tabla `geoloc_sync_state (last_run_at, last_cursor_updated_at, status, error)` para sync incremental.

### 2. Secret

Solicitar al usuario el **Supabase Service Role Key** del proyecto GeoLoc original (`tcmyidycqdrrtwuaovbk`) y guardarlo como secret `GEOLOC_SOURCE_SERVICE_KEY`. También `GEOLOC_SOURCE_URL` (publishable, hardcoded).

### 3. Edge Function `geoloc-mirror-pull`

- Lee `last_cursor_updated_at` de `geoloc_sync_state`.
- Llama al Supabase original: `SELECT * FROM pois WHERE updated_at > cursor` y mismo para `poi_folders`.
- Resuelve `source_user_id → gplanet_user_id` vía `geoloc_user_map` (auto-crea entrada al primer match por email — query a `auth.users` de ambos lados).
- UPSERT por `(source_project='geoloc', source_id)`.
- Procesa `deleted_at` para reflejar eliminaciones (soft delete).
- Actualiza cursor.

### 4. Cron pg_cron

Schedule cada 5 minutos: invocar la edge function vía `net.http_post`.

### 5. Capa Drive (diferenciador)

Conectar **Google Drive connector** (si no existe) y crear edge function `geoloc-drive-sync`:
- Por cada POI con archivos adjuntos en `properties.attachments`, asegurar carpeta en Drive: `gPlanet/GEOLOC/{user_email}/POIs/{poi_name}/`.
- Subir archivos faltantes; guardar `drive_file_id` en `properties.drive`.
- Una sola dirección: gPlanet → Drive (el original no toca Drive).

### 6. Frontend (`src/geoloc/`)

- Hooks `useSavedPois` / `usePoiFolders`: ya leen de gPlanet `pois` — no requieren cambios funcionales (el espejo escribe ahí).
- Marcar visualmente POIs `is_mirror=true` como solo-lectura (badge "Espejo · GEOLOC").
- Botón **"Sincronizar ahora"** en `PoiManagerDialog` que invoca `geoloc-mirror-pull` manualmente.
- Sección **"Almacenamiento Drive"** en panel: estado de subida por POI.

### 7. Carga inicial

Tras desplegar, ejecutar la edge function una vez sin cursor para hacer **backfill completo** de todos los POIs/carpetas del original.

---

## Detalles técnicos

- **Mapeo de usuarios**: el primer pull intenta hacer match por email (`auth.admin.listUsers()` en ambos proyectos). Si no hay match, el POI queda en `geoloc_user_map_pending` y no se inserta hasta que el usuario exista en gPlanet.
- **RLS local**: las políticas existentes (`auth.uid() = user_id`) siguen aplicando; la edge function usa `service_role` así que las salta para el upsert.
- **Conflictos**: si el usuario edita un POI espejo localmente, el siguiente pull lo sobrescribe (espejo puro). Se mostrará un warning UI antes de editar.
- **Drive sync**: corre como segundo job (cada 10 min) leyendo POIs con `properties.drive IS NULL` y attachments pendientes.

## Archivos a crear / modificar

- `supabase/migrations/<new>.sql` — columnas espejo + tablas de mapeo/estado.
- `supabase/functions/geoloc-mirror-pull/index.ts` — pull desde original.
- `supabase/functions/geoloc-drive-sync/index.ts` — push a Drive.
- `src/geoloc/components/panels/PoiManagerDialog.tsx` — botón sync + badge espejo.
- `src/geoloc/hooks/useSavedPois.ts` — exponer flag `isMirror`.
- Secret: `GEOLOC_SOURCE_SERVICE_KEY`.
- Conector: `google_drive`.

## Lo que NO se cambia

- UI/UX del módulo idéntica al original.
- Lógica de mapas, capas, isócronas, GSE/INE/manzanas — sin tocar.
- Auth de gPlanet — los usuarios siguen siendo los de este proyecto.
