ALTER TABLE public.gantt_tasks
  ADD COLUMN IF NOT EXISTS origin text
  CHECK (origin IN ('nuevo', 'traslado'));

ALTER TABLE public.gantt_template_tasks
  ADD COLUMN IF NOT EXISTS default_origin text
  CHECK (default_origin IN ('nuevo', 'traslado'));