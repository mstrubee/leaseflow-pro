## Objetivo
Hacer que los documentos de patentes vuelvan a cargarse y abrirse correctamente, incluyendo los del repositorio común y los legacy que hoy quedaron con enlace temporal roto.

## Hallazgo
El backend está sano; el problema no es de disponibilidad.

El caso que falla (`2026_03.10 - egakatlogistica - Megacentro.pdf`) quedó guardado en `repository_files` con:
- URL `storage://repository-files/...`
- sin `drive_file_id`

Pero ese archivo ya no existe en el almacenamiento temporal, así que al reintentar subirlo el backend responde `File not found in temporary storage`.

Además, el popover hoy reintenta todos los casos usando el flujo `uploadPatentFileFromStorage`, que sirve para documentos de patente, pero no es suficiente para archivos legacy del repositorio común / `repository_files`.

## Plan
1. Corregir la detección de origen del archivo en `PatentFileListPopover`
- Resolver cada archivo por su fila real de `repository_files` cuando exista, no solo por coincidencia flexible de nombre.
- Distinguir entre:
  - documento de patente guardado en `patent_documents`
  - archivo del repositorio común guardado en `repository_files`
  - enlace externo/manual

2. Crear un flujo de reconciliación para archivos legacy de `repository_files`
- Agregar en la función `google-drive` una acción específica para:
  - tomar una fila de `repository_files`
  - si ya existe en Drive, actualizar `url` y `drive_file_id`
  - si aún existe en storage, subirla a Drive y actualizar la fila
  - si no existe ni en Drive ni en storage, devolver un error claro de archivo irrecuperable
- No reutilizar el flujo de `uploadPatentFileFromStorage` para estos casos.

3. Conectar el botón de reintento al flujo correcto
- Si el archivo pertenece a `repository_files`, usar la nueva reconciliación.
- Si pertenece a `patent_documents` y realmente es un storage URL de patente, mantener el flujo actual.

4. Mejorar la carga visual del popover
- Marcar como disponible cuando ya tenga `drive_file_id` o URL final válida.
- Evitar falsos “faltantes” por búsquedas ambiguas solo por nombre.
- Mostrar mensaje útil cuando el archivo ya no es recuperable y requiera re-subida.

5. Validación
- Probar el caso que hoy falla (`Megacentro.pdf`).
- Verificar apertura/estado en:
  - repositorio común
  - documentos de patente propios
  - archivos Google Drive nativos y binarios

## Detalles técnicos
- Archivos a tocar:
  - `src/components/patents/PatentFileListPopover.tsx`
  - `supabase/functions/google-drive/index.ts`
- No debería requerir migración de base de datos; el cambio es de reconciliación y lectura.
- Si encuentro más filas legacy con `storage://` en `repository_files`, dejaré el flujo preparado para recuperarlas también.