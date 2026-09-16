-- Permite forzar manualmente el año de CAPEX de un contrato en /capex,
-- independiente de las fechas reales de inversión (derivadas del Gantt) o
-- del badge de Comité GP -- útil cuando el presupuesto de un contrato fue
-- aprobado para un año N aunque el gasto real vaya a caer en otro año.
-- NULL = sin override, se sigue usando el año derivado automáticamente
-- (comportamiento de hoy). Reversible: basta con volver a poner NULL.
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS capex_year_override INTEGER NULL;

COMMENT ON COLUMN public.contracts.capex_year_override IS
  'Año de CAPEX forzado manualmente para este contrato en /capex (anula el año derivado de fechas/Comité GP). NULL = automático.';
