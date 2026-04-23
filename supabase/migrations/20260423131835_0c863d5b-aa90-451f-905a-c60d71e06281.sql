ALTER TABLE public.budget_lines
  ADD COLUMN IF NOT EXISTS is_surcharge boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS surcharge_parent_line_id uuid REFERENCES public.budget_lines(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS surcharge_reason text,
  ADD COLUMN IF NOT EXISTS merged_into_line_id uuid REFERENCES public.budget_lines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS original_amount_uf numeric;

CREATE INDEX IF NOT EXISTS idx_budget_lines_surcharge_parent
  ON public.budget_lines(surcharge_parent_line_id)
  WHERE surcharge_parent_line_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_budget_lines_merged_into
  ON public.budget_lines(merged_into_line_id)
  WHERE merged_into_line_id IS NOT NULL;