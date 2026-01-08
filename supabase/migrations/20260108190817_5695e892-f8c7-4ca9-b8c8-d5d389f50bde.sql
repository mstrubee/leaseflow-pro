-- Add special attention reason field to contracts
ALTER TABLE public.contracts 
ADD COLUMN IF NOT EXISTS special_attention_reason TEXT;