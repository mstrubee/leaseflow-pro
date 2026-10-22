-- Persiste los contratos "En Negociación" agregados a mano a "Cartas Gantt
-- - Vista General" (/reports) vía el botón "Contratos No Firmados" --
-- antes esa selección solo vivía en memoria del navegador (extraData/
-- addedNegotiationIds en GanttReportsSection.tsx), así que se perdía en
-- cada recarga y había que volver a agregar el contrato cada vez (ej.
-- Curauma, un proyecto nuevo sin Comité GP "aceptado" todavía).
CREATE TABLE public.gantt_overview_extra_contracts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  added_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(contract_id)
);

ALTER TABLE public.gantt_overview_extra_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view gantt_overview_extra_contracts"
  ON public.gantt_overview_extra_contracts FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can manage gantt_overview_extra_contracts"
  ON public.gantt_overview_extra_contracts FOR ALL
  USING (auth.uid() IS NOT NULL);
