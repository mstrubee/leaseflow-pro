-- Add internal transfer flag to suppliers
ALTER TABLE public.suppliers 
ADD COLUMN IF NOT EXISTS is_internal_transfer boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_suppliers_internal_transfer 
ON public.suppliers (is_internal_transfer) 
WHERE is_internal_transfer = true;

-- Seed "Grupo Planet" supplier as internal transfer (idempotent)
INSERT INTO public.suppliers (name, is_internal_transfer, is_generic)
SELECT 'Grupo Planet', true, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.suppliers WHERE lower(name) = 'grupo planet'
);

-- Mark existing "Grupo Planet" rows (if any) as internal transfer
UPDATE public.suppliers 
SET is_internal_transfer = true 
WHERE lower(name) = 'grupo planet' AND is_internal_transfer = false;