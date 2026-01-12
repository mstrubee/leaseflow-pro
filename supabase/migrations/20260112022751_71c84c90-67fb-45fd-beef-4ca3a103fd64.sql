-- Create many-to-many relationship between suppliers and opex_categories
CREATE TABLE public.supplier_opex_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  opex_category_id UUID NOT NULL REFERENCES public.opex_categories(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(supplier_id, opex_category_id)
);

-- Enable RLS
ALTER TABLE public.supplier_opex_categories ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow read supplier_opex_categories" 
ON public.supplier_opex_categories 
FOR SELECT USING (true);

CREATE POLICY "Allow insert supplier_opex_categories" 
ON public.supplier_opex_categories 
FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update supplier_opex_categories" 
ON public.supplier_opex_categories 
FOR UPDATE USING (true);

CREATE POLICY "Allow delete supplier_opex_categories" 
ON public.supplier_opex_categories 
FOR DELETE USING (true);

-- Add index for performance
CREATE INDEX idx_supplier_opex_categories_supplier ON public.supplier_opex_categories(supplier_id);
CREATE INDEX idx_supplier_opex_categories_opex ON public.supplier_opex_categories(opex_category_id);