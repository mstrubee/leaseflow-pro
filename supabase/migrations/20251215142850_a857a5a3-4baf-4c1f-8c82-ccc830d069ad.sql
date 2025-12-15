-- Add columns for periodic adjustment type and value
ALTER TABLE public.contract_versions 
ADD COLUMN IF NOT EXISTS adjustment_type text DEFAULT 'percentage',
ADD COLUMN IF NOT EXISTS adjustment_value numeric DEFAULT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.contract_versions.adjustment_type IS 'Type of periodic adjustment: percentage or fixed';
COMMENT ON COLUMN public.contract_versions.adjustment_value IS 'Value of the adjustment (percentage or fixed UF amount)';