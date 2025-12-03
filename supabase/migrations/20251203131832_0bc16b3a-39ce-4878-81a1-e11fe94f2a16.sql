-- Add soft delete column to contracts
ALTER TABLE public.contracts ADD COLUMN deleted_at timestamp with time zone DEFAULT NULL;

-- Create index for better performance on deleted queries
CREATE INDEX idx_contracts_deleted_at ON public.contracts(deleted_at);