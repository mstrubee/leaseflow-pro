-- Add unique constraint for ON CONFLICT upsert to work
ALTER TABLE public.purchase_order_contract_allocations
ADD CONSTRAINT purchase_order_contract_allocations_po_contract_unique 
UNIQUE (purchase_order_id, contract_id);