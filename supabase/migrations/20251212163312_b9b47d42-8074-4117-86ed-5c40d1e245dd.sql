-- Add proyecto_status column to contracts table
ALTER TABLE public.contracts 
ADD COLUMN proyecto_status text DEFAULT 'sin_proyecto'::text;