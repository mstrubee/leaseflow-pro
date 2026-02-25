

## Fix: Sub-estado "Clasificado" muestra clave en vez de label

### Problema raiz
La tabla `maintenance_sub_statuses` tiene `name = 'Clasificación_de_Criticidad'` (con tilde), pero los formularios almacenan `sub_status = 'Clasificacion_de_Criticidad'` (sin tilde). Al buscar el label con `.toLowerCase()`, las claves no coinciden y el badge muestra la clave cruda.

### Solucion

**1. Normalizar la clave en la base de datos (migracion SQL)**

Actualizar el nombre en `maintenance_sub_statuses` para que no tenga tilde, asi coincide con lo que guardan los formularios:

```sql
UPDATE maintenance_sub_statuses
SET name = 'Clasificacion_de_Criticidad'
WHERE name = 'Clasificación_de_Criticidad';
```

**2. Estilo del badge para color amarillo (MaintenanceModule.tsx)**

Actualmente el badge aplica `borderColor` y `color` con el valor del color (ej. `"yellow"`). Para lograr **letras negras con borde amarillo**, cambiar la logica de estilo en la linea ~136:

- Cuando `currentColor` es `"yellow"`: aplicar `borderColor: '#eab308'` (amarillo visible), `color: 'black'`
- Para otros colores: mantener el comportamiento actual

### Detalles tecnicos

- **Archivo**: `src/components/maintenance/MaintenanceModule.tsx` (linea ~133-138, SubStatusCell)
- **Migracion SQL**: Normalizar el `name` en `maintenance_sub_statuses` para que coincida con los valores almacenados en `maintenance_forms`
