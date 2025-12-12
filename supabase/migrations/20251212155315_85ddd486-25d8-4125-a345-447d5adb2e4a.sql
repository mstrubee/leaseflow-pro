-- Add new surface columns for mezanina/altillo and segundo nivel
ALTER TABLE public.contracts 
ADD COLUMN IF NOT EXISTS superficie_mezanina_altillo numeric DEFAULT 0;

ALTER TABLE public.contracts 
ADD COLUMN IF NOT EXISTS superficie_segundo_nivel numeric DEFAULT 0;