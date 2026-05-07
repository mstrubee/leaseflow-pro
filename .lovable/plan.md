
## Objetivo

En la fila **"Contrato arriendo"** del checklist de Patentes, mostrar siempre los documentos del contrato marcados como **"firmado"** (originales y renegociados) y guardarlos automáticamente en las carpetas configuradas para esa línea.

## Contexto encontrado

- `contract_documents` ya almacena los documentos del contrato con `document_type = 'firmado' | 'firmado_r'` (los que aparecen en el módulo Renta → Versiones marcados como "Original / R#1…").
- En `PatentChecklist.tsx` la columna "Archivo" se renderiza con `PatentFileListPopover`, alimentado por `document_url` / `document_names` del `patent_document` (separados por `|||`).
- Las carpetas destino por línea ya existen como `file_destination_settings` con clave `patent_item_<itemId>` (ya leídas en `itemFolders`). El helper `backupPatentFileToDestinations` (en `src/lib/patentBackup.ts`) sabe replicar un archivo a esas carpetas (repo del contrato y/o general_folders), pero hoy se usa solo para uploads desde el módulo Patentes.
- El item "Contrato arriendo" tiene id fijo `3ec81aa8-1213-41fc-a960-701c9408b242`, pero lo identificaremos por **nombre** (`name === 'Contrato arriendo'`, case-insensitive) para tolerar duplicados/espejos.

## Cambios

### 1. Cargar los documentos firmados del contrato

`src/hooks/usePatents.ts` (`loadData`):
- Agregar un fetch paralelo a `contract_documents` filtrado por `contract_id IN (...)` y `document_type IN ('firmado','firmado_r')`, ordenado por `uploaded_at`.
- Adjuntar el array resultante a cada contrato como `signed_documents: { id, url, uploaded_at }[]`.
- Extender el tipo `ContractWithPatent` en `src/components/patents/types.ts` con `signed_documents?`.

### 2. Mostrar siempre los firmados en la fila "Contrato arriendo"

`src/components/patents/PatentChecklist.tsx`:
- Crear un helper `getEffectiveFiles(item)` que:
  - Tome los `urls`/`names` actuales (los que ya parsea de `document_url`/`document_names`).
  - Si `item.name.toLowerCase() === 'contrato arriendo'`, **fusione** además todos los `signed_documents` del contrato (deduplicando por URL para no duplicar si ya están guardados).
  - Genere nombres legibles (último segmento del path, decodeURIComponent, sin prefijo `^\d{10,}_`) para los firmados.
- Reemplazar las dos lecturas inline (`urls`/`names` en el bloque `getDocValue(item.id, 'document_url')`) por este helper, y mostrar el `PatentFileListPopover` aun cuando `document_url` esté vacío pero existan firmados.
- En `onRemoveFile`: bloquear (toast) la eliminación si el archivo proviene de los firmados (esos solo se eliminan desde el módulo de contratos).

### 3. Respaldar los firmados en las carpetas configuradas para la línea

Sigue siendo independiente del bucket: solo se replica el **link** a las carpetas configuradas (no se re-sube el binario, porque los firmados ya viven en Drive vía DocumentVersions).

- En `PatentChecklist.tsx`, agregar un `useEffect` que se dispare cuando cambien `contract.signed_documents` o `itemFolders`:
  - Localizar el item "Contrato arriendo" (por nombre).
  - Leer destinos vía `getConfiguredDestinations('patent_folder')` **y** los específicos de la línea (`patent_item_<id>`) parseados con `parseDestinations`.
  - Para cada firmado no presente aún (chequeo en `repository_files`/`general_folder_files` por `url` o por `drive_file_id` extraído de URLs `drive.google.com/file/d/<id>`), insertar un registro apuntando al mismo `url`/`drive_file_id` en cada carpeta resuelta (misma lógica de `resolveFolder` usada en `patentBackup.ts`).
  - Hacer la operación idempotente y silenciosa (sin toasts en éxito), con `console.warn` ante errores.

> No se sube el archivo otra vez ni se usa `repository-files`; solo se inserta la fila en `repository_files` / `general_folder_files` con la URL de Drive existente, manteniendo el almacenamiento exclusivo en Google Drive.

### 4. Persistencia opcional

No se modifica `document_url` del `patent_document` para "Contrato arriendo" (los firmados son la fuente de verdad). Si en el futuro se requiere, se puede añadir un guardado one-shot, pero no es necesario para que la línea muestre los archivos.

## Archivos a modificar

- `src/components/patents/types.ts` — añadir `signed_documents` al tipo.
- `src/hooks/usePatents.ts` — cargar `contract_documents` firmados en paralelo.
- `src/components/patents/PatentChecklist.tsx` — render fusionado + efecto de respaldo a carpetas.
- (Reuso) `src/lib/patentBackup.ts` — extraer/exportar el helper `resolveFolder` para usarlo desde el efecto de respaldo (o duplicar la lógica mínima ahí).

## Validación esperada

- Al abrir un contrato firmado en Patentes, la fila "Contrato arriendo" muestra el/los documento(s) firmados aunque nunca se hayan subido archivos en Patentes.
- Los archivos aparecen automáticamente como entradas en las carpetas configuradas para la línea (visibles en el repositorio del contrato y/o carpetas generales correspondientes), sin duplicados al recargar.
- Subir manualmente un archivo adicional en la línea sigue funcionando y se suma a los firmados sin sobrescribirlos.
