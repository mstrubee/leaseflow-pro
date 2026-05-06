# Problema

Al reintentar la sincronización a Google Drive desde el módulo de Patentes para archivos antiguos (que ya estaban subidos previamente), la edge function devuelve **500 — "File not found in temporary storage"**.

## Causa raíz

En `supabase/functions/google-drive/index.ts`, acción `uploadPatentFileFromStorage`:

1. Cuando una subida tiene éxito, la función **inserta una fila nueva** en `repository_files` (con `drive_file_id` y URL de Drive) y luego **borra el archivo del Storage**.
2. La fila original (la que apuntaba al `storage://...`) **queda intacta**, pero el archivo físico en Supabase Storage ya no existe.
3. En un re-intento posterior sobre esa fila huérfana, el `download(storagePath)` falla, el listado del directorio padre tampoco lo encuentra, y la función retorna 500.

Resultado visible: archivos que aparentemente "siguen en Supabase" pero al sincronizar dan error.

## Solución

Editar **`supabase/functions/google-drive/index.ts`** en el handler de `uploadPatentFileFromStorage` (~líneas 2042–2086):

1. **Evitar duplicados**: en vez de `insert` ciego, hacer primero `update` de la fila existente que tenga `url = storageUrl` (set `drive_file_id`, `url = driveUrl`, `file_type`, `folder_id`). Solo si no se actualizó ninguna fila, hacer `insert`.

2. **Manejar archivos ya sincronizados**: si la descarga falla y el listado tampoco encuentra el archivo, antes de retornar 500, buscar en `repository_files` una fila en la carpeta `patentFolder.id` con el mismo `name` y `drive_file_id IS NOT NULL`. Si existe:
   - Actualizar la fila huérfana (`url = storageUrl`) para apuntar a la URL de Drive existente y poblar su `drive_file_id`.
   - Devolver 200 con `alreadySynced: true` y la `driveUrl` reutilizada, así el frontend lo marca como OK.

3. Solo si tampoco existe copia en Drive ni archivo en Storage, mantener el 500 actual.

## Archivos modificados

- `supabase/functions/google-drive/index.ts` (un solo bloque, ~50 líneas alrededor del manejo de descarga/inserción en `uploadPatentFileFromStorage`).

Sin cambios en frontend, BD ni migraciones.
