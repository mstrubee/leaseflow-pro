-- Migration: timeline origin tracking + capex sync
-- source: tracks whether a timeline was created from scratch, a template, or CAPEX
-- budget_line_id: links gantt_tasks back to budget_lines for CAPEX-sourced timelines

ALTER TABLE public.gantt_timelines
  ADD COLUMN IF NOT EXISTS source VARCHAR(10) NOT NULL DEFAULT 'empty'
  CHECK (source IN ('empty', 'template', 'capex'));

-- Retroactively mark timelines that have a template_id
UPDATE public.gantt_timelines
SET source = 'template'
WHERE template_id IS NOT NULL AND source = 'empty';

ALTER TABLE public.gantt_tasks
  ADD COLUMN IF NOT EXISTS budget_line_id UUID REFERENCES public.budget_lines(id) ON DELETE SET NULL;
