

## Plan: Detalle flotante en filtro de sub-estados (reemplazar detalle inline)

### Problema actual
El filtro de sub-estados muestra la descripcion y responsable directamente dentro de cada item del dropdown, haciendo la lista larga, lenta y poco agil.

### Solucion
Revertir el detalle inline y usar un **Popover** (en vez de `Select`) para el filtro de sub-estados. Esto permite usar `Tooltip` en cada opcion del listado, mostrando la descripcion solo al posarse sobre el nombre en una ventanilla flotante.

### Detalle tecnico

**Archivo: `src/components/maintenance/MaintenanceModule.tsx`**

1. **Reemplazar el `Select` del filtro Sub Estado** (lineas 845-866) por un `Popover` con un boton trigger que muestre el valor actual
2. Dentro del `PopoverContent`, listar las opciones como botones simples (solo el nombre)
3. Envolver cada opcion en un `Tooltip` con `delayDuration={100}` que muestre descripcion y responsable al posar el puntero
4. Al hacer click en una opcion, actualizar el filtro y cerrar el Popover

Estructura resultante:
```text
Popover
  Trigger: Button mostrando sub-estado seleccionado (o "Todos")
  Content:
    TooltipProvider delayDuration={100}
      Boton "Todos" (sin tooltip)
      Para cada sub-estado:
        Tooltip
          TooltipTrigger: Boton con nombre del sub-estado
          TooltipContent (side="right"): descripcion + responsable
```

Esto mantiene el dropdown limpio y rapido, con detalles visibles solo al hacer hover.
