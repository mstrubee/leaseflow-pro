

## Plan: Auto-clasificacion y correccion de labels de sub-estado

### Problema
1. Al asignar criticidad a un FORM, el sub-estado no cambia automaticamente a "Clasificado"
2. En el filtro y la tabla, se muestra la clave `Clasificacion_de_Criticidad` en lugar del label `Clasificado`, porque las busquedas en el mapa de labels usan claves en minuscula pero los valores de `subStatusOrder` vienen en su formato original
3. Los FORMs existentes con criticidad asignada y sub-estado "solicitado" deben migrar a "Clasificacion_de_Criticidad"

### Cambios

**1. Correccion de labels (MaintenanceModule.tsx)**

En el filtro de Sub Estado y el boton del Popover, las busquedas `subStatusLabels[s]` y `subStatusInfo[s]` fallan porque el mapa usa claves en minuscula pero `s` viene con el formato original (ej. `Clasificacion_de_Criticidad`). Se corregiran todas las busquedas agregando `.toLowerCase()`:
- Linea 848 (trigger del filtro): `subStatusLabels[filters.subStatusFilter.toLowerCase()]`
- Linea 864 (info en opciones): `subStatusInfo[s.toLowerCase()]`
- Linea 874 (label en opciones): `subStatusLabels[s.toLowerCase()]`

**2. Auto-avance al clasificar criticidad (MaintenanceModule.tsx)**

Modificar `handleCriticalityChange` (linea 562) para que, cuando se asigna una criticidad (valor distinto de "none") y el sub-estado actual es "solicitado", tambien actualice:
- `sub_status` a `Clasificacion_de_Criticidad`
- `status` a `proceso`

El estado local tambien se actualizara para reflejar el cambio inmediatamente.

**3. Migracion de datos existentes (SQL)**

Ejecutar una migracion que actualice todos los FORMs que tengan `criticality_category_id` no nulo y `sub_status = 'solicitado'`, cambiandolos a `sub_status = 'Clasificacion_de_Criticidad'` y `status = 'proceso'`.

```sql
UPDATE maintenance_forms
SET sub_status = 'Clasificación_de_Criticidad',
    status = 'proceso',
    updated_at = now()
WHERE criticality_category_id IS NOT NULL
  AND sub_status = 'solicitado'
  AND deleted_at IS NULL;
```
