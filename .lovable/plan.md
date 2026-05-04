## Diagnóstico

Tras la migración previa, las RLS de Gantt ya permiten lectura/escritura para usuarios con `contract_gantt:view|edit|all`. Sin embargo, en el frontend la edición sigue gateada por `isAdmin` en dos puntos:

- `GanttChart.tsx`: botones de añadir/editar tareas, drag para mover/resize, slider de % avance — todos condicionados por `isAdmin`.
- `GanttModule.tsx`: pasa `isAdmin={isAdmin}` al chart.
- `GanttTaskTree.tsx`: no tiene restricción (los usuarios con permiso ya pueden editar ahí, pero los botones se ven igual para todos).

Los usuarios no-admin con permiso `edit` ven la lista pero no pueden editar visualmente en el diagrama porque la UI los trata como solo-lectura.

## Cambios

1. **`GanttModule.tsx`**: derivar `canEdit = isAdmin || hasPermission("contract_gantt", "edit")` y reemplazar `isAdmin={isAdmin}` por `isAdmin={canEdit}` al pasar al `GanttChart`. (Mantener el bloque de gestión de plantillas y eliminar Gantt restringido a `isAdmin` real, ya que son acciones administrativas.)

2. Verificar que no haya otras puertas. La lista de tareas (`GanttTaskTree`) ya delega en las mutaciones del hook `useGantt`, que pasan por RLS — con el fix de RLS y la UI desbloqueada, los editores verán y modificarán todo correctamente.

3. No se necesita migración adicional; las RLS ya están correctas (verificado en BD).

## Resultado

- Cualquier usuario con `contract_gantt:view` ve diagrama y lista.
- Cualquier usuario con `contract_gantt:edit` puede mover tareas, ajustar fechas/plazos/% avance en el diagrama y editar en la lista.
- Solo admins ven los controles de plantilla y eliminación del cronograma.
