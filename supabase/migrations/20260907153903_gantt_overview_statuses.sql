-- Estados configurables para "Cartas Gantt - Vista General" (/reports),
-- administrables desde Admin > Estados y Categorías > Estados de Gantt
-- General. Reemplaza el enum fijo 'active'/'paused'/'completed' de
-- gantt_timelines.overview_status.
CREATE TABLE public.gantt_overview_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'gray',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- Único comportamiento especial: excluye la línea de la línea de tiempo
  -- general (sigue visible en el listado de tarjetas). Atado a un flag por
  -- estado, no al nombre, para que persista aunque el estado se renombre.
  excludes_from_timeline BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.gantt_overview_statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view gantt overview statuses"
  ON public.gantt_overview_statuses FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage gantt overview statuses"
  ON public.gantt_overview_statuses FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_gantt_overview_statuses_updated_at
  BEFORE UPDATE ON public.gantt_overview_statuses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.gantt_overview_statuses (name, color, display_order, excludes_from_timeline) VALUES
  ('Activo', 'blue', 1, false),
  ('En Pausa', 'yellow', 2, true),
  ('Terminado', 'green', 3, false);

ALTER TABLE public.gantt_timelines
  ADD COLUMN overview_status_id UUID REFERENCES public.gantt_overview_statuses(id);

UPDATE public.gantt_timelines t
SET overview_status_id = s.id
FROM public.gantt_overview_statuses s
WHERE (t.overview_status = 'active' AND s.name = 'Activo')
   OR (t.overview_status = 'paused' AND s.name = 'En Pausa')
   OR (t.overview_status = 'completed' AND s.name = 'Terminado')
   OR (t.overview_status IS NULL AND s.name = 'Activo');

ALTER TABLE public.gantt_timelines DROP COLUMN overview_status;
