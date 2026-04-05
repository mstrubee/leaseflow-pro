

## Plan: Corrección de 3 bugs críticos en sincronización Google Drive

### Resumen
Corregir tres bugs en `supabase/functions/google-drive/index.ts`: duplicados por condición de carrera, carpetas en ubicación incorrecta, y lentitud por procesamiento secuencial.

---

### Bug 1 — Duplicados por condición de carrera

**Migración de base de datos:**
- Agregar columnas `sync_status text` y `synced_at timestamptz` a `repository_files`.

**Cambios en `syncPendingFiles` (líneas ~2835-2997):**
- En el query inicial (línea 2835), agregar filtro `.is('sync_status', null)` para excluir archivos ya tomados.
- Antes de descargar cada archivo (línea 2866), hacer un `UPDATE` optimista:
  ```sql
  UPDATE repository_files SET sync_status = 'syncing', synced_at = now()
  WHERE id = file.id AND drive_file_id IS NULL AND sync_status IS NULL
  ```
  Si `count === 0`, saltar el archivo.
- En el `catch` (línea 2994), revertir `sync_status` a `null`.
- En el update exitoso (línea 2982), setear `sync_status = 'synced'`.

---

### Bug 2 — Carpetas en ubicación incorrecta

**Cambios en `pickUnclaimedDriveFolderByName` (líneas 906-929):**
- Después de encontrar un candidato no reclamado (línea 922), verificar que su padre en Drive coincide con `parentId`:
  - Hacer un `GET` a la API de Drive para obtener los `parents` del candidato.
  - Si `parents[0] !== parentId`, descartarlo y seguir con el siguiente candidato.
- Cambiar `candidates.find()` por un loop que itere sobre los candidatos, consultando parents solo para los no reclamados, y devolviendo el primero que pase ambas validaciones.

---

### Bug 3 — Procesamiento en lotes paralelos

**Cambios en `syncPendingFiles` (líneas 2866-2997):**
- Reemplazar el `for...of` secuencial por un sistema de lotes con `Promise.allSettled()`.
- Tamaño de lote configurable via `params.concurrency` (default 5).
- Extraer el cuerpo del loop actual a una función `async processSingleFile(file)`.
- Iterar en chunks de `concurrency` archivos, ejecutando cada chunk con `Promise.allSettled()`.
- Recolectar resultados de `fulfilled`/`rejected` para poblar `uploaded` y `syncErrors`.

---

### Archivos modificados
1. **Migración SQL** — agregar `sync_status` y `synced_at` a `repository_files`
2. **`supabase/functions/google-drive/index.ts`** — los tres cambios descritos

