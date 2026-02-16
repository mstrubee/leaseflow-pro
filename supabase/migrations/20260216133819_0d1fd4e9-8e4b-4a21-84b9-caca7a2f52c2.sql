-- Add is_uf_m2 flag to rent_escalations table
ALTER TABLE public.rent_escalations 
ADD COLUMN is_uf_m2 boolean NOT NULL DEFAULT false;