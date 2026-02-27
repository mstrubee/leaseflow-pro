

## ✅ COMPLETADO: Correccion de calculos - usar montos CLP almacenados

Los totales de OC, facturas y notas de crédito ahora usan `amount_clp` almacenado en la base de datos (bloqueado al día de creación) en vez de reconvertir desde UF con la tasa del día.

- `loadBudgetTypeTotals` suma `amount_clp` directamente, con fallback para registros legacy
- Cards de resumen muestran CLP real + UF informativo
- Semáforo presupuestario opera en CLP
- Disponible CAPEX = presupuesto UF convertido a CLP del día - OC CLP histórico
