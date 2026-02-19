
# Cargar solo FORMs nuevos desde Excel

## Problema
Actualmente, al cargar un Excel, el sistema usa `upsert` que sobrescribe **todos** los campos de los forms existentes, incluyendo:
- **Estado** (status)
- **Sub Estado** (sub_status)
- **Comentarios** (additional_comments)

Esto causa la perdida de todo el avance registrado en el sistema.

## Solucion

Antes de insertar, consultar la base de datos para obtener los `form_number` que ya existen. Filtrar las filas del Excel para insertar **solo los forms nuevos**, ignorando los que ya estan en el sistema.

Adicionalmente, mostrar al usuario un resumen claro de cuantos forms son nuevos vs. cuantos ya existen (y seran omitidos).

## Cambios tecnicos

### Archivo: `src/components/maintenance/MaintenanceExcelUpload.tsx`

1. **En `handleInsert`**: Antes de insertar, consultar `maintenance_forms` para obtener todos los `form_number` existentes. Filtrar `validRows` para quedarse solo con los que NO existen en la base de datos.

2. **Mostrar estadisticas**: Agregar al resumen de la tabla:
   - Forms nuevos (se insertaran)
   - Forms existentes (se omitiran)
   - Errores y advertencias (como ya funciona)

3. **Cambiar `upsert` por `insert`**: Ya que solo se enviaran forms nuevos, no se necesita upsert.

4. **Actualizar mensajes**: El toast final indicara cuantos forms nuevos se cargaron y cuantos se omitieron por ya existir.

### Flujo actualizado

1. Usuario sube Excel
2. Se parsean las filas como antes (matching de contratos, etc.)
3. Se consultan los `form_number` existentes en la BD
4. Se marcan las filas existentes como "ya existe" (badge visual)
5. Al confirmar, solo se insertan los forms nuevos
6. Toast: "X forms nuevos cargados, Y omitidos (ya existian)"
