
-- Add supplier_category_id to opex_categories to link with suppliers
ALTER TABLE public.opex_categories 
ADD COLUMN IF NOT EXISTS supplier_category_id UUID REFERENCES public.supplier_categories(id);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_opex_categories_supplier_category_id 
ON public.opex_categories(supplier_category_id);

-- Update existing categories based on name matching
UPDATE public.opex_categories oc
SET supplier_category_id = (
  SELECT sc.id FROM public.supplier_categories sc 
  WHERE LOWER(sc.name) = LOWER(oc.name)
  LIMIT 1
)
WHERE oc.supplier_category_id IS NULL;

-- Update for Climatización
UPDATE public.opex_categories 
SET supplier_category_id = (SELECT id FROM public.supplier_categories WHERE LOWER(name) = 'climatización' LIMIT 1)
WHERE LOWER(name) = 'climatización' AND supplier_category_id IS NULL;

-- Update for Cubiertas  
UPDATE public.opex_categories 
SET supplier_category_id = (SELECT id FROM public.supplier_categories WHERE LOWER(name) = 'cubiertas' LIMIT 1)
WHERE LOWER(name) = 'cubiertas' AND supplier_category_id IS NULL;

-- Update for Eléctrico
UPDATE public.opex_categories 
SET supplier_category_id = (SELECT id FROM public.supplier_categories WHERE LOWER(name) = 'electricidad' OR LOWER(name) = 'eléctrico' LIMIT 1)
WHERE LOWER(name) = 'eléctrico' AND supplier_category_id IS NULL;

-- Update for Sanitario
UPDATE public.opex_categories 
SET supplier_category_id = (SELECT id FROM public.supplier_categories WHERE LOWER(name) = 'sanitarios' LIMIT 1)
WHERE LOWER(name) = 'sanitario' AND supplier_category_id IS NULL;

-- Update for Seguridad
UPDATE public.opex_categories 
SET supplier_category_id = (SELECT id FROM public.supplier_categories WHERE LOWER(name) = 'seguridad' LIMIT 1)
WHERE LOWER(name) = 'seguridad' AND supplier_category_id IS NULL;
