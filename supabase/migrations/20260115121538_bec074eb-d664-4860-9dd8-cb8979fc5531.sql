-- Add venta_estimada_max column for sales range
ALTER TABLE public.contracts
ADD COLUMN venta_estimada_max numeric NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.contracts.venta_estimada IS 'Minimum estimated sales value in CLP';
COMMENT ON COLUMN public.contracts.venta_estimada_max IS 'Maximum estimated sales value in CLP';