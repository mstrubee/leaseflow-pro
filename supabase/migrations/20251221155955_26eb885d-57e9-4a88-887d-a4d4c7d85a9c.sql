-- Add quantity, unit_type, currency, and unit_price fields to budget_lines
-- These fields mirror the template fields and allow calculating amount_uf = quantity * unit_price
ALTER TABLE public.budget_lines
ADD COLUMN IF NOT EXISTS quantity numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS unit_type text DEFAULT 'm2',
ADD COLUMN IF NOT EXISTS currency text DEFAULT 'UF',
ADD COLUMN IF NOT EXISTS unit_price numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS template_line_id uuid REFERENCES public.budget_template_lines(id) ON DELETE SET NULL;

-- Add comment explaining the relationship
COMMENT ON COLUMN public.budget_lines.template_line_id IS 'Reference to the original template line this was created from, used for template updates';
COMMENT ON COLUMN public.budget_lines.quantity IS 'Quantity for calculation (e.g., number of m2)';
COMMENT ON COLUMN public.budget_lines.unit_type IS 'Unit type: m2, mL, or Un';
COMMENT ON COLUMN public.budget_lines.currency IS 'Currency: UF or CLP';
COMMENT ON COLUMN public.budget_lines.unit_price IS 'Price per unit in the selected currency';