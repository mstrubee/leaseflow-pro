
## Problema

En el árbol/diálogo de tareas y en el editor de plantillas ya se puede elegir si la dependencia se ancla al **inicio** o al **término** de la tarea predecesora, y aplicar un **desfase en días** (positivo o negativo). Pero el popover de dependencias dentro del **diagrama Gantt** (icono de cadena junto al nombre de cada tarea, en `GanttChart.tsx`) sólo permite elegir la tarea predecesora — no expone esos dos campos. La lógica de recálculo y propagación en `useGantt.ts` ya soporta ambos valores.

## Cambios

### 1. `src/components/gantt/GanttChart.tsx`

- Ampliar la prop `onAddDependency` para aceptar el tercer parámetro de opciones, igual que en `GanttTaskTree`:
  ```ts
  onAddDependency: (
    taskId: string,
    dependsOnTaskId: string,
    options?: { dep_type?: "start" | "end"; lag_days?: number; lag_type?: "calendar" | "business" }
  ) => Promise<void>;
  ```
- Agregar nueva prop opcional `onUpdateDependency` con la misma firma que en `useGantt`/`GanttTaskTree`.

- En el popover de dependencias (líneas ~1544-1611):
  - Para cada dependencia existente, además del `SearchableSelect` de la tarea, añadir:
    - `Select` con opciones "al término" / "al inicio" enlazado a `dep.dep_type` que llama `onUpdateDependency(dep.id, { dep_type })`.
    - `Input number` enlazado a `dep.lag_days` (defaultValue + onBlur) que llama `onUpdateDependency(dep.id, { lag_days })`. Aceptar negativos.
  - Para el bloque "Agregar dependencia", reemplazar el `SearchableSelect` directo por un mini-formulario local con estado (tarea seleccionada, dep_type y lag_days) y un botón Agregar, que invoque `onAddDependency(task.id, parentId, { dep_type, lag_days })`. Estilo compacto coherente con el popover (controles `h-7 text-xs`).
  - Reutilizar el patrón visual ya existente en `GanttTaskTree.AddDependencyForm` para mantener consistencia.

- Para el reemplazo de tarea predecesora en una dep existente (cuando se cambia el `SearchableSelect`): preservar `dep_type` y `lag_days` actuales al recrearla (`onRemoveDependency` + `onAddDependency(..., { dep_type: dep.dep_type, lag_days: dep.lag_days })`).

### 2. `src/components/gantt/GanttModule.tsx`

- Pasar `onUpdateDependency={updateDependency}` también al `<GanttChart>` (línea ~402), igual que ya se pasa al `GanttTaskTree`.

## Notas técnicas

- No se requieren cambios en BD ni en `useGantt.ts`: `addDependency`, `updateDependency` y `propagateDateChanges` ya manejan `dep_type` y `lag_days` y aplican el recálculo a las dependientes.
- `lag_type` se mantiene en su valor por defecto (`calendar`) salvo que se quiera exponer también; no es parte de este pedido.
- Los datos mostrados (`dep.dep_type`, `dep.lag_days`) ya vienen cargados por `fetchTimelines` (líneas 322-325 de `useGantt.ts`).
