

## Plan: Card de Fecha, Comentarios Editables y Sub-Estado "Revisado"

### 1. Migración de Base de Datos

Agregar columna `sub_status_revisado_at` a la tabla `maintenance_forms` para rastrear cuando un form fue marcado como revisado. Actualizar el trigger `track_maintenance_status_change` para manejar el nuevo sub-estado 'revisado'.

```sql
ALTER TABLE public.maintenance_forms 
  ADD COLUMN sub_status_revisado_at timestamptz;

-- Update trigger to handle 'revisado'
CREATE OR REPLACE FUNCTION public.track_maintenance_status_change() ...
  WHEN 'revisado' THEN NEW.sub_status_revisado_at := now();
```

### 2. Card de Fecha Específica (junto a "Solucionados")

- Agregar un cuarto card en la fila de estadísticas (cambiar grid de 3 a 4 columnas)
- El card muestra un Input tipo `date` con valor por defecto de hoy (`format(new Date(), "yyyy-MM-dd")`)
- Al seleccionar una fecha, filtra los forms cuyo `created_date` coincida con esa fecha exacta
- Incluir un icono de calendario (`CalendarDays`) y mostrar la cantidad de forms en esa fecha
- Al hacer click en el card (cuando ya tiene fecha), activa/desactiva el filtro por fecha
- Agregar `dateFilter` al objeto `FilterState` (valor `string | null`, default `null`)
- El filtro se aplica en el `useMemo` de `filtered`

### 3. Comentarios Editables al Hacer Click

- Reemplazar la celda de "Comentarios" (actualmente solo muestra texto truncado o "-") por un elemento clickeable
- Al hacer click, abrir un `Popover` con un `Textarea` editable precargado con el comentario actual
- Al pie del popover, indicar: "Ctrl + Enter para guardar"
- Manejar `onKeyDown` en el Textarea: si `e.ctrlKey && e.key === "Enter"` → disparar guardado
- Enter normal solo agrega nueva línea (comportamiento por defecto del textarea)

**Flujo de guardado:**
1. Al presionar Ctrl+Enter, mostrar un `AlertDialog` preguntando: "¿Desea marcar como REVISADO?"
2. Botón "No": Solo guarda el comentario (`additional_comments`) en la BD y cierra
3. Botón "Sí": Guarda el comentario Y actualiza `sub_status` a `'revisado'`
4. Actualizar el estado local y el cache
5. Cerrar el popover

- Al hacer click en un comentario existente (no vacío), primero mostrar el detalle completo (como se hace con las descripciones), con un botón "Editar" que cambie al modo de edición

### 4. Actualizar tipos y constantes (`types.ts`)

- Agregar `'revisado'` al `SUB_STATUS_ORDER` (después de `'solicitado'`)
- Agregar label: `revisado: 'Revisado'`
- Agregar info: `revisado: { description: 'Form revisado por Control de Gestión...', responsible: 'Control de Gestión' }`
- Agregar `sub_status_revisado_at` a la interfaz `MaintenanceForm`

### 5. Excel: Exportación con opciones ampliadas

Modificar el diálogo de descarga Excel para ofrecer checkboxes en lugar de solo sí/no:
- Checkbox "Incluir Criticidad"
- Checkbox "Incluir sub-estado Revisado"

Cuando se incluye "Revisado", agregar columna "Sub Estado" al Excel. Cuando NO se incluye, los forms con sub_status `'revisado'` se exportan como `'Solicitado'`.

Actualizar `exportMaintenanceExcel` para aceptar un parámetro `includeRevisado?: boolean`:
- Si `true`: agregar columna "Sub Estado" con el valor real
- Si `false` o no proporcionado: no agregar columna, o si se agrega, mapear 'revisado' a 'Solicitado'

### 6. Excel: Importación preserva datos existentes

La importación ya omite forms existentes (no los sobrescribe). Esto significa que criticidad, comentarios y sub_status se preservan automáticamente. Se refuerza visualmente mostrando en la preview:
- Criticidad existente (ya implementado)
- Sub-estado actual (agregar badge en preview)
- Indicador de que los comentarios existentes se conservan

### 7. Detalle técnico - Archivos a modificar

**`src/components/maintenance/types.ts`:**
- Insertar `'revisado'` en `SUB_STATUS_ORDER` después de `'solicitado'`
- Agregar entrada en `SUB_STATUS_LABELS`, `SUB_STATUS_INFO`
- Agregar `sub_status_revisado_at` a interfaz `MaintenanceForm`

**`src/components/maintenance/MaintenanceModule.tsx`:**
- Agregar `dateFilter: string | null` a `FilterState` (default `null`)
- Agregar card de fecha al grid de stats (cambiar `grid-cols-3` a `grid-cols-4`)
- Agregar filtro por fecha en el `useMemo` de `filtered`
- Reemplazar celda de comentarios por Popover editable con textarea + Ctrl+Enter
- Agregar AlertDialog para "¿Marcar como REVISADO?"
- Actualizar diálogo de descarga Excel con checkboxes

**`src/components/maintenance/maintenanceExport.ts`:**
- Agregar parámetro `includeRevisado?: boolean` a `exportMaintenanceExcel`
- Si `includeRevisado`, agregar columna "Sub Estado"
- Mapear 'revisado' → 'Solicitado' cuando no se incluye

**`src/components/maintenance/MaintenanceExcelUpload.tsx`:**
- En la tabla de preview, mostrar el sub-estado actual de forms existentes
- Agregar badge indicando que comentarios/criticidad se conservan

**`src/components/maintenance/MaintenanceEditDialog.tsx`:**
- Agregar `'revisado'` al timeline de sub-estados (ya se renderiza dinámicamente desde `SUB_STATUS_ORDER`)

