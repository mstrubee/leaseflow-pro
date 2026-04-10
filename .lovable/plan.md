

# Reparar URLs rotas en patent_documents

## Diagnóstico

Los 4 registros en `patent_documents` tienen `document_url` con prefijo `storage://...` (URLs temporales ya limpiadas). Sin embargo, **los archivos NO se perdieron**: todos existen en Google Drive a través de `repository_files`, con `drive_file_id` válido.

Lo que falta es actualizar los registros de patentes para que apunten a las URLs de Drive correctas.

## Plan de reparación

### 1. Migración SQL para corregir las 4 filas

Actualizar `document_url` en `patent_documents` reemplazando cada URL `storage://...` por la URL de Drive correspondiente encontrada en `repository_files`, usando coincidencia por nombre de archivo.

**Registros a reparar:**

| ID patent_document | Archivo(s) storage:// | URL Drive desde repository_files |
|---|---|---|
| `30987e96...` (Talca AG) | `...Certificado_de_uso_de_suelo_provisorio.pdf` | `https://drive.google.com/file/d/1v0XFUC.../view` |
| `e779b591...` (EGAKAT) | 3 archivos storage:// | 3 URLs Drive correspondientes |
| `8349652a...` (Parral) | 1 archivo storage:// + 11 URLs Drive OK | Reemplazar solo la 1 URL storage:// |
| `1bbc02e6...` (Parral) | 1 archivo storage:// + 1 URL Drive OK | Reemplazar solo la 1 URL storage:// |

### 2. Prevención futura

Modificar el flujo de subida de archivos de patentes para que **nunca guarde URLs `storage://`**. En su lugar, debe esperar la confirmación de subida a Drive y guardar directamente la URL de Drive. Si Drive falla, debe reintentar o notificar al usuario en vez de guardar una URL temporal.

**Archivos a modificar:**
- `src/components/patents/PatentDocumentUpload.tsx` — cambiar el flujo para esperar la URL de Drive antes de persistir en `patent_documents`
- Edge function `google-drive` (si aplica) — asegurar respuesta síncrona

## Archivos a modificar
- **Migración SQL** — actualizar las 4 filas con URLs correctas
- `src/components/patents/PatentDocumentUpload.tsx` — prevención futura

