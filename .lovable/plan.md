

## Plan: Mostrar detalle de sub-estado en filtro desplegable

### Problema
El filtro de "Sub Estado" en la barra de filtros (lineas 824-835) usa un `Select` basico con `SelectItem`. No muestra la descripcion ni el responsable al posarse sobre cada opcion.

### Solucion
Envolver cada `SelectItem` del filtro de sub-estados con un `Tooltip` que muestre la descripcion y responsable, igual que en el dropdown de la tabla (`SubStatusCell`).

### Cambios

**Archivo unico: `src/components/maintenance/MaintenanceModule.tsx`**

1. Agregar `subStatusInfo` a la destructuracion del hook `useMaintenanceSubStatuses` (linea 234)
2. Reemplazar el bloque del filtro de sub-estados (lineas 826-834) para envolver cada `SelectItem` en un `Tooltip` con descripcion y responsable

El resultado sera:
```text
Select > SelectContent >
  SelectItem "Todos" (sin tooltip)
  Para cada sub-estado:
    Tooltip >
      TooltipTrigger > SelectItem con label
      TooltipContent > descripcion + responsable (si existen)
```

Esto reutiliza el `TooltipProvider` que ya envuelve la tabla (linea 882), por lo que no se necesita agregar uno nuevo -- sin embargo, el filtro esta fuera de ese provider, asi que se envolvera el `SelectContent` del filtro en su propio `TooltipProvider`.

