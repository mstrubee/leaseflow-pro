-- Add column for gastos comunes cap type (fixed amount or UF/m2)
ALTER TABLE public.contract_versions
ADD COLUMN IF NOT EXISTS gastos_comunes_tope_type text DEFAULT 'fixed';