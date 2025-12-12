-- Add guarantee and periodic adjustments columns to contract_versions
ALTER TABLE public.contract_versions 
ADD COLUMN IF NOT EXISTS guarantee_multiplier numeric DEFAULT NULL;

ALTER TABLE public.contract_versions 
ADD COLUMN IF NOT EXISTS has_periodic_adjustments boolean DEFAULT false;

ALTER TABLE public.contract_versions 
ADD COLUMN IF NOT EXISTS first_adjustment_month integer DEFAULT NULL;

ALTER TABLE public.contract_versions 
ADD COLUMN IF NOT EXISTS adjustment_periodicity_months integer DEFAULT NULL;