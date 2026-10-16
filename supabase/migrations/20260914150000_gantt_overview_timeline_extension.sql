-- Recuerda hasta qué fecha se extendió la "Línea de tiempo general" de
-- Cartas Gantt (/reports), para que la extensión persista entre sesiones en
-- vez de resetearse cada vez que alguien recarga la página. Fila única
-- (id=1), igual de abierta que gantt_overview_budget_items: cualquier
-- usuario autenticado puede leerla/actualizarla.
CREATE TABLE public.gantt_overview_timeline_settings (
  id INT PRIMARY KEY DEFAULT 1,
  extended_until DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  CONSTRAINT gantt_overview_timeline_settings_single_row CHECK (id = 1)
);

ALTER TABLE public.gantt_overview_timeline_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view gantt_overview_timeline_settings"
  ON public.gantt_overview_timeline_settings FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can manage gantt_overview_timeline_settings"
  ON public.gantt_overview_timeline_settings FOR ALL
  USING (auth.uid() IS NOT NULL);

INSERT INTO public.gantt_overview_timeline_settings (id, extended_until)
VALUES (1, NULL)
ON CONFLICT (id) DO NOTHING;
