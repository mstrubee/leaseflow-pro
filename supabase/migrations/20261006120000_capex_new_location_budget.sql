-- Override manual del bloque "Presupuesto Operativo de Nuevos Locales"
-- (CapexBudgetPlanningDialog > CapexNewLocationOpexSection): para un
-- contrato "Nuevo" cuya versión actual no tiene cargado el dato necesario
-- para calcular automáticamente una categoría (Arriendo/GGCC/Fondo
-- Promoción/Otros) con computeArriendoPeriods, se permite tipear un monto
-- mensual plano en CLP (uno por contrato+año+categoría, aplicado por igual
-- a los 12 meses de ese año). Solo se persisten los overrides manuales -- lo
-- automático se recalcula en vivo cada vez a partir de los datos del
-- contrato, para no quedar desactualizado.
CREATE TABLE public.capex_new_location_budget (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  year INT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('arriendo', 'ggcc', 'fondo_promocion', 'otros')),
  monthly_amount_clp NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(contract_id, year, category)
);

ALTER TABLE public.capex_new_location_budget ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view capex_new_location_budget"
  ON public.capex_new_location_budget FOR SELECT USING (true);

CREATE POLICY "Admins can manage capex_new_location_budget"
  ON public.capex_new_location_budget FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
