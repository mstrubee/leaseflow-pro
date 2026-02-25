

## Plan: Reordenar Cards, Filtro de Sub-Estado y Area de Comentarios

### 1. Reordenar cards superiores

El orden actual es: Total FORMs - En Proceso - Solucionados - Fecha Especifica.
Se cambiara a: **Total FORMs - Solucionados - En Proceso - Forms fecha**.

Esto solo requiere intercambiar el orden de los cards en las lineas 480-526 de `MaintenanceModule.tsx`.

### 2. Agregar filtro de Sub-Estado

Se agregara un nuevo `Select` para filtrar por sub-estado, ubicado a la derecha del filtro de "Estado" (despues de linea 669). Las opciones seran las definidas en `SUB_STATUS_LABELS` mas la opcion "Todos".

Cambios necesarios:
- Agregar `subStatusFilter: string` a `FilterState` (default `"all"`)
- Agregar la validacion en el `useMemo` de `filtered`: si `subStatusFilter !== "all"`, filtrar por `f.sub_status === subStatusFilter`
- Agregar el componente `Select` en la seccion de filtros

### 3. Ampliar area clickeable de Comentarios

Actualmente el trigger del Popover de comentarios es un `<button>` con clase `truncate block max-w-32` que solo muestra el texto o "-". Se cambiara para que ocupe todo el ancho de la celda:
- Cambiar el `<button>` trigger para que tenga `w-full min-h-[28px]` en lugar de solo mostrar el contenido truncado
- Esto hace que toda la celda sea clickeable, no solo el texto "-"

### Detalle tecnico

**Archivo: `src/components/maintenance/MaintenanceModule.tsx`**

1. **Cards (lineas 472-527):** Intercambiar el card de "En Proceso" (lineas 480-486) con el de "Solucionados" (lineas 487-493), quedando: Total - Solucionados - En Proceso - Fecha.

2. **FilterState (lineas 34-44):** Agregar `subStatusFilter: string` al interface y al `DEFAULT_FILTERS`.

3. **Filtro useMemo (lineas 309-343):** Agregar condicion: `if (subStatusFilter !== "all" && f.sub_status !== subStatusFilter) return false;`

4. **Seccion de filtros (despues de linea 669):** Insertar un nuevo `Select` con label "Sub Estado":
   ```text
   <Select value={filters.subStatusFilter} onValueChange={v => updateFilter("subStatusFilter", v)}>
     <SelectItem value="all">Todos</SelectItem>
     {SUB_STATUS_ORDER.map(s => <SelectItem key={s} value={s}>{SUB_STATUS_LABELS[s]}</SelectItem>)}
   </Select>
   ```

5. **Comentarios (lineas 859-865):** Cambiar el boton trigger de `truncate block max-w-32` a `w-full min-h-[28px] text-left hover:text-primary transition-colors cursor-pointer truncate` para cubrir toda la celda.

