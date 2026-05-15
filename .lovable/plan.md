## Cambios a revertir

1. **`src/components/budget/BudgetDashboard.tsx`** — tarjeta "TOTAL GENERAL": volver a la versión anterior con la fila única **"Total Presupuesto"** que suma `capexAuthorized + opexTotals.ocClp` (CLP y UF). Eliminar la separación en dos filas (Presupuesto CAPEX / OCs OPEX) que introduje.

2. **`src/components/contracts/ContractsTable.tsx`** — columna **CAPEX**: volver a mostrar el **total = autorizado + no autorizado** en una sola cifra (CLP + UF + UF/m²), sin separar en línea amarilla ni tooltip. Es decir, restaurar el cálculo `totalUF = authorized + unauthorized`.

## Lo que se mantiene

- En `BudgetDashboard.tsx`, `loadBudgetTypeSummary` sigue usando el `amount_uf` guardado de las líneas hoja activas (filtrando `deleted_at`), igual que la columna del listado. Esto sí soluciona el descuadre real: ambas vistas leerán los mismos números base.

¿Procedo?