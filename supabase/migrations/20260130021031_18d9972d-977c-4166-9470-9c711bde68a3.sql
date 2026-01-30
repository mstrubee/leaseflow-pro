-- Add fixed administration amount field for gastos comunes (UF methodology)
ALTER TABLE public.contract_versions
ADD COLUMN gastos_comunes_fixed_admin_uf NUMERIC NULL;

COMMENT ON COLUMN public.contract_versions.gastos_comunes_fixed_admin_uf IS 'Fixed administration amount in UF for gastos comunes when using UF/m2 methodology';