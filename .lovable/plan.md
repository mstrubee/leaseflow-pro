## Objetivo
Que la descarga Excel de CAPEX:
1. Muestre **todos los contratos con CAPEX**, incluso si aún no tienen líneas de presupuesto detalladas (hoy aparecen en blanco/sin monto).
2. Traiga **autofiltro habilitado** en la cabecera y **prefiltrado a Nivel = 0** (solo filas de contrato visibles por defecto; el usuario puede expandir otros niveles desde el filtro).

## Cambios en `src/components/budget/CapexExcelExport.ts`

### 1. Fallback de monto legado por contrato
Hoy la fila de cabecera del contrato calcula su `Monto (UF)` exclusivamente como `SUM()` de las filas hijas. Si el contrato no tiene `budget_lines`, queda vacío.

- Extender `CapexExportContract` con un nuevo campo `legacy_amount_uf: number` (suma de `contract_budgets.amount_uf` del contrato para el año/filtros activos), siguiendo la misma lógica del dashboard (`Math.max(fromLines, b.amount_uf || 0)`).
- En `exportCapexToExcel`, al emitir la fila de contrato:
  - Si hay `rootRowIdxs` (líneas detalladas): usar `SUM(...)` como hoy, pero envolverlo en `MAX(SUM(...), legacy)` para no perder el monto legado cuando sea mayor.
  - Si no hay líneas detalladas: escribir directamente `c.legacy_amount_uf` como valor numérico editable (sin fórmula).
- Siempre escribir la fórmula de `Monto (CLP) = Monto UF * $B$1`, `UF/m²` y `m²` como hoy.

Resultado: los 23 contratos con CAPEX aparecerán todos, con su monto (de líneas o legado), no solo los 9 con desglose.

### 2. Autofiltro y prefiltrado de Nivel
- Aplicar `ws["!autofilter"] = { ref: <rango desde fila de headers hasta última fila/columna> }` donde la fila 2 (índice 1) son los headers.
- Para que abra ya filtrado solo a `Nivel = 0` (filas de contrato — actualmente la cabecera de contrato usa `Nivel = 0`, las líneas internas `depth + 1`):
  - Agregar al autofilter una definición de filtro en la columna E (índice 4 = "Nivel") con valor `["0"]` usando la estructura `!autofilter` extendida y `<filterColumn>` (xlsx soporta esto vía `filters` en el objeto autofilter; si la librería instalada no lo materializa al guardar, se aplicará vía manipulación directa del XML del worksheet escribiendo `<autoFilter>` con `<filterColumn colId="4"><filters><filter val="0"/></filters></filterColumn>` antes de `writeFile`).
- Las filas internas (`depth+1`, `depth+2`, ...) quedarán ocultas inicialmente pero presentes; el usuario puede quitar el filtro para verlas.

### 3. Cambios en `src/pages/CapexDashboard.tsx`
- En `handleExportExcel`, al armar los `CapexExportContract`, agregar `legacy_amount_uf` calculado a partir de los `contract_budgets` ya cargados (mismo `Math.max(fromLines, b.amount_uf || 0)` que ya se usa para el total mostrado en pantalla).
- No se cambian filtros UI ni otra lógica de negocio.

## Verificación
- Descargar el Excel con el filtro de año 2026 activo → confirmar que aparezcan los 23 contratos (no solo 9), con monto correcto en los que solo tienen `amount_uf` legado.
- Abrir el Excel → la columna "Nivel" debe tener flecha de filtro activa y mostrar solo filas con `Nivel = 0`; al quitar el filtro deben aparecer todos los niveles.
- Editar una cantidad o precio unitario en una línea hoja → el subtotal del contrato y el total general se recalculan.
