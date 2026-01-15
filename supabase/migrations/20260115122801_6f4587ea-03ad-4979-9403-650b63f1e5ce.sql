-- Add clasificacion and origen columns for contracts in negotiation
ALTER TABLE public.contracts
ADD COLUMN clasificacion text NULL,
ADD COLUMN origen text NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.contracts.clasificacion IS 'Classification: nuevo or reemplazo';
COMMENT ON COLUMN public.contracts.origen IS 'Origin: georesearch, broker, or propio';