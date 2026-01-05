-- Add category_id to budget_template_lines for parent lines
ALTER TABLE public.budget_template_lines 
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.supplier_categories(id);

-- Add category_id to budget_lines for parent lines
ALTER TABLE public.budget_lines 
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.supplier_categories(id);