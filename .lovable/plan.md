

## Marcar inicio de pago de renta en la Carta Gantt

Agregar una línea vertical roja segmentada en el diagrama Gantt que indique el día exacto en que comienza el pago de la renta del contrato, considerando los meses de gracia.

### Cálculo de la fecha
La fecha base del arriendo se obtiene de la versión vigente del contrato:
- Base: `effective_date` (si existe) o `signed_date`.
- Mes de inicio de pago = `grace_months + 1` (consistente con `calculateCurrentRentUF` en `src/lib/contractRent.ts`).
- Fecha de inicio de pago de renta = `base + grace_months` meses (usando `addMonths` de date-fns para coincidir con el inicio del primer mes pagado).
- Si no hay `signed_date` ni `effective_date`, no se dibuja la línea.

### Cambios

1. **`src/components/gantt/GanttModule.tsx`**
   - Cargar (una vez al montar) los campos necesarios desde `contracts` y la versión de contrato actual: `signed_date`, `effective_date`, `grace_months`.
   - Pasar a `<GanttChart />` un nuevo prop opcional `rentStartDate: string | null` (formato `yyyy-MM-dd`).

2. **`src/components/gantt/GanttChart.tsx`**
   - Añadir `rentStartDate?: string | null` a `GanttChartProps`.
   - Junto al overlay del "today highlight" (línea ~1260), agregar un overlay similar:
     - Buscar el índice del día en `days` que coincide con `rentStartDate`.
     - Si está dentro del rango visible, renderizar un `<div>` posicionado absolutamente con:
       - `border-left: 2px dashed #ef4444` (rojo)
       - altura completa de filas de tareas
       - z-index sobre las barras pero sin bloquear interacción (`pointer-events-none`)
     - Tooltip al hacer hover con texto "Inicio pago de renta — DD/MM/YYYY".
   - Agregar una pequeña etiqueta "Inicio renta" cerca del tope de la línea para identificarla visualmente.

### Notas técnicas
- Si la fecha cae fuera del rango visible del Gantt (`days`), simplemente no se renderiza (no se cambia el rango automático).
- No se modifica la base de datos ni los hooks `useGantt`.
- El cálculo respeta que mes de gracia 0 = pago empieza el día base; mes de gracia N = pago empieza N meses después de la fecha base.

### Archivos a modificar
- `src/components/gantt/GanttModule.tsx`
- `src/components/gantt/GanttChart.tsx`

