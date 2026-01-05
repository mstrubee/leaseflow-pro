-- Add parent_id to supplier_categories for hierarchical structure
ALTER TABLE public.supplier_categories 
ADD COLUMN parent_id UUID REFERENCES public.supplier_categories(id) ON DELETE CASCADE;

-- Create index for faster queries
CREATE INDEX idx_supplier_categories_parent_id ON public.supplier_categories(parent_id);