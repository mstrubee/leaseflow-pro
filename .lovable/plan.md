

## Historial de Sub Estados con Usuario Clasificador

### Situacion actual
El historial actual muestra tarjetas estaticas basadas en columnas de timestamp del formulario (`sub_status_solicitado_at`, etc.). No muestra quien realizo el cambio ni usa los datos reales de la tabla `maintenance_status_history` que ya registra cada transicion con `changed_by` y `changed_at`.

### Solucion
Reemplazar el historial actual por uno que consulte la tabla `maintenance_status_history`, filtrando por `field_changed = 'sub_status'`, y cruzando con `profiles` para obtener el nombre del usuario clasificador.

### Cambios

**1. MaintenanceEditDialog.tsx -- Consultar historial real**
- Al abrir el dialogo, hacer una consulta a `maintenance_status_history` filtrando por `form_id` y `field_changed = 'sub_status'`, ordenado por `changed_at`.
- Hacer un segundo query (o join) a `profiles` para obtener el `full_name` o `email` del `changed_by`.
- Reemplazar la seccion de timeline actual (que itera `subStatuses` y busca columnas timestamp) por tarjetas que muestren:
  - **Sub Estado**: label del sub-estado (usando `subStatusLabels`)
  - **Fecha**: `changed_at` formateada
  - **Usuario Clasificador**: nombre del usuario que realizo el cambio (vacio para "Solicitado")
  - **Fecha de Clasificacion**: igual a `changed_at` (momento en que se asigno)
- Las tarjetas son de solo lectura, no editables.
- Para el sub-estado "Solicitado", usar `created_at` del formulario como fecha y no mostrar usuario.

### Detalle tecnico

```text
// Estado para el historial
const [history, setHistory] = useState([]);

// Fetch al abrir
useEffect(() => {
  if (!form || !open) return;
  
  // 1. Obtener registros de maintenance_status_history
  // 2. Obtener profiles para los changed_by ids
  // 3. Combinar y ordenar cronologicamente
  // 4. Agregar entrada "Solicitado" con created_at del form
}, [form?.id, open]);

// Render: tarjetas no editables con sub-estado, fecha, usuario
```

**Archivos a modificar:**
- `src/components/maintenance/MaintenanceEditDialog.tsx`

No se requieren cambios de base de datos ya que la tabla `maintenance_status_history` ya existe y el trigger ya registra `changed_by` con `auth.uid()`.

