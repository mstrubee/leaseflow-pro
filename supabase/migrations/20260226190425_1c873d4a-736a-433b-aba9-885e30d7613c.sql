ALTER TABLE public.renegotiation_drafts
  ADD COLUMN auto_renewal boolean DEFAULT false,
  ADD COLUMN auto_renewal_type text DEFAULT NULL,
  ADD COLUMN auto_renewal_months integer DEFAULT NULL;