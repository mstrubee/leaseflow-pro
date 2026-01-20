-- Add automatic renewal fields to contract_versions
ALTER TABLE public.contract_versions 
ADD COLUMN IF NOT EXISTS auto_renewal BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_renewal_type TEXT CHECK (auto_renewal_type IN ('unilateral_gp', 'bilateral')),
ADD COLUMN IF NOT EXISTS auto_renewal_months INTEGER;