-- Increase precision for rent values to support UF/m² (3 decimals)
-- Previously these columns were numeric(15,2) which rounds 0.385 -> 0.39.

ALTER TABLE public.contract_versions
  ALTER COLUMN regime_rent TYPE numeric(15,3)
  USING regime_rent::numeric(15,3);

ALTER TABLE public.contract_versions
  ALTER COLUMN initial_rent TYPE numeric(15,3)
  USING initial_rent::numeric(15,3);

COMMENT ON COLUMN public.contract_versions.regime_rent IS 'Rent amount (UF/CLP) or UF per m2 when regime_rent_is_uf_m2=true. Stored with 3 decimals to support UF/m².';
COMMENT ON COLUMN public.contract_versions.initial_rent IS 'Initial rent amount (UF/CLP) or UF per m2 when initial_rent_is_uf_m2=true. Stored with 3 decimals to support UF/m².';