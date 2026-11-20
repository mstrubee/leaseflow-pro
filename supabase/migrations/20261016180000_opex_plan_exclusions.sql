-- Exclusión (tarjado) de líneas en la planificación OPEX del año siguiente.
-- Excluir NO borra la línea: la saca de los cálculos y la mueve a "Excluidas",
-- desde donde el ADMIN puede reincorporarla.
--
-- 1) OC OPEX del año base: tabla de exclusiones por año de planificación
--    (así cada año planificado decide por separado qué OC considera).
CREATE TABLE public.opex_budget_plan_exclusions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  year INTEGER NOT NULL,
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (year, purchase_order_id)
);

ALTER TABLE public.opex_budget_plan_exclusions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view opex_budget_plan_exclusions"
  ON public.opex_budget_plan_exclusions FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert opex_budget_plan_exclusions"
  ON public.opex_budget_plan_exclusions FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete opex_budget_plan_exclusions"
  ON public.opex_budget_plan_exclusions FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- 2) OPEX agregado por el ADMIN: se marca como excluido en la misma fila.
--    Las políticas RLS de opex_budget_plan_items (solo ADMIN) ya cubren el UPDATE.
ALTER TABLE public.opex_budget_plan_items
  ADD COLUMN excluded_at TIMESTAMPTZ;
