ALTER TABLE public.budget_lines
  ADD COLUMN IF NOT EXISTS is_ghost boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS moved_to_line_id uuid REFERENCES public.budget_lines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS moved_at timestamptz,
  ADD COLUMN IF NOT EXISTS moved_by uuid;

CREATE INDEX IF NOT EXISTS idx_budget_lines_moved_to_line_id ON public.budget_lines(moved_to_line_id);
CREATE INDEX IF NOT EXISTS idx_budget_lines_is_ghost ON public.budget_lines(is_ghost) WHERE is_ghost = true;