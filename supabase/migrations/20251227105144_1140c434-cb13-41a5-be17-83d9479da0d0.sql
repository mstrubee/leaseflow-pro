-- Add display_currency column to contracts table to persist the currency preference
ALTER TABLE public.contracts 
ADD COLUMN display_currency text DEFAULT 'UF';