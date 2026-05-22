## Objetivo

Agregar un botón **"Exportar Excel"** en `CapexDashboard` que descargue un `.xlsx` con todo el CAPEX visible (respetando los filtros activos: año, empresa, clasificación, búsqueda) y con fórmulas vivas para que al editar las líneas, los subtotales por contrato y el total general se recalculen solos.

## Cambios

### 1. Nuevo archivo `src/components/budget/CapexExcelExport.ts`

Función `exportCapexToExcel(contractGroups, ufValue)` que:

1. Para cada contrato visible carga las líneas de presupuesto (usa el mismo `SELECT_COLS` que `budgetTotals.ts` y reutiliza `buildBudgetTree` + el mismo pipeline de exclusión: ghost, merged, surcharge, proveedores de transferencia interna, template prices).
2. Construye una hoja única con las siguientes columnas:

   `Contrato | Empresa | Clasificación | Año | Nivel | Categoría / Línea | Proveedor | Cantidad | Unidad | Precio Unit. (UF) | Monto (UF) | Monto (CLP) | UF/m² | m²`

3. Estructura del libro:
   - Fila 1: encabezado con valor UF actual en celda con nombre (`UF_VALUE` named range) para que CLP = `Monto UF * UF_VALUE`.
   - Fila 2: títulos de columnas.
   - Por cada contrato:
     - Fila de cabecera (negrita, fondo gris) con datos del contrato.
     - Filas de líneas hijas con su path jerárquico indentado (`Nivel` = profundidad).
     - Fila **Subtotal contrato**: `Monto UF = SUM(rango de líneas hijas)`, `Monto CLP = MontoUF * UF_VALUE`, `UF/m² = MontoUF / m²`.
   - Fila final **TOTAL GENERAL**: `=SUM(...subtotales...)` para UF y CLP.

4. **Fórmulas usadas** (vía `{ t: "n", f: "..." }` de SheetJS):
   - Líneas hoja: `Monto UF = Cantidad * Precio Unit.` (cuando aplique; si la línea es solo monto manual, queda con valor numérico editable).
   - Subtotal contrato: `SUM(K{first}:K{last})`.
   - Monto CLP: `K{row} * UF_VALUE`.
   - UF/m²: `K{row} / N{row}` con `IFERROR` para evitar `#DIV/0!`.
   - Total general: `SUM(...)` solo sobre filas de subtotal.

5. Formato:
   - Anchos de columna definidos.
   - Filas de cabecera de contrato y subtotal con `fill` gris y `bold`.
   - Formato numérico: UF con 2 decimales, CLP con separadores, % no aplica.
   - Freeze pane en fila 2.

6. Nombre archivo: `CAPEX_{yearFilter}_{timestamp}.xlsx`.

### 2. `src/pages/CapexDashboard.tsx`

- Importar `exportCapexToExcel` y el icono `FileSpreadsheet` de lucide.
- Estado `exportingExcel`.
- Handler `handleExportExcel` que arma el set de contratos filtrados (igual que la grilla actual usa `contractGroups`) y llama al export.
- Agregar `<Button>` "Exportar Excel" en el header (antes del botón "PPT General"), con loader cuando `exportingExcel`.

## Fuera de alcance

- No se modifica la lógica de cálculo de CAPEX.
- No se importan/escriben datos al backend.
- No se cambia la vista jerárquica (la jerarquía se aplana con indentación en la columna "Categoría / Línea").
