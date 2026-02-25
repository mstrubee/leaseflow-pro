

## Plan: Mejoras en Cards de Criticidad, Boton Limpiar Filtros y Rendimiento del Selector

### 1. Corregir toggle de deseleccion en cards de criticidad

El codigo actual en `handleCriticalityCardClick` ya implementa el toggle, pero la condicion verifica que `statusFilter === "proceso"` Y `criticalityFilter === catId`. Si el usuario cambio manualmente el statusFilter despues de hacer click en la card, el toggle no funciona correctamente. Se simplificara la logica para que al hacer click en una card ya activa (donde `criticalityFilter === catId`), se limpien ambos filtros independientemente del statusFilter actual.

### 2. Boton "Limpiar filtros"

Agregar un boton visible en la barra de filtros que resetee todos los filtros a sus valores por defecto:
- `search = ""`
- `statusFilter = "all"`
- `typeFilter = "all"`
- `criticalityFilter = "all"`
- `selectedYears = []`
- `selectedContracts = []`
- `companyFilter = "all"`
- `contractSearch = ""`

El boton tendra fondo estandar (variant="outline") y texto en rojo.

### 3. Mejorar rendimiento del selector de criticidad

El `DropdownMenu` actual aun tiene overhead por los `Tooltip` anidados dentro de cada `DropdownMenuItem`, lo cual genera re-renders y portales adicionales por cada opcion en cada fila. Se reemplazara por un enfoque con `Popover` minimalista:
- Usar un `Popover` simple con un `div` de opciones clickeables (sin `Tooltip` dentro del menu)
- Mostrar la info de codigo/descripcion directamente como texto secundario en cada opcion del popover, eliminando la necesidad de tooltips anidados
- Mantener el `Tooltip` solo en el badge visible (fuera del popover), que ya funciona bien
- Controlar el estado open/close manualmente para cerrar al seleccionar

### Detalle tecnico

**Archivo a modificar:** `src/components/maintenance/MaintenanceModule.tsx`

Cambios especificos:

1. **handleCriticalityCardClick** (linea ~290): Cambiar la condicion de toggle para verificar solo `criticalityFilter === catId` en lugar de ambas condiciones.

2. **Boton "Limpiar filtros"** (despues de linea ~518): Agregar un `Button` con `variant="outline"` y `className="text-red-600 border-red-200 hover:bg-red-50"` que llame a una funcion `clearAllFilters`.

3. **Selector de criticidad en cada fila** (lineas ~566-607): Reemplazar `DropdownMenu` con `Tooltip` anidados por un `Popover` simple:
   - El trigger es el badge actual (envuelto en Tooltip para mostrar codigo/descripcion)
   - El contenido del Popover es una lista de `div` clickeables sin tooltips internos
   - Cada opcion muestra: circulo de color + nombre + codigo en gris pequeno
   - Al hacer click, se cierra el popover y se ejecuta `handleCriticalityChange`

