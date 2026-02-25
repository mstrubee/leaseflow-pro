

## Plan: Mejoras en Criticidad de Mantenciones

### 1. Mejorar rendimiento del selector de criticidad

Actualmente el selector es un `Select` de Radix que se renderiza por cada fila de la tabla, causando lentitud. Se reemplazara por un enfoque mas ligero:
- Cambiar la interfaz `CriticalityCategory` para incluir `code` y `description` en la query inicial
- Usar un simple `DropdownMenu` nativo o un `Popover` ligero en lugar de `Select` por cada fila, evitando montar/desmontar portales pesados

### 2. Tooltip con codigo y descripcion al pasar el mouse

- Envolver el Badge de criticidad con un `Tooltip` que muestre el codigo y la descripcion de la categoria
- Formato: "Codigo: {code} - {description}"
- Actualizar la query de criticidades para traer `code` y `description` ademas de `id`, `name`, `color`

### 3. Ordenamiento por columna Criticidad

- Reemplazar el `TableHead` estatico de "Criticidad" por `SortableTableHead` con `sortKey="criticality_category_id"`
- En la logica de sort, resolver el nombre de la categoria para ordenar alfabeticamente por nombre de criticidad en lugar de por UUID

### 4. Filtro de criticidad

- Agregar un nuevo estado `criticalityFilter` (default: `"all"`)
- Agregar un `Select` en la barra de filtros con las categorias disponibles + opcion "Todas" y "Sin criticidad"
- Aplicar el filtro en el `useMemo` de `filtered`

### 5. Cards de criticidad como filtros rapidos

- Agregar una fila de Cards (una por cada categoria de criticidad activa) debajo de las 3 cards de stats existentes
- Cada card muestra:
  - Nombre de la criticidad con su color
  - Cantidad de forms "En Proceso" (`status === "proceso"`) con esa criticidad
- Al hacer click en una card:
  - Se establece `statusFilter = "proceso"` y `criticalityFilter = {id de la categoria}`
  - Si ya estaba activo ese filtro, se limpia (toggle)
- Cards con borde coloreado segun el color de la categoria

### Detalle tecnico

**Archivo a modificar:** `src/components/maintenance/MaintenanceModule.tsx`

Cambios especificos:
1. Actualizar `CriticalityCategory` interface para incluir `code: string` y `description: string | null`
2. Actualizar query en `fetchCriticalities` para traer `id, name, code, description, color`
3. Agregar estado `criticalityFilter` con valor `"all"`
4. En filtros UI: agregar Select de criticidad despues del filtro de Tipo
5. En `filtered` useMemo: agregar condicion de filtro por `criticality_category_id`
6. En sort: cuando `sortKey === "criticality_category_id"`, resolver al nombre de la categoria para comparacion
7. Reemplazar `<TableHead className="w-36">Criticidad</TableHead>` por `<SortableTableHead>` con sortKey `"criticality_category_id"`
8. Reemplazar el `Select` inline por un `Popover` ligero con items clickeables y `Tooltip` en cada opcion del Badge
9. Agregar cards de criticidad con conteo de "En Proceso" y funcionalidad de filtro automatico

No se requieren cambios en la base de datos ni migraciones.

