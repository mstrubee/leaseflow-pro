-- Add supplier_name column to budget_template_lines
ALTER TABLE public.budget_template_lines
ADD COLUMN supplier_name TEXT;