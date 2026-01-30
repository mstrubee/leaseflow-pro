-- Add fixed administration amount field for gastos comunes in renegotiation drafts
ALTER TABLE public.renegotiation_drafts
ADD COLUMN gastos_comunes_fixed_admin_uf NUMERIC NULL;

COMMENT ON COLUMN public.renegotiation_drafts.gastos_comunes_fixed_admin_uf IS 'Fixed administration amount in UF for gastos comunes when using UF/m2 methodology';