

## Plan: Persistencia de Criticidad, Cache de Datos y Filtros Rapidos

### 1. Preservar criticidad al cargar nuevo Excel

Cuando se suben nuevos formularios via Excel, si ya existe un form con el mismo `form_number` que tiene una criticidad asignada, los nuevos forms no sobreescriben ese dato (esto ya funciona porque los existentes se omiten). Sin embargo, falta el caso inverso: si el usuario quiere reasignar criticidades masivamente. Se agregara logica en `MaintenanceExcelUpload.tsx` para:

- Al detectar forms existentes (`isExisting = true`), consultar su `criticality_category_id` actual desde la BD
- Mostrar esa criticidad en la tabla de preview del upload (columna adicional con badge de color)
- Asegurar que el `handleInsert` solo inserte forms nuevos sin tocar la criticidad de los existentes (ya implementado, se refuerza visualmente)

### 2. Cache de datos entre navegaciones

Actualmente `fetchForms` se ejecuta en cada montaje del componente (`useEffect(() => fetchForms(), [])`). Se reemplazara por una estrategia de cache usando `sessionStorage`:

- Al cargar forms exitosamente, guardar en `sessionStorage` con key `maintenance_forms_cache` y un timestamp
- Al montar el componente, verificar si existe cache reciente (menos de 5 minutos)
- Si existe cache valido, usar los datos cacheados inmediatamente (sin loading) y hacer fetch en background para refrescar
- Si no existe cache o esta expirado, hacer fetch normal con loading
- Despues de upload exitoso o edicion, invalidar cache y refrescar
- Hacer lo mismo para `criticalityCategories` y `contractCompanyMap`

### 3. Mejorar velocidad de limpieza de filtros

El boton "Limpiar filtros" actualmente ejecuta 8 llamadas `setState` separadas. Aunque React 18 las agrupa, los multiples `useMemo` dependientes se recalculan en cascada. Se optimizara:

- Agrupar todos los filtros en un unico objeto de estado `filters` con `useReducer` o un solo `useState` con objeto, permitiendo un unico `setFilters(defaultFilters)` para limpiar todo
- Usar `React.startTransition` para la actualizacion de filtros, marcandola como no urgente y manteniendo la UI responsiva
- Pre-calcular el resultado "sin filtros" como referencia rapida

### Detalle tecnico

**Archivos a modificar:**

1. **`src/components/maintenance/MaintenanceExcelUpload.tsx`**:
   - Despues de verificar forms existentes (lineas 330-348), consultar `criticality_category_id` para esos forms
   - Agregar propiedad `existingCriticality` al tipo de fila parseada
   - Mostrar badge de criticidad en la tabla de preview para forms existentes

2. **`src/components/maintenance/MaintenanceModule.tsx`**:
   - Reemplazar los 8 estados de filtro individuales por un unico `useState<FilterState>` con objeto:
     ```text
     FilterState = { search, statusFilter, typeFilter, criticalityFilter, 
                     selectedYears, selectedContracts, companyFilter, contractSearch }
     ```
   - Limpiar filtros con un solo `setFilters(DEFAULT_FILTERS)`
   - Agregar cache en `sessionStorage` para `forms`, `criticalityCategories` y `contractCompanyMap`
   - Al montar: leer cache, mostrar datos inmediatamente, refrescar en background
   - Al insertar/editar: invalidar cache
   - Envolver actualizaciones de filtros pesadas con `startTransition`

3. **`src/components/maintenance/types.ts`**:
   - Agregar `existingCriticality?: string | null` a `ParsedMaintenanceRow` (opcional, para el preview)

