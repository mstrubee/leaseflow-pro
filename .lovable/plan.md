
Objetivo
- Dejar estable la subida de archivos en Patentes para que siempre termine en Drive, sin spinner infinito/falla silenciosa, y con errores claros por archivo.

Diagnóstico (con evidencia ya revisada)
- El backend de Drive muestra errores intermitentes de `storageUrl contract mismatch` y `Failed to download temp storage file` en `uploadPatentFileFromStorage`.
- En `patent_documents.document_url` aún existen muchas rutas legacy `storage://repository-files/<contractId>/<itemId>/...` (sin prefijo `contracts/`), lo que mezcla formatos históricos.
- El flujo secundario de respaldo (`src/lib/patentBackup.ts`) usa conversión base64 con `String.fromCharCode(...Uint8Array)` (riesgo real de fallo con archivos medianos/grandes), pudiendo hacer que el upload principal “parezca fallar” aunque Drive haya respondido OK.

Plan de implementación (fix aplicado de punta a punta)
1) Endurecer `uploadPatentFileFromStorage` en `supabase/functions/google-drive/index.ts`
- Mantener validación de aislamiento por contrato, pero hacerla tolerante a formatos legacy:
  - aceptar y validar tanto `contracts/<contractId>/...` como `<contractId>/...`.
- Agregar fallback de descarga si el path exacto no aparece:
  - estrategia equivalente a `syncPendingFiles` (reintento por carpeta del contrato + nombre final).
- Mejorar errores retornados (400 validación / 500 fallo interno) con mensaje accionable.
- Registrar logs más útiles: `contractId`, `storagePath`, `resolvedStoragePath` (sin exponer secretos).

2) Corregir flujo frontend en `src/components/patents/PatentDocumentUpload.tsx`
- Mantener upload temporal a `repository-files` + llamada `uploadPatentFileFromStorage`.
- Mejorar manejo por archivo:
  - si falla uno, continuar con los demás, pero mostrar resumen exacto (subidos/fallidos).
  - propagar texto de error del backend al toast.
- No cerrar diálogo si todos fallan.
- Limpiar `input.value` y estado de carga siempre (ya existe, se mantiene).

3) Evitar que el backup rompa la subida principal
- En `src/lib/patentBackup.ts`, reemplazar conversión base64 riesgosa por helper robusto (`fileToBase64` con `FileReader`).
- Ejecutar backup como no bloqueante del upload principal:
  - si falla backup, mostrar warning, pero no marcar como “falló la subida a Drive” si el archivo principal ya quedó en Drive.

4) Reconciliación automática de pendientes legacy (post-fix)
- Tras upload exitoso en Patentes, disparar sincronización acotada para pendientes del mismo contrato usando acción existente `syncPendingFiles` (best-effort, sin bloquear UI).
- Objetivo: reducir casos “aparece en sistema pero no en Drive” para registros antiguos.

5) UX de verificación en lista flotante
- En `src/components/patents/PatentFileListPopover.tsx`:
  - mantener estado Drive (ok/missing/checking), pero hacer búsqueda más estricta por URL exacta + `drive_file_id`.
  - agregar acción “Reintentar subir a Drive” para archivos `missing` (usa backend, luego refresca estado).

Validación (obligatoria)
- Pruebas E2E en `/patents`:
  1. Subir 1 PDF pequeño.
  2. Subir lote mixto (2–5 archivos).
  3. Subir archivo grande (sin exceder límite).
  4. Confirmar apertura desde popover y estado Drive=OK.
  5. Confirmar eliminación con verificación.
- Verificar logs de función `google-drive` sin errores de mismatch/download en esos casos.
- Verificar en BD que `patent_documents.document_url` quede con URL de Drive para nuevos uploads y que `repository_files.drive_file_id` se complete.

Alcance de datos/seguridad
- No requiere migraciones de tablas.
- Se respetan políticas actuales y aislamiento por contrato en backend.
- No se relaja seguridad; solo se robustecen parseo/ruteo y manejo de errores.

Detalles técnicos
- Archivos a tocar:
  - `supabase/functions/google-drive/index.ts`
  - `src/components/patents/PatentDocumentUpload.tsx`
  - `src/lib/patentBackup.ts`
  - `src/components/patents/PatentFileListPopover.tsx`
- Sin cambios en `src/integrations/supabase/client.ts` ni `types.ts`.
