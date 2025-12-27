-- Add column to store the extended gastos comunes preference
ALTER TABLE public.contract_versions 
ADD COLUMN IF NOT EXISTS has_extended_gastos_comunes boolean DEFAULT false;