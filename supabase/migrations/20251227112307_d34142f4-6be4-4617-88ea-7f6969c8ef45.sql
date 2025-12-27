-- Add issuer_name column to termination_notices
ALTER TABLE public.termination_notices 
ADD COLUMN issuer_name text;