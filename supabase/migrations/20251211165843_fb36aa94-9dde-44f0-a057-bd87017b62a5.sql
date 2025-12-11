-- Add metros_lineales_frente to contracts table
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS metros_lineales_frente numeric DEFAULT 0;

-- Add quantity and unit fields to budget_template_lines for calculations
ALTER TABLE public.budget_template_lines ADD COLUMN IF NOT EXISTS quantity numeric DEFAULT 0;
ALTER TABLE public.budget_template_lines ADD COLUMN IF NOT EXISTS unit_type text DEFAULT 'm2';
ALTER TABLE public.budget_template_lines ADD COLUMN IF NOT EXISTS currency text DEFAULT 'UF';