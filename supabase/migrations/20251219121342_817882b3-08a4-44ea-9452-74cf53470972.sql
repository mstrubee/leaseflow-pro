-- Add grace_months to contract_versions
ALTER TABLE public.contract_versions
ADD COLUMN grace_months integer DEFAULT 0;

-- Add comment
COMMENT ON COLUMN public.contract_versions.grace_months IS 'Number of grace months (no rent) at the start of the contract';