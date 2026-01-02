-- Add "Otros Egresos de Arrendamiento" fields to contract_versions
ALTER TABLE public.contract_versions 
ADD COLUMN otros_egresos_amount numeric NULL DEFAULT NULL,
ADD COLUMN otros_egresos_description text NULL DEFAULT NULL;