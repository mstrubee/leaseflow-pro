## Cambio

En el mini-Gantt de la sección de reportes, cuando el modo "OJO" (selección) está activo, las filas con la casilla desmarcada deben seguir mostrándose (atenuadas) para poder volver a activarlas. Solo cuando el modo OJO está desactivado se ocultan realmente.

## Implementación

Archivo: `src/components/gantt/GanttReportsSection.tsx`

1. En `MiniGantt`, modificar el `useMemo` de `visibleFlat`:
   - Si `selectionMode === true` → devolver `flat` completo (no filtrar nada).
   - Si `selectionMode === false` → mantener la lógica actual de podar sub-árboles cuyo root esté oculto.

2. En el render de cada fila, calcular `isHidden = hiddenIds?.has(task.id)` y aplicar atenuación visual cuando `selectionMode && isHidden`:
   - Añadir `opacity-40` a la fila completa.
   - La barra del Gantt se ve más tenue por la opacidad heredada.
   - La casilla en sí se mantiene a opacidad normal (envolver el `Checkbox` en un div sin opacidad reducida o aplicar `opacity` solo a las celdas posteriores). Solución simple: aplicar `opacity-40` solo al contenedor del nombre + fechas + barra, dejando la columna de checkbox intacta.

Resultado: al activar el ojo, todas las filas siguen visibles; las desmarcadas aparecen atenuadas y se pueden volver a marcar. Al desactivar el ojo, las filas desmarcadas desaparecen (incluyendo todo su sub-árbol si es un padre).
