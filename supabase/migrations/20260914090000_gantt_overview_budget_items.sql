-- Ítems manuales ("Presupuesto") que se agregan a mano sobre la Línea de
-- tiempo general de Cartas Gantt (/reports), independientes de cualquier
-- contrato -- solo un nombre + una fecha, mostrados en rojo. Cualquier
-- usuario autenticado puede crear/editar/eliminar (no es una tabla de
-- configuración de Admin, es contenido operativo de la vista de Reportes).
CREATE TABLE public.gantt_overview_budget_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  date DATE NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.gantt_overview_budget_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view gantt_overview_budget_items"
  ON public.gantt_overview_budget_items FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can manage gantt_overview_budget_items"
  ON public.gantt_overview_budget_items FOR ALL
  USING (auth.uid() IS NOT NULL);
