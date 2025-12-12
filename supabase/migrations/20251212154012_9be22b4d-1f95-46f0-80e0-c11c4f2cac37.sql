-- Add gastos comunes and fondo de promocion columns to contract_versions
ALTER TABLE public.contract_versions 
ADD COLUMN IF NOT EXISTS gastos_comunes_uf_m2 numeric DEFAULT NULL;

ALTER TABLE public.contract_versions 
ADD COLUMN IF NOT EXISTS fondo_promocion_percentage numeric DEFAULT NULL;