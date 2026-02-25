

## Plan: Sub-estados personalizables, auto-revisado y mejoras de cache

### 1. Auto-cambio a "Revisado" al guardar comentarios

Actualmente, al guardar un comentario se muestra un dialogo preguntando si marcar como "Revisado". Se cambiara para que **siempre** se marque automaticamente como "Revisado" cuando se guardan comentarios (sin preguntar).

**Archivo: `MaintenanceModule.tsx`**
- Eliminar el estado `revisadoDialogOpen` y `pendingCommentSave`
- Eliminar el `AlertDialog` de confirmacion
- Modificar `handleCommentKeyDown` para que al presionar Ctrl+Enter, guarde directamente con `sub_status: 'revisado'`
- Simplificar `saveComment` para que siempre incluya `sub_status: 'revisado'` si el form esta en estado "solicitado"

---

### 2. Componente admin: `MaintenanceSubStatusManager.tsx`

Nuevo componente CRUD siguiendo el patron de `ComiteGPStatusManager`, conectado a la tabla `maintenance_sub_statuses` (ya existente en BD con RLS configurado).

Funcionalidades:
- Lista de sub-estados ordenados por `display_order`
- Crear nuevo sub-estado (label, descripcion, responsable, color)
- Editar sub-estado existente
- Eliminar (soft delete via `is_active = false`)
- Campos editables: Label, Descripcion, Responsable, Color

**Archivo: `src/components/admin/MaintenanceSubStatusManager.tsx`** (nuevo)

---

### 3. Integrar en AdminPanel

Insertar el nuevo componente entre "Estados Comite GP" y "Criticidad de Mantenciones".

**Archivo: `src/pages/AdminPanel.tsx`**
- Importar `MaintenanceSubStatusManager`
- Agregar `CollapsibleCard` con titulo "Sub Estados de Mantenciones" entre lineas 929 y 931

---

### 4. Hook dinamico: `useMaintenanceSubStatuses.ts`

Hook que carga sub-estados desde la tabla `maintenance_sub_statuses`.

Expone:
- `subStatuses`: lista de sub-estados activos ordenados
- `subStatusLabels`: mapa nombre -> label
- `subStatusInfo`: mapa nombre -> { description, responsible }
- `getNextSubStatus(current)`: siguiente en orden
- `loading`

**Archivo: `src/hooks/useMaintenanceSubStatuses.ts`** (nuevo)

---

### 5. Refactorizar frontend para sub-estados dinamicos

**`MaintenanceModule.tsx`:**
- Usar hook `useMaintenanceSubStatuses` en lugar de constantes hardcodeadas
- Filtro de sub-estados generado dinamicamente
- Labels en tabla dinamicos

**`MaintenanceEditDialog.tsx`:**
- Usar hook para select de sub-estados, popover informativo y timeline
- Forzar `status = "proceso"` cuando sub-estado != primer sub-estado

**`maintenanceExport.ts`:**
- Recibir mapa de sub-status labels como parametro
- Usar labels dinamicos en exportacion

**`MaintenanceReports.tsx`:**
- Usar labels dinamicos del hook

**`types.ts`:**
- Eliminar constantes hardcodeadas `SUB_STATUS_ORDER`, `SUB_STATUS_LABELS`, `SUB_STATUS_INFO`, `getNextSubStatus`
- Mantener `SubStatus` como `string`
- Mantener interfaz `MaintenanceForm`

---

### 6. Cache ya implementado

La carga de forms ya usa `sessionStorage` con TTL de 5 minutos. No se requieren cambios adicionales.

---

### Resumen de archivos

**Crear:**
- `src/components/admin/MaintenanceSubStatusManager.tsx`
- `src/hooks/useMaintenanceSubStatuses.ts`

**Modificar:**
- `src/components/maintenance/MaintenanceModule.tsx` (auto-revisado + sub-estados dinamicos)
- `src/components/maintenance/MaintenanceEditDialog.tsx` (sub-estados dinamicos + auto-status)
- `src/components/maintenance/maintenanceExport.ts` (labels como parametro)
- `src/components/maintenance/MaintenanceReports.tsx` (labels dinamicos)
- `src/components/maintenance/types.ts` (eliminar constantes)
- `src/pages/AdminPanel.tsx` (agregar CollapsibleCard)

**Sin migracion SQL necesaria** - la tabla y trigger ya existen.

