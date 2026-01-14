-- Add field to track if regime_rent is stored as UF/m² value
ALTER TABLE public.contract_versions 
ADD COLUMN IF NOT EXISTS regime_rent_is_uf_m2 BOOLEAN DEFAULT false;

-- Add field to track if initial_rent is stored as UF/m² value
ALTER TABLE public.contract_versions 
ADD COLUMN IF NOT EXISTS initial_rent_is_uf_m2 BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.contract_versions.regime_rent_is_uf_m2 IS 'If true, regime_rent is stored as UF/m² and should be multiplied by superficie_edificada_local';
COMMENT ON COLUMN public.contract_versions.initial_rent_is_uf_m2 IS 'If true, initial_rent is stored as UF/m² and should be multiplied by superficie_edificada_local';