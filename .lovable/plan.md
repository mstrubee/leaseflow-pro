

## Plan: Tooltips informativos en botones y listas desplegables

### Cambios en `src/components/maintenance/MaintenanceModule.tsx`

### 1. Tooltip en el boton de Sub-Estado (trigger del Popover)

Actualmente el boton del `SubStatusCell` (linea 126) solo abre el Popover al hacer click, pero no muestra informacion al pasar el puntero. Se envolvera el boton trigger con un `Tooltip` que muestre la descripcion y responsable del sub-estado actual.

Se necesita agregar `subStatusInfo` como prop del componente `SubStatusCell` para tener acceso a la descripcion.

### 2. Tooltip en el boton de Criticidad (trigger del Popover)

El Badge de criticidad ya tiene un Tooltip (lineas 948-958), pero esta dentro del `PopoverTrigger`, lo que causa conflicto: al hacer hover aparece el tooltip y al click abre el popover sobre el mismo elemento. Se reestructurara para que el Tooltip envuelva al PopoverTrigger, evitando interferencia.

### 3. Velocidad de los tooltips

Se configurara `delayDuration={100}` en los `TooltipProvider` relevantes (tabla principal y filtros) para que la aparicion sea mas rapida.

### 4. Tooltips en las listas desplegables

Los tooltips en las opciones de los dropdowns de sub-estado y criticidad ya existen (lineas 138-164 y 972-986). Se verificara que tienen `delayDuration` bajo para respuesta rapida. Se ajustara el `TooltipProvider` de la tabla (linea 899) a `delayDuration={100}`.

### Detalle tecnico

**SubStatusCell** (lineas 106-169):
- Agregar prop `subStatusInfo`
- Envolver el `PopoverTrigger` con un `Tooltip` que muestre descripcion/responsable del sub-estado actual
- Agregar `TooltipProvider delayDuration={100}` dentro del `PopoverContent`

**Celda de Criticidad** (lineas 943-989):
- Mover el `Tooltip` existente para que envuelva el `PopoverTrigger` en vez de estar dentro de el
- Agregar `TooltipProvider delayDuration={100}` dentro del `PopoverContent`

**TooltipProviders existentes:**
- Tabla principal (linea 899): cambiar `delayDuration={200}` a `delayDuration={100}`
- Filtro sub-estados (linea 829): cambiar `delayDuration={200}` a `delayDuration={100}`

**Invocacion de SubStatusCell** (linea 935-941):
- Pasar `subStatusInfo` como prop adicional

