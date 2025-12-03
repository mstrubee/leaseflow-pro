-- Add variable rent percentage column to contract_versions
ALTER TABLE public.contract_versions
ADD COLUMN variable_rent_percentage numeric DEFAULT NULL;