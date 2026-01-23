-- Table for multi-contract allocations on OC requests (for centralized OPEX)
CREATE TABLE IF NOT EXISTS public.oc_request_contract_allocations (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    oc_request_id UUID NOT NULL REFERENCES public.oc_requests(id) ON DELETE CASCADE,
    contract_id UUID NOT NULL REFERENCES public.contracts(id),
    amount_uf NUMERIC NOT NULL DEFAULT 0,
    amount_clp NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table for multi-contract allocations on purchase orders (for centralized OPEX)
CREATE TABLE IF NOT EXISTS public.purchase_order_contract_allocations (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    contract_id UUID NOT NULL REFERENCES public.contracts(id),
    amount_uf NUMERIC NOT NULL DEFAULT 0,
    amount_clp NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add flag to identify if request/order is multi-contract
ALTER TABLE public.oc_requests 
ADD COLUMN IF NOT EXISTS is_multi_contract BOOLEAN DEFAULT false;

ALTER TABLE public.purchase_orders 
ADD COLUMN IF NOT EXISTS is_multi_contract BOOLEAN DEFAULT false;

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_oc_request_allocations_request ON public.oc_request_contract_allocations(oc_request_id);
CREATE INDEX IF NOT EXISTS idx_oc_request_allocations_contract ON public.oc_request_contract_allocations(contract_id);
CREATE INDEX IF NOT EXISTS idx_po_allocations_order ON public.purchase_order_contract_allocations(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_po_allocations_contract ON public.purchase_order_contract_allocations(contract_id);

-- Enable RLS
ALTER TABLE public.oc_request_contract_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_contract_allocations ENABLE ROW LEVEL SECURITY;

-- Policies for oc_request_contract_allocations
CREATE POLICY "Authenticated users can view OC request allocations" 
ON public.oc_request_contract_allocations 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Authenticated users can insert OC request allocations" 
ON public.oc_request_contract_allocations 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Authenticated users can update OC request allocations" 
ON public.oc_request_contract_allocations 
FOR UPDATE 
TO authenticated 
USING (true);

CREATE POLICY "Authenticated users can delete OC request allocations" 
ON public.oc_request_contract_allocations 
FOR DELETE 
TO authenticated 
USING (true);

-- Policies for purchase_order_contract_allocations
CREATE POLICY "Authenticated users can view PO allocations" 
ON public.purchase_order_contract_allocations 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Authenticated users can insert PO allocations" 
ON public.purchase_order_contract_allocations 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Authenticated users can update PO allocations" 
ON public.purchase_order_contract_allocations 
FOR UPDATE 
TO authenticated 
USING (true);

CREATE POLICY "Authenticated users can delete PO allocations" 
ON public.purchase_order_contract_allocations 
FOR DELETE 
TO authenticated 
USING (true);