## 1. Orden manual en "Estados Comité GP" (Admin → Visibilidad)

Replicar el patrón ya usado en `MaintenanceSubStatusManager` dentro de `src/components/admin/ComiteGPStatusManager.tsx`:

- Agregar columna **"Orden"** al inicio de la tabla con botones ↑ / ↓ (`ArrowUp` / `ArrowDown` de lucide).
- Función `moveOrder(s, "up"|"down")` que intercambia `display_order` con el vecino mediante dos `UPDATE` en paralelo sobre `comite_gp_statuses`.
- Recargar la lista (`loadStatuses()`) después del cambio.
- El orden definido aquí ya es respetado por el selector desplegable (lo carga ordenado por `display_order`), por lo que no se requieren cambios adicionales en consumidores.

## 2. Estados de avance de presupuesto visibles para usuarios con permiso de vista

Diagnóstico:
- RLS de `budget_line_progress_statuses` ya permite lectura a cualquier usuario autenticado.
- En `BudgetLineTree.tsx` el `ProgressStatusBadge` se renderiza para hojas en ambos modos, pero al revisar el flujo: el hook `useBudgetProgressStatuses` se invoca dentro del componente del badge y los usuarios sólo-vista sí deberían verlo. El problema reportado indica que en la práctica no lo están viendo.

Acción:
- Confirmar que `ProgressStatusBadge` se renderiza también cuando `effectiveReadOnly === true` (hoy ya lo hace, pero validaremos el path de `isParent` y de líneas autorizadas bloqueadas).
- Garantizar el render en read-only: cuando `readOnly` es true y no hay estado, seguir mostrando el badge (ya está). Si hay estado, mostrarlo con el color correspondiente sin Popover (ya está).
- Quitar cualquier gate de permisos que esté ocultando el badge para roles no-admin. Revisar si algún wrapper (`SelectableElement`, `canView`/`canEdit` sobre `budget_progress`) está escondiéndolo y dejarlo gobernado únicamente por el permiso de **vista** del recurso de presupuesto correspondiente, no por permiso de edición.

## Archivos a modificar

- `src/components/admin/ComiteGPStatusManager.tsx` — agregar columna y handler de orden.
- `src/components/budget/BudgetLineTree.tsx` — verificar y asegurar render del `ProgressStatusBadge` en modo solo-lectura para todos los usuarios con acceso de vista al presupuesto.

## Sin cambios de base de datos
Las tablas ya tienen `display_order` y las RLS permiten lectura pública autenticada.
