-- Permite, por año de "Presupuestos Aprobados", sumar al Disponible el
-- CAPEX de los contratos con Estado de Avance "Caído" -- reversible
-- (toggle en la card principal de /capex), con memoria en DB.
ALTER TABLE public.capex_approved_budgets
  ADD COLUMN IF NOT EXISTS include_caidos_in_disponible BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.capex_approved_budgets.include_caidos_in_disponible IS
  'Si es true, el Disponible de ese año suma de vuelta el CAPEX de los contratos "Caído" (se descuentan del Total Capex al calcular Disponible).';
