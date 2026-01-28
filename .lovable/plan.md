

## Plan: Subida de Archivo OC en Creación/Edición de Órdenes de Compra

### Resumen

Permitir subir un archivo PDF de OC (Orden de Compra) al crear o editar una orden, almacenándolo en la carpeta "OC" del repositorio del contrato en Google Drive.

### Componentes a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/components/budget/PurchaseOrdersModule.tsx` | Agregar campo de upload en diálogos de nueva OC y edición OC |
| `src/pages/PurchaseOrdersDashboard.tsx` | Agregar campo de upload en diálogo de edición centralizada |
| `src/lib/repositoryBackup.ts` | Ya tiene `backupOCFileToRepository`, se usará directamente |

### Cambios Técnicos

#### 1. PurchaseOrdersModule.tsx - Diálogo Nueva OC

**Agregar estado para manejo de archivo:**
```typescript
const [ocFile, setOcFile] = useState<File | null>(null);
const [uploadingFile, setUploadingFile] = useState(false);
const ocFileInputRef = useRef<HTMLInputElement>(null);
```

**Agregar UI de upload en el diálogo (después del selector de proveedor):**
- Input file oculto con ref
- Área de drop/click que muestra:
  - Si no hay archivo: icono + texto "Click para subir archivo OC (PDF)"
  - Si hay archivo: nombre del archivo + botón para eliminar
- Acepta solo PDF

**Modificar handleCreateOrder:**
1. Después de crear la OC en BD, si hay archivo seleccionado:
2. Llamar `backupOCFileToRepository(contractId, ocFile, orderNumber)`
3. Obtener la URL de Drive devuelta
4. Actualizar el campo `attachment_url` de la OC con esa URL

#### 2. PurchaseOrdersModule.tsx - Diálogo Editar OC

**Similar al anterior:**
- Estado para archivo nuevo
- Mostrar archivo existente si `attachment_url` está presente
- Permitir reemplazar o mantener archivo existente

**Modificar handleUpdateOrder:**
- Si hay archivo nuevo, subirlo y actualizar `attachment_url`

#### 3. PurchaseOrdersDashboard.tsx - Diálogo Editar OC Centralizado

**Agregar en el estado editingOCData:**
```typescript
attachment_url: string;
```

**Agregar UI de upload en el diálogo:**
- Mostrar archivo existente con link
- Permitir subir nuevo archivo
- Al guardar, subir a Drive y actualizar todos los POs del grupo

**Modificar handleUpdateOC:**
- Si hay archivo nuevo, subirlo a la carpeta OC del primer contrato
- Actualizar `attachment_url` en todos los POs con el mismo `order_number`

### Flujo de Upload

```text
┌─────────────────────┐
│ Usuario selecciona  │
│ archivo PDF         │
└─────────┬───────────┘
          │
          v
┌─────────────────────┐
│ Crear/Actualizar OC │
│ en BD (sin archivo) │
└─────────┬───────────┘
          │
          v
┌─────────────────────┐
│ backupOCFileToRepository() │
│ - Obtiene/crea carpeta OC  │
│ - Sube a Google Drive      │
│ - Crea registro en BD      │
└─────────┬───────────┘
          │
          v
┌─────────────────────┐
│ Actualizar OC con   │
│ attachment_url      │
└─────────────────────┘
```

### UI del Campo de Upload

```text
┌─────────────────────────────────────────┐
│ Archivo OC (PDF)                        │
├─────────────────────────────────────────┤
│  ┌───────────────────────────────────┐  │
│  │  📄 OC_12345_documento.pdf       X│  │ <- Si hay archivo
│  │     125.3 KB                      │  │
│  └───────────────────────────────────┘  │
│                                         │
│  -- O bien --                           │
│                                         │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐  │
│  │  ⬆️ Click para subir archivo OC  │  │ <- Si no hay archivo
│  │     (PDF)                         │  │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘  │
└─────────────────────────────────────────┘
```

### Validaciones

1. **Tipo de archivo**: Solo PDF (validar MIME type y extensión)
2. **Tamaño**: Máximo 20MB
3. **Drive requerido**: Si el contrato no tiene Drive vinculado, mostrar advertencia pero permitir crear OC sin archivo

### Manejo de Errores

- Si falla el upload a Drive:
  - La OC ya está creada en BD
  - Mostrar toast de advertencia: "OC creada, pero el archivo no pudo subirse. Puede adjuntarlo después."
  - No bloquear la operación principal

### Imports Necesarios

```typescript
import { backupOCFileToRepository } from "@/lib/repositoryBackup";
import { validateFile } from "@/lib/fileValidation";
```

