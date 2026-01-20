-- Add opex_master_id to oc_requests table for centralized OPEX budget references
ALTER TABLE public.oc_requests 
ADD COLUMN IF NOT EXISTS opex_master_id UUID REFERENCES public.opex_master_budget(id);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_oc_requests_opex_master ON public.oc_requests(opex_master_id) WHERE opex_master_id IS NOT NULL;

-- Add opex_master_id to purchase_orders table as well for consistency
ALTER TABLE public.purchase_orders 
ADD COLUMN IF NOT EXISTS opex_master_id UUID REFERENCES public.opex_master_budget(id);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_opex_master ON public.purchase_orders(opex_master_id) WHERE opex_master_id IS NOT NULL;