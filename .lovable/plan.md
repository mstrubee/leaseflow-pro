

## Optimizacion de Rendimiento del Modulo de Mantenciones

### Diagnostico

El modulo renderiza **todos** los formularios filtrados (potencialmente 2,500+) en el DOM simultaneamente. Cada fila contiene multiples componentes interactivos (Popovers, Tooltips, Badges). Esto causa:

1. **Busqueda lenta**: cada cambio en el filtro recalcula `filtered` y React re-renderiza miles de filas.
2. **Borrar busqueda lento**: al limpiar el texto, se pasa de N resultados a 2,500+ filas de golpe.
3. **Criticidad/Sub-estado lentos**: los callbacks `handleCriticalityChange` y `handleSubStatusChange` dependen de `forms` en su closure, forzando re-creacion y propagacion a todas las celdas memo.
4. **Limpiar filtros lento**: resetear todos los filtros dispara un re-render masivo de la tabla completa.

### Solucion: Paginacion + Optimizacion de Callbacks

**Estrategia 1: Paginacion de tabla (impacto principal)**
- Agregar paginacion con 100 filas por pagina
- Solo renderizar las filas de la pagina actual en el DOM
- Reducir de ~2,500 nodos de fila a ~100, mejorando dramaticamente la velocidad de filtrado y renderizado

**Estrategia 2: Estabilizar callbacks con useRef**
- Usar `useRef` para `forms` en los callbacks `handleCriticalityChange`, `handleSubStatusChange` y `saveComment`
- Esto evita que los callbacks se re-creen cuando cambia `forms`, lo cual propagaria re-renders a todos los `memo` cells

**Estrategia 3: Optimizar DebouncedInput**
- Reducir delay de debounce de 300ms a 200ms para mayor responsividad
- Asegurar que `clearFilters` resetee el estado local del DebouncedInput sin delay

### Cambios en `src/components/maintenance/MaintenanceModule.tsx`

1. **Agregar estado de paginacion**:
   - `currentPage` (default 0)
   - `PAGE_SIZE = 100`
   - Reset `currentPage` a 0 cuando cambian los filtros

2. **Paginar `filtered`**:
   - `paginatedForms = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)`
   - Renderizar solo `paginatedForms` en la tabla

3. **Controles de paginacion**:
   - Mostrar "Pagina X de Y" y botones Anterior/Siguiente debajo de la tabla
   - Mostrar total de resultados filtrados

4. **Estabilizar callbacks con refs**:
```text
const formsRef = useRef(forms);
formsRef.current = forms;

// handleCriticalityChange: usar formsRef.current en vez de forms
// handleSubStatusChange: usar formsRef.current en vez de forms
// saveComment: eliminar forms de dependencias
```

5. **Optimizar limpieza de filtros**:
   - Unificar reseteo en un solo `setFilters(DEFAULT_FILTERS)` sin startTransition para respuesta inmediata

### Archivos a modificar
- `src/components/maintenance/MaintenanceModule.tsx`

### Resultado esperado
- Busqueda: respuesta inmediata (solo 100 filas re-renderizan)
- Criticidad/Sub-estado: actualizacion instantanea (callbacks estables, sin propagacion)
- Limpiar filtros: retorno inmediato al universo paginado

