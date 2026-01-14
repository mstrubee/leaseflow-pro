-- Add negotiation subcategory and estimated sales fields to contracts
ALTER TABLE public.contracts 
ADD COLUMN IF NOT EXISTS negotiation_subcategory text DEFAULT 'negociacion_contrato',
ADD COLUMN IF NOT EXISTS venta_estimada numeric DEFAULT NULL;

-- Add constraint to ensure valid subcategories
ALTER TABLE public.contracts 
ADD CONSTRAINT check_negotiation_subcategory 
CHECK (negotiation_subcategory IN ('negociacion_contrato', 'ubicacion_preliminar') OR negotiation_subcategory IS NULL);

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_contracts_negotiation_subcategory 
ON public.contracts(negotiation_subcategory) 
WHERE status = 'en_negociacion';