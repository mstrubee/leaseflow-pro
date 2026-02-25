

## Plan: Sub-estados personalizables y cambio automatico de estado

### Parte 1: Cambio automatico de estado

Cuando el sub-estado de un form cambie de "Solicitado" a cualquier otro valor, el estado principal debe cambiar automaticamente a "En Proceso" (`proceso`). Esto se implementara en dos lugares:

**1a. Trigger de base de datos** (migracion SQL):
- Modificar el trigger existente `track_maintenance_status_change` para que, cuando `sub_status` cambie desde `solicitado` a otro valor, se actualice automaticamente `status = 'proceso'`.

**1b. Frontend - `MaintenanceEditDialog.tsx`**:
- En la funcion `doSave`, cuando el sub-estado ya no sea `solicitado`, forzar `status: "proceso"` en el update.
- Actualizar la UI para que el campo "Estado" sea de solo lectura (derivado del sub-estado), o al menos se ajuste automaticamente.

---

### Parte 2: Sub-estados personalizables (nueva tabla)

**2a. Migracion de base de datos** - Crear tabla `maintenance_sub_statuses`:

```text
maintenance_sub_statuses
  id          UUID (PK, default gen_random_uuid())
  name        TEXT NOT NULL (clave interna, ej: "solicitado")
  label       TEXT NOT NULL (nombre visible, ej: "Solicitado")
  description TEXT (descripcion del paso)
  responsible TEXT (responsable del paso)
  color       TEXT (color opcional)
  display_order INTEGER NOT NULL
  is_active   BOOLEAN DEFAULT true
  created_at  TIMESTAMPTZ DEFAULT now()
```

- Politicas RLS: lectura para todos los autenticados, escritura solo admins.
- Insertar los 7 sub-estados actuales como datos iniciales (solicitado, revisado, pre_aprobado, evaluado, cotizando, en_ejecucion, resuelto).

**2b. Nuevo componente admin: `MaintenanceSubStatusManager.tsx`**

Componente CRUD similar a `ComiteGPStatusManager`, con:
- Lista de sub-estados ordenados por `display_order`
- Boton para crear nuevo sub-estado (nombre, label, descripcion, responsable, color)
- Edicion inline de cada sub-estado
- Eliminacion (soft delete via `is_active = false`)
- Reordenamiento (flechas arriba/abajo)
- Campos: Label (nombre visible), Descripcion, Responsable, Color

**2c. Ubicacion en AdminPanel.tsx**

Insertar el nuevo `CollapsibleCard` entre "Estados Comite GP" (linea 929) y "Criticidad de Mantenciones" (linea 931):

```text
Estados Comite GP
Sub Estados de Mantenciones  <-- NUEVO
Criticidad de Mantenciones
```

---

### Parte 3: Refactorizar el frontend para usar sub-estados dinamicos

**3a. Nuevo hook: `useMaintenanceSubStatuses.ts`**

Hook que carga los sub-estados desde la tabla `maintenance_sub_statuses` (solo activos, ordenados por `display_order`). Expone:
- `subStatuses`: lista de sub-estados
- `getLabel(name)`: obtener label por nombre
- `getNextSubStatus(current)`: siguiente sub-estado en orden
- `loading`

**3b. Actualizar `MaintenanceModule.tsx`**:
- Usar el hook en lugar de las constantes hardcodeadas `SUB_STATUS_ORDER` y `SUB_STATUS_LABELS`
- El filtro de sub-estados se genera dinamicamente
- La tabla muestra labels dinamicos

**3c. Actualizar `MaintenanceEditDialog.tsx`**:
- Cargar sub-estados del hook
- El select de sub-estados es dinamico
- El panel informativo (Popover) muestra descripcion y responsable de la BD
- La funcion `getNextSubStatus` usa el orden dinamico
- Forzar `status = "proceso"` cuando sub-estado != primer sub-estado de la lista

**3d. Actualizar `maintenanceExport.ts`**:
- Recibir el mapa de sub-estados como parametro (similar a `criticalityMap`)
- Usar labels dinamicos en la exportacion PDF/Excel

**3e. Los tipos en `types.ts`**:
- Mantener `SubStatus` como tipo string (ya no union literal)
- Eliminar las constantes hardcodeadas `SUB_STATUS_ORDER`, `SUB_STATUS_LABELS`, `SUB_STATUS_INFO`
- Mantener la interfaz `MaintenanceForm` sin cambios

---

### Archivos a crear:
- `src/components/admin/MaintenanceSubStatusManager.tsx`
- `src/hooks/useMaintenanceSubStatuses.ts`

### Archivos a modificar:
- `src/pages/AdminPanel.tsx` (agregar CollapsibleCard)
- `src/components/maintenance/types.ts` (eliminar constantes hardcodeadas)
- `src/components/maintenance/MaintenanceModule.tsx` (usar hook dinamico)
- `src/components/maintenance/MaintenanceEditDialog.tsx` (usar hook + auto-status)
- `src/components/maintenance/maintenanceExport.ts` (labels dinamicos)
- `src/components/maintenance/MaintenanceReports.tsx` (labels dinamicos)
- `src/components/maintenance/MaintenanceExcelUpload.tsx` (si referencia constantes)

### Migracion SQL:
- Crear tabla `maintenance_sub_statuses` con RLS
- Insertar datos iniciales (7 sub-estados)
- Actualizar trigger `track_maintenance_status_change` para auto-cambiar estado
