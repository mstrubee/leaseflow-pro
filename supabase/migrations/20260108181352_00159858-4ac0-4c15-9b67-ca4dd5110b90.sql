-- Add special_attention field to contracts table
ALTER TABLE public.contracts 
ADD COLUMN IF NOT EXISTS requires_special_attention boolean DEFAULT false;