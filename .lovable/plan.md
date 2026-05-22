## Problema

Al eliminar el filtro `total > 0` en `contractGroups`, todos los contratos sin Autoplanet/Agroplanet aparecen en el grupo "Otra", incluso los que no tienen CAPEX real (monto cero y sin líneas detalladas).

## Cambio

En `src/pages/CapexDashboard.tsx`, dentro del memo `companyGroups`, al asignar `companyKey === "Otra"`, incluir el contrato solo si tiene CAPEX efectivo > 0.

Criterio "tiene CAPEX":
- Sumar por cada budget del contrato `getEffectiveBudgetBreakdown(b, authByBudget[b.budget_id]).authorized + .unauthorized`.
- Si el total > 0 → incluir en "Otra".
- Si el total = 0 → excluir.

Los contratos AP/AG mantienen el comportamiento actual (se muestran siempre, incluso sin líneas detalladas).
