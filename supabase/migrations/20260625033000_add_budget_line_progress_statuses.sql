-- Migration: add budget_line_progress_statuses table and FK column on budget_lines
-- This table was missing from the migration DB causing loadBudgetTotals to fail silently
-- (the SELECT query referenced progress_status_id which didn't exist)

CREATE TABLE IF NOT EXISTS public.budget_line_progress_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'gray',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_selectable BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.budget_line_progress_statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "budget_line_progress_statuses_select"
  ON public.budget_line_progress_statuses FOR SELECT TO authenticated USING (true);
CREATE POLICY "budget_line_progress_statuses_insert"
  ON public.budget_line_progress_statuses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "budget_line_progress_statuses_update"
  ON public.budget_line_progress_statuses FOR UPDATE TO authenticated USING (true);
CREATE POLICY "budget_line_progress_statuses_delete"
  ON public.budget_line_progress_statuses FOR DELETE TO authenticated USING (true);

ALTER TABLE public.budget_lines
  ADD COLUMN IF NOT EXISTS progress_status_id UUID
  REFERENCES public.budget_line_progress_statuses(id) ON DELETE SET NULL;
