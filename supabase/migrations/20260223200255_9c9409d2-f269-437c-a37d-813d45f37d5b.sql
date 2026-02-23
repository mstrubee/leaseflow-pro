
-- Add calculated line support to budget_template_lines
ALTER TABLE public.budget_template_lines
  ADD COLUMN calc_type text DEFAULT NULL,
  ADD COLUMN calc_source_line_id uuid DEFAULT NULL REFERENCES public.budget_template_lines(id) ON DELETE SET NULL,
  ADD COLUMN calc_percentage numeric DEFAULT NULL;

-- Add calculated line support to budget_lines
ALTER TABLE public.budget_lines
  ADD COLUMN calc_type text DEFAULT NULL,
  ADD COLUMN calc_source_line_id uuid DEFAULT NULL REFERENCES public.budget_lines(id) ON DELETE SET NULL,
  ADD COLUMN calc_percentage numeric DEFAULT NULL;
