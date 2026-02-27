
## Causa raiz: OCs sin clasificacion caen fuera de CAPEX y OPEX

### Problema encontrado

Despues de auditar la base de datos, descubri que el problema NO es un error de formato UF/CLP. El problema real es que **OCs sin clasificacion son invisibles** en las cards de resumen.

La base de datos muestra este quiebre de OCs para 2026:

```text
Clasificacion                               | Cant | Total CLP
--------------------------------------------|------|------------
CAPEX (con budget_line_id)                   |    3 | $20.824.346
OPEX (con opex_category + opex_master)       |   26 | $20.990.577
OPEX (con opex_category, sin opex_master)    |   27 | $20.083.538
OPEX (solo budget_classification="OPEX")     |    4 | $14.101.008
NULL (con opex_category + opex_master)       |   14 |  $1.572.812
NULL (sin nada)                              |    1 | $22.700.000  <-- INVISIBLE
```

La ultima fila es el problema: **1 OC por $22.700.000 que no tiene budget_classification, ni budget_line_id, ni opex_category_id, ni opex_master_id**. Esta OC no pasa el filtro CAPEX ni el OPEX, por lo tanto desaparece completamente de las cards.

### Filtro actual en `loadBudgetTypeTotals`

**CAPEX:** `budget_classification === "CAPEX" OR (budget_line_id AND NOT opex)`
**OPEX:** `opex_master_id OR opex_category_id OR budget_classification === "OPEX"`

Una OC sin ningun marcador NO es capturada por ninguno.

### Solucion

**1. Corregir filtro CAPEX en `BudgetDashboard.tsx` (`loadBudgetTypeTotals`)**

Agregar una clausula para que OCs sin ningun marcador OPEX se clasifiquen como CAPEX por defecto:

```text
CAPEX filter:
  budget_classification === "CAPEX"
  OR (budget_line_id AND NOT opex markers)
  OR (NO budget_classification AND NO budget_line_id AND NO opex markers)
     ^--- NUEVA CLAUSULA: sin clasificacion = CAPEX por defecto
```

**2. Agregar logging de diagnostico temporal**

Agregar un `console.warn` cuando se detecte una OC sin clasificacion, para ayudar a detectar futuros problemas de datos.

**3. Validar en `PurchaseOrdersModule.tsx` - `getBudgetTypeForOrder`**

Verificar que la funcion que determina el badge "CAPEX"/"OPEX" en la tabla de OCs tenga la misma logica de fallback, para que sea consistente con las cards.

---

### Archivo afectado

| Archivo | Cambio |
|---------|--------|
| `src/components/budget/BudgetDashboard.tsx` | Agregar clausula de fallback en filtro CAPEX de `loadBudgetTypeTotals` |

### Impacto

Con este cambio, la OC de "Orientales" por $22.700.000 aparecera correctamente en la card CAPEX, y el Total General reflejara el monto completo.
