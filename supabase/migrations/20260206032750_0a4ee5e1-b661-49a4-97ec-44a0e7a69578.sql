
ALTER TABLE public.maintenance_forms 
ADD COLUMN IF NOT EXISTS sub_status text NOT NULL DEFAULT 'solicitado';
