-- Estado del cronograma principal para la vista "Cartas Gantt - Vista General"
-- (/reports). No afecta al contrato en sí ni a otras vistas del Gantt —
-- solo controla si el proyecto se muestra "Activo", "En pausa" (se excluye
-- de la línea de tiempo general, pero sigue en el listado) o "Terminado".
ALTER TABLE public.gantt_timelines
  ADD COLUMN IF NOT EXISTS overview_status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE public.gantt_timelines
  ADD CONSTRAINT gantt_timelines_overview_status_check
  CHECK (overview_status IN ('active', 'paused', 'completed'));
