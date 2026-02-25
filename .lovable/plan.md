

## Plan: Mejoras en Criticidad - Selector, Descripcion, PDF y Excel

### 1. Selector de criticidad: solo listado, tooltip en hover

Actualmente el Popover muestra codigo y nombre inline. Se cambiara para que:
- El listado del Popover muestre solo el nombre y el circulo de color (limpio y rapido)
- Al posarse sobre cada opcion con el mouse, un `Tooltip` muestre el codigo y la descripcion de esa categoria
- Esto reemplaza el texto secundario inline por un tooltip bajo demanda, manteniendo el menu compacto

### 2. Click en descripcion: mostrar detalle individual

Actualmente la celda de "Descripcion" muestra un texto truncado. Se cambiara para que:
- Al hacer click en la descripcion truncada, se abra un `Popover` o `Dialog` pequeno que muestre SOLO esa descripcion completa (no todo el form)
- Se mostrara el titulo del campo (ej: "Descripcion General", "Req. Electrico") y su contenido completo
- Si el form tiene multiples descripciones rellenas, se mostraran todas las que tengan contenido, pero solo las descripciones

### 3. PDF: incluir criticidad

Modificar `exportMaintenancePDF` en `maintenanceExport.ts` para:
- Aceptar un parametro opcional `criticalityName?: string`
- Agregar la linea `Criticidad: {criticalityName}` en la cabecera del PDF junto a Estado, Fecha, Empresa, Local y Tipo
- Actualizar la llamada en `MaintenanceModule.tsx` para pasar el nombre de la categoria

### 4. Excel: preguntar si incluir criticidad

Modificar el flujo de descarga Excel para:
- Al pinchar "Descargar Excel", mostrar un dialogo de confirmacion con la pregunta "Incluir columna de Criticidad?"
- Si el usuario acepta, agregar la columna "Criticidad" al Excel con el nombre de la categoria (o vacio si no tiene)
- Si rechaza, descargar sin esa columna (comportamiento actual)
- Se usara un simple `AlertDialog` con botones "Si, incluir" y "No, sin criticidad"
- Modificar `exportMaintenanceExcel` para aceptar un parametro opcional con el mapa de criticidades

### Detalle tecnico

**Archivos a modificar:**

1. **`src/components/maintenance/MaintenanceModule.tsx`**:
   - Lineas 684-694: Envolver cada opcion del Popover de criticidad con `Tooltip` que muestre codigo+descripcion al hover, y mostrar solo nombre+color en el item visible
   - Lineas 708-709: Reemplazar el `<TableCell>` de descripcion truncada por un elemento clickeable que abre un Popover con el detalle completo de las descripciones
   - Linea 744: Actualizar la llamada a `exportMaintenancePDF` para pasar `criticalityName`
   - Lineas 596-598: Reemplazar el click directo de "Descargar Excel" por un estado que abra un AlertDialog preguntando por criticidad
   - Agregar estado `excelCritDialog` para controlar el dialogo
   - Agregar AlertDialog al final del componente

2. **`src/components/maintenance/maintenanceExport.ts`**:
   - `exportMaintenanceExcel`: Agregar parametro opcional `criticalityMap?: Map<string, string>` para mapear `criticality_category_id` a nombre; si se proporciona, agregar columna "Criticidad"
   - `exportMaintenancePDF`: Agregar parametro `criticalityName?: string` y mostrar en cabecera del PDF
