-- Planificación de presupuesto OPEX del año siguiente (botón "Planificar
-- Presupuesto (año siguiente)" en /opex).
--
-- Decisión de diseño: el OPEX que el ADMIN agrega mirando la lista de
-- contratos vigentes es GLOBAL por categoría. El contrato queda solo como
-- referencia de origen (source_contract_id, informativo): el monto NO se
-- asigna ni se descuenta a ese contrato. Por eso esta tabla no reutiliza
-- opex_local_additional, que sí es por contrato.
CREATE TABLE public.opex_budget_plan_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  year INTEGER NOT NULL,
  category_id UUID NOT NULL REFERENCES public.opex_categories(id) ON DELETE RESTRICT,
  amount_clp NUMERIC NOT NULL CHECK (amount_clp > 0),
  source_contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_opex_budget_plan_items_year ON public.opex_budget_plan_items(year);

ALTER TABLE public.opex_budget_plan_items ENABLE ROW LEVEL SECURITY;

-- Solo ADMIN: son montos de planificación que aún no son presupuesto aprobado.
CREATE POLICY "Admins can view opex_budget_plan_items"
  ON public.opex_budget_plan_items FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert opex_budget_plan_items"
  ON public.opex_budget_plan_items FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update opex_budget_plan_items"
  ON public.opex_budget_plan_items FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete opex_budget_plan_items"
  ON public.opex_budget_plan_items FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));
