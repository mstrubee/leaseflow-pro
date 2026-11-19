-- Vincula un Ítem de Presupuesto informativo (Línea de tiempo general,
-- /reports) a un contrato real cuando se crea eligiéndolo del desplegable
-- (ver GanttOverviewTimeline.tsx) -- null para ítems antiguos de texto libre.
-- Permite excluir el ítem de los cálculos de CAPEX/Presupuesto Operativo
-- (Planificar Presupuesto) apenas el contrato vinculado ya tenga CAPEX real
-- cargado, evitando que se cuente dos veces (una como contrato real, otra
-- como ítem informativo).
ALTER TABLE public.gantt_overview_budget_items
  ADD COLUMN contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL;
