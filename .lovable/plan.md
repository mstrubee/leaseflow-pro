

## Selector manual de clasificación en CAPEX Dashboard

### Que se hará
Cuando un contrato no tenga clasificación asignada (o se quiera cambiar), mostrar un selector inline en el header del contrato dentro del listado CAPEX, con las opciones: **Nuevo**, **Reemplazo**, **Regularización**. Al seleccionar, se actualiza directamente en la base de datos.

### Cambios

**Archivo: `src/pages/CapexDashboard.tsx`**

1. **Reemplazar el Badge estático por un selector interactivo** (líneas ~347-351):
   - Si `clasificacion` ya tiene valor: mostrar un `Select` compacto con el valor actual pre-seleccionado
   - Si no tiene valor: mostrar un `Select` con placeholder "Clasificar..."
   - Opciones: `nuevo` (Nuevo), `reemplazo` (Reemplazo), `regularizacion` (Regularización)
   - El Select usará `e.stopPropagation()` en el trigger para evitar que abra/cierre el collapsible al hacer clic

2. **Agregar función `handleClasificacionChange`**:
   - Recibe `contractId` y el nuevo valor de clasificación
   - Actualiza `contracts.clasificacion` en la base de datos via `supabase.from('contracts').update({ clasificacion: value }).eq('id', contractId)`
   - Actualiza el estado local `budgets` para reflejar el cambio sin recargar todo
   - Muestra toast de confirmación

3. **Agregar "Regularización" a los totales del summary** (líneas ~195-206):
   - Agregar variable `totalRegularizacionUF` al memo existente
   - Agregar una tercera card en la fila de resumen mostrando el total de Regularización
   - Cambiar el grid de `md:grid-cols-2` a `md:grid-cols-3`

4. **Estilo del badge/select**: El Select será compacto (altura reducida, sin borde excesivo) para integrarse visualmente con el header del contrato.

### Detalles técnicos
- No se requieren cambios en la base de datos: el campo `clasificacion` ya existe como `string | null` en la tabla `contracts`
- Se reutilizará el componente `Select` existente de la UI
- El valor `"regularizacion"` se almacenará en minúsculas sin tilde, consistente con los valores existentes (`"nuevo"`, `"reemplazo"`)
