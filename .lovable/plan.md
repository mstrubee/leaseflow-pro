## Diagnóstico

Hoy el ZIP solo descarga lo que viene del repositorio común porque varios archivos del contrato fallan silenciosamente al descargarse y nadie se entera:

1. **URLs de Google Docs/Sheets/Slides no se reconocen.** El regex actual solo matchea `/file/d/...`. URLs como `https://docs.google.com/document/d/...` (hay 3 en BD) o `/spreadsheets/d/...`, `/presentation/d/...` se saltan.
2. **Archivos nativos de Google Workspace fallan en `alt=media`.** Para `application/vnd.google-apps.*`, Drive exige el endpoint `/export?mimeType=...`. Si el archivo se subió como Google Doc, el `downloadFile` actual revienta con 403.
3. **No hay feedback al usuario.** Si un archivo falla, el `catch` solo hace `console.error` y sigue. El usuario ve el ZIP sin esos archivos y cree que el botón no funciona.
4. **Posible URL obsoleta en `patent_documents`.** Si el `webViewLink` guardado quedó desactualizado (archivo movido/recreado), el ID extraído ya no existe en Drive. El `drive_file_id` real vive en `repository_files` y es la fuente de verdad.

## Cambios

### `src/components/patents/exportPatentsZip.ts`
- Extender `extractDriveFileId` para reconocer `/file/d/`, `/document/d/`, `/spreadsheets/d/`, `/presentation/d/` y `?id=`.
- Antes del loop de descarga, traer en un solo query todos los `repository_files` del contrato cuyo `name` coincida con cualquiera de los `document_names` de sus `patent_documents`. Construir un mapa `nombreArchivo → drive_file_id`.
- Para cada documento a descargar: si hay match por nombre en ese mapa, **usar ese `drive_file_id`** (más confiable que parsear la URL). Si no, caer al parseo de URL como hoy.
- Acumular contadores `descargados`/`omitidos` y al final mostrar un toast: `"X archivos descargados, Y omitidos. Ver consola."` con detalle por nombre en consola.
- Si la URL no es Drive ni Supabase Storage ni público (caso "other" — 2 filas), intentar `fetch` directo y registrar el fallo en el resumen si no funciona.

### `supabase/functions/google-drive/index.ts` — acción `downloadFile`
- Tras obtener metadata, si `mimeType` empieza con `application/vnd.google-apps.`, usar `/files/{id}/export?mimeType=...` con el mapeo:
  - `document` → `application/pdf`
  - `spreadsheet` → `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  - `presentation` → `application/vnd.openxmlformats-officedocument.presentationml.presentation`
  - `drawing` → `application/pdf`
  - Para cualquier otro tipo Google, fallback a PDF.
- Ajustar el `fileName` para incluir la extensión correcta cuando sea un export (Drive devuelve el nombre sin extensión para archivos nativos).
- Mantener el flujo actual de `alt=media` para archivos binarios.

## Pregunta para validar

Antes de implementar, necesito que confirmes **qué contrato** estás probando (nombre o ID). Los items que mencionas — *Recepción Final*, *Contrato Arriendo*, *Distribución de capital*, *Apertura de sucursal* — existen en BD para muchos contratos, y en la mayoría `document_url` está vacío (no se ha subido archivo aún). Si en el contrato que pruebas esos items aparecen con icono de archivo subido en la UI pero no llegan al ZIP, los 4 cambios de arriba lo resuelven. Si en cambio aparecen vacíos en la UI, no hay nada que descargar — el archivo nunca se asoció al item.