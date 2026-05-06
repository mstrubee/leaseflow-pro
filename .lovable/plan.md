## Objetivo

Agregar un checkbox en la cabecera de la Gantt que convierta, con un solo clic, todos los plazos de la columna "días" a **días hábiles** (excluyendo fines de semana y feriados). El checkbox debe ser reversible: desmarcarlo vuelve todo a **días corridos**. El cambio recalcula automáticamente las fechas de término de cada tarea y propaga a sus dependencias.

## Cambios

### 1. `src/components/gantt/GanttChart.tsx`

- **Nuevo control en la cabecera "Cronograma"** (línea ~1260, junto a los botones "Contraer" / "Ocultar completadas" / "PDF"):
  - Un `Checkbox` (shadcn) etiquetado **"Días hábiles"** con tooltip:
    *"Convierte todos los plazos de la columna Días a días hábiles (excluye fines de semana y feriados). Desmarcar para volver a días corridos."*
  - Estado **derivado** de las tareas: `checked = tasks.length > 0 && tasks.every(t => t.duration_type === "business")`.
  - Estado intermedio "indeterminate" cuando hay mezcla (algunas en hábiles, otras en corridos).

- **Handler `handleToggleAllBusinessDays(checked: boolean)`**:
  1. Pide confirmación con `AlertDialog` ya existente:
     *"¿Convertir todos los plazos a días hábiles? Esto recalculará las fechas de término de todas las tareas."* (texto adaptado para el caso inverso).
  2. Para cada tarea con `start_date` y `duration_days > 0`:
     - Calcula nuevo `end_date` con `calculateEndDate(start, duration, newType, holidays)` desde `ganttDateUtils`.
     - Llama `onUpdateTask(task.id, { duration_type, end_date }, { skipPropagation: true })`.
  3. Tras procesar todas, dispara una recarga (`loadTimeline`) o re-propaga dependencias raíz para reajustar cadenas.
  4. Procesa en lotes (`Promise.all` por niveles) para no saturar Supabase y mostrar `toast` de progreso/éxito.

- **Importar** `Checkbox` de `@/components/ui/checkbox` y `holidays` ya disponible vía props (verificar — si no, propagarlo desde `GanttModule`).

### 2. `src/hooks/useGantt.ts` (opcional, si conviene centralizar)

Exportar un helper `bulkSetDurationType(type: "calendar" | "business")` que:
- Recorre `tasks`, recalcula `end_date` localmente y hace un solo `UPDATE` masivo (o por chunks) a `gantt_tasks`.
- Recarga el timeline una sola vez al final.
- Ventaja: una sola llamada, sin disparar la propagación tarea por tarea.

Se preferirá esta vía para rendimiento; el checkbox del chart llamará a este helper.

### 3. Persistencia / reversibilidad

- El estado se guarda en la propia columna `duration_type` de cada tarea en la BD, por lo que el toggle es persistente y reversible entre sesiones simplemente volviendo a marcar/desmarcar.
- No se requieren migraciones (la columna ya existe y soporta `"calendar" | "business"`).

## Notas técnicas

- Las tareas **padre** (con hijos) suelen derivar fechas de los hijos: para ellas no se recalcula `end_date` directamente, sólo se actualiza `duration_type` (la agregación sigue siendo correcta).
- Tras el bulk update, llamar `loadTimeline()` una vez asegura que se recalculen barras, dependencias y resúmenes.
- El indicador visual existente (`háb` vs `días` en línea 1845) reflejará el cambio automáticamente.
