-- Add es_esquina column to contracts table
ALTER TABLE public.contracts 
ADD COLUMN es_esquina boolean DEFAULT false;