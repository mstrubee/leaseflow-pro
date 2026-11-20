-- Registra aumentos de presupuesto sobre un "Presupuesto Anual" ya cargado
-- (capex_approved_budgets), sin modificar el monto original -- así queda
-- historial de cada aumento en el diálogo "Presupuestos Anuales". En la
-- card principal de /capex el monto Aprobado se muestra ya sumado
-- (original + aumentos), sin desglosar el aumento.
CREATE TABLE public.capex_approved_budget_increases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_id UUID NOT NULL REFERENCES public.capex_approved_budgets(id) ON DELETE CASCADE,
  amount_clp NUMERIC NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.capex_approved_budget_increases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view capex_approved_budget_increases"
  ON public.capex_approved_budget_increases FOR SELECT USING (true);

CREATE POLICY "Admins can manage capex_approved_budget_increases"
  ON public.capex_approved_budget_increases FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
