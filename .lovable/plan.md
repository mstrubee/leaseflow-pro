

## Optimizacion de rendimiento en plantillas de presupuesto

### Problema

Cada operacion (editar, duplicar, eliminar) en `BudgetTemplateManager` dispara una recarga completa desde la base de datos:
- `handleUpdateLine` -> `loadLines()` (re-fetch completo)
- `handleDeleteLine` -> `loadLines()` (re-fetch completo)
- `handleAddLine` -> `loadLines()` (re-fetch completo)
- `handleDeleteTemplate` -> `loadTemplates()` (re-fetch completo)
- `handleDuplicateTemplate` -> `loadTemplates()` (re-fetch completo)
- `handleUpdateTemplate` -> `loadTemplates()` (re-fetch completo)

Esto genera latencia visible en cada accion porque cada cambio implica un round-trip completo al servidor.

### Solucion: Actualizaciones optimistas

Reemplazar las recargas completas con actualizaciones locales del estado. La base de datos se actualiza en segundo plano, y solo si falla se revierte el estado.

---

### Cambios en `BudgetTemplateManager.tsx`

**1. Operaciones sobre plantillas (crear, editar, eliminar, duplicar)**

- `handleCreateTemplate`: Insertar la plantilla devuelta por `.select().single()` directamente en el array `templates` sin llamar a `loadTemplates()`.
- `handleUpdateTemplate`: Actualizar el objeto en `templates` localmente con `setTemplates(prev => prev.map(...))`.
- `handleDeleteTemplate`: Remover del array local con `setTemplates(prev => prev.filter(...))`.
- `handleDuplicateTemplate`: Insertar la nueva plantilla devuelta por el insert en el array local.

**2. Operaciones sobre lineas (agregar, editar, eliminar, reparent)**

- `handleAddLine`: Despues del insert exitoso, hacer un `.select().single()` para obtener la linea creada y agregarla al arbol local reconstruyendolo con `buildTree`.
- `handleUpdateLine`: Actualizar la linea en el arbol local sin re-fetch. Reconstruir el arbol desde un flat array actualizado.
- `handleDeleteLine`: Remover la linea del flat array local y reconstruir el arbol.
- `handleReparent`: Cambiar `parent_id` en el flat array local y reconstruir.

**3. Mantener flat array como fuente de verdad**

Agregar un estado `flatLines` ademas de `lines` (arbol). Las mutaciones operan sobre `flatLines` y luego se deriva el arbol con `buildTree`. Esto simplifica todas las operaciones de actualizacion local.

### Detalle tecnico

| Funcion | Antes | Despues |
|---------|-------|---------|
| `handleCreateTemplate` | `loadTemplates()` | `setTemplates(prev => [data, ...prev])` |
| `handleUpdateTemplate` | `loadTemplates()` | `setTemplates(prev => prev.map(...))` |
| `handleDeleteTemplate` | `loadTemplates()` | `setTemplates(prev => prev.filter(...))` |
| `handleDuplicateTemplate` | `loadTemplates()` | `setTemplates(prev => [newTemplate, ...prev])` |
| `handleAddLine` | `loadLines(id)` | Agregar al flat array, rebuild tree |
| `handleUpdateLine` | `loadLines(id)` | Actualizar en flat array, rebuild tree |
| `handleDeleteLine` | `loadLines(id)` | Filtrar del flat array, rebuild tree |
| `handleReparent` | `loadLines(id)` | Cambiar parent_id en flat array, rebuild tree |

### Archivo afectado

`src/components/budget/BudgetTemplateManager.tsx` -- unico archivo a modificar.

