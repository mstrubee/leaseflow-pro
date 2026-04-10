

# Agregar columna "Gerente Zonal" al módulo de Mantenciones

## Resumen

Mostrar el Gerente Zonal responsable de cada FORM de mantención (basado en el local/contrato asignado en el organigrama), permitir filtrar y ordenar por ese campo, y exportar el resultado filtrado a PDF con el formato estándar.

## Cambios

### 1. Cargar el mapa contract → Gerente Zonal

En `MaintenanceModule.tsx`, al inicializar, consultar `org_member_contracts` + `org_members` (filtrando por `position ILIKE '%zonal%'`) para construir un mapa `Record<string, string>` donde la clave es `contract_id` y el valor es el nombre del gerente zonal. Se cachea en sessionStorage junto con los demás mapas existentes.

### 2. Agregar filtro "Gerente Zonal"

Añadir `zonalFilter: string` al `FilterState` (default `"all"`). Crear un `<Select>` en la barra de filtros con las opciones derivadas de los gerentes zonales únicos presentes en los forms. Aplicar el filtro en el `useMemo` de `filtered`.

### 3. Agregar columna en la tabla

Insertar una columna "Gerente Zonal" (sortable) en la tabla, entre "Contrato" y "Tipo". Mostrar el nombre del zonal o "—" si no tiene asignado. Actualizar el `colSpan` de las filas de carga/vacío.

### 4. Soporte de ordenamiento

Agregar un caso `zonalName` en la lógica de sort del `useMemo`, usando el mapa contract→zonal para resolver el valor.

### 5. Exportar a PDF filtrado

Modificar `exportDailyFormsPDF` en `maintenanceExport.ts` para aceptar un parámetro opcional `zonalMap: Map<string, string>` y agregar la columna "Gerente Zonal" al PDF. Agregar un botón "Descargar PDF filtrado" en la UI que invoque esta función con los forms filtrados actuales, incluyendo la columna de zonal.

## Archivos a modificar

- `src/components/maintenance/MaintenanceModule.tsx` — nuevo estado, fetch, filtro, columna, botón PDF
- `src/components/maintenance/maintenanceExport.ts` — agregar columna "Gerente Zonal" a `exportDailyFormsPDF`

## Detalles técnicos

**Query para el mapa zonal:**
```sql
SELECT mc.contract_id, m.name
FROM org_member_contracts mc
JOIN org_members m ON m.id = mc.org_member_id
WHERE m.position ILIKE '%zonal%'
```

No se requieren migraciones de base de datos. Los datos ya existen en `org_members` y `org_member_contracts`.

