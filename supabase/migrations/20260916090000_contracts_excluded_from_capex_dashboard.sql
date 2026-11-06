-- Agrega columna para excluir contratos puntuales del listado principal de
-- /capex (Presupuesto CAPEX) sin borrarlos ni afectar contract_budgets.
-- Default false: por defecto ningún contrato se excluye.
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS excluded_from_capex_dashboard BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.contracts.excluded_from_capex_dashboard IS
  'Si es true, el contrato se muestra en una sección aparte de "Contratos excluidos" en /capex y no cuenta en los totales/PPT/Excel de ese dashboard.';
