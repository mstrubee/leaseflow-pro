

## Plan: Corregir colapso de comentarios y dropdown de sub-estados

### Problema 1: Colapso al escribir comentarios

**Causa raiz:** El Popover de comentarios (linea 868) usa un estado controlado (`open={commentViewFormId === f.id || commentEditFormId === f.id}`) dentro de un `filtered.map(...)` que renderiza toda la tabla. Cada cambio de caracter en el textarea (`setCommentEditText`) re-renderiza toda la tabla, causando inestabilidad.

**Solucion:** Extraer el Popover de comentarios en un componente separado (`CommentCell`) que encapsule su propio estado local. Esto aisla los re-renders de la edicion de comentarios al componente individual, sin afectar toda la tabla.

```text
CommentCell (nuevo componente inline)
  - Props: form, onSave (callback)
  - Estado local: viewMode, editMode, editText
  - Maneja el Popover, Textarea y guardado internamente
  - Solo notifica al padre cuando se guarda exitosamente
```

**Archivo: `src/components/maintenance/MaintenanceModule.tsx`**
- Crear componente `CommentCell` antes del componente principal
- Mover toda la logica de comentarios (handleCommentClick, startCommentEdit, handleCommentKeyDown, saveComment) dentro de `CommentCell`
- Eliminar los estados `commentEditFormId`, `commentEditText`, `commentViewFormId` del componente principal
- Reemplazar el bloque de la celda de comentarios (lineas 867-909) por `<CommentCell form={f} onSave={...} />`

---

### Problema 2: Dropdown seleccionable de sub-estados con descripcion

**Estado actual:** El sub-estado se muestra como un Badge estatico (lineas 780-783).

**Solucion:** Convertir el Badge en un Popover clickeable con lista de sub-estados. Al pasar el mouse sobre cada opcion, mostrar la descripcion del sub-estado usando Tooltip.

```text
Celda Sub Estado (reemplazar Badge estatico)
  - Popover con trigger en el Badge actual
  - Lista de sub-estados del hook useMaintenanceSubStatuses
  - Cada item: nombre + Tooltip con descripcion y responsable
  - Al seleccionar: actualizar sub_status en BD
  - Si nuevo sub_status != primer sub-estado: auto-set status = "proceso"
```

**Archivo: `src/components/maintenance/MaintenanceModule.tsx`**
- Reemplazar lineas 780-784 con un Popover similar al de criticidad (lineas 785-831)
- Agregar funcion `handleSubStatusChange(formId, newSubStatus)` que actualice en BD y en estado local
- Cada opcion del dropdown tendra un Tooltip con la descripcion del sub-estado

---

### Resumen de cambios

**Archivo unico: `src/components/maintenance/MaintenanceModule.tsx`**

1. Crear componente `CommentCell` (antes de `MaintenanceModule`) con estado local aislado
2. Eliminar estados de comentarios del componente principal
3. Reemplazar celda de comentarios por `<CommentCell>`
4. Agregar funcion `handleSubStatusChange` para cambio directo de sub-estado
5. Reemplazar Badge estatico de sub-estado por Popover con lista seleccionable y tooltips con descripcion
