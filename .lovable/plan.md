## Lineas Calculadas por Porcentaje en Plantillas de Presupuesto — IMPLEMENTADO ✅

Funcionalidad implementada que permite crear líneas de tipo "porcentaje" en plantillas CAPEX/OPEX.
Estas líneas calculan su valor como un porcentaje del subtotal de otra línea madre configurable.

### Columnas añadidas
- `calc_type`, `calc_source_line_id`, `calc_percentage` en `budget_template_lines` y `budget_lines`

### Archivos modificados
- `BudgetTemplateLineTree.tsx` — UI para configurar líneas calculadas (toggle %, selector de fuente, input porcentaje)
- `BudgetTemplateManager.tsx` — Duplicación de plantilla propaga campos calc
- `BudgetTemplateSelector.tsx` — Aplicación y actualización de plantilla con cálculo de porcentajes
- `BudgetLineTree.tsx` — Visualización de líneas calculadas en presupuesto real con badge
