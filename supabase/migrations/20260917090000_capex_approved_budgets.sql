-- "Presupuestos Aprobados" en /capex: un presupuesto CAPEX aprobado por año
-- (en MM$ CLP, sin conversión a UF -- es un monto de referencia/aprobación,
-- no ligado a un contrato puntual), con uno o más archivos adjuntos
-- (Excel/PDF/Word/etc, guardados en el bucket "repository-files" ya usado
-- en el resto del proyecto). Editable después de creado.
CREATE TABLE public.capex_approved_budgets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  year INT NOT NULL UNIQUE,
  amount_clp NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.capex_approved_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view capex_approved_budgets"
  ON public.capex_approved_budgets FOR SELECT USING (true);

CREATE POLICY "Admins can manage capex_approved_budgets"
  ON public.capex_approved_budgets FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE TABLE public.capex_approved_budget_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_id UUID NOT NULL REFERENCES public.capex_approved_budgets(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  -- Path dentro del bucket de Storage "repository-files".
  file_path TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.capex_approved_budget_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view capex_approved_budget_files"
  ON public.capex_approved_budget_files FOR SELECT USING (true);

CREATE POLICY "Admins can manage capex_approved_budget_files"
  ON public.capex_approved_budget_files FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
