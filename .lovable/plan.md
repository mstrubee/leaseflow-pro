# Descargar archivos de patentes en el ZIP

## Diagnóstico

Hoy el checkbox "Incluir archivos (ZIP)" sólo trae los archivos del repositorio común porque esos están en Supabase Storage (URLs públicas, `fetch()` directo funciona).

Los archivos de cada ítem del checklist se guardan en Google Drive: `patent_documents.document_url` contiene un `webViewLink` tipo `https://drive.google.com/file/d/{ID}/view`. `fetch()` sobre esa URL no devuelve el archivo (devuelve el visor HTML), por eso silenciosamente no entran al ZIP.

Adicionalmente, `patent_documents.drive_file_id` está en NULL para los 1850 registros existentes (el upload guarda la URL pero no persiste el `id` de Drive).

## Cambios propuestos

### 1. Edge function `google-drive`: nueva acción `downloadFile`
Recibe `{ driveFileId }`, descarga el archivo usando el OAuth token ya configurado (`files.get?alt=media`) y responde con `{ base64, mimeType, fileName }`. Sirve para cualquier archivo privado de Drive del workspace.

### 2. `src/components/patents/exportPatentsZip.ts`
- Soportar múltiples archivos por ítem (hoy `document_url` puede contener varias URLs separadas por `|||`, pero el código toma sólo el primer documento y un solo URL).
- Para cada URL:
  - Si es `storage://...` o URL pública de Supabase → flujo actual (`fetch` + `getSignedUrl`).
  - Si es URL de Drive → extraer el ID con regex `/\/file\/d\/([^/]+)/` (o usar `drive_file_id` si existe), invocar `google-drive` con `action: "downloadFile"`, decodificar base64 a Blob y agregarlo al ZIP.
- Conservar nombres de archivo originales desde `patent_documents.document_names` (mismo separador `|||`) cuando estén disponibles; si no, derivar del ítem + índice + extensión.
- Mantener el manejo de errores actual (saltar archivo que falla, continuar el resto) y los mensajes de progreso.

### 3. (Opcional, no crítico) `PatentDocumentUpload.tsx`
Guardar también `drive_file_id` en `patent_documents` al subir, separado por `|||` igual que las URLs, para no depender del parsing por regex en futuros uploads. No es estrictamente necesario para esta fix porque el regex sobre la URL ya resuelve los 1850 registros existentes.

## Resultado

Al marcar "Incluir archivos (ZIP)", el ZIP contendrá:
- Excel del checklist.
- Carpeta `Documentos/{Sección}/` con todos los archivos subidos al ítem (provenientes de Drive).
- Carpeta `Documentos/{Sección}_Repositorio_Comun/` con los archivos del repositorio compartido (sin cambios).
