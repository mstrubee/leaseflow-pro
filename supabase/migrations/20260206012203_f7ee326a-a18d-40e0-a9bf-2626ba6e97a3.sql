
-- Add maintenance_form_id to purchase_orders
ALTER TABLE public.purchase_orders 
ADD COLUMN maintenance_form_id uuid REFERENCES public.maintenance_forms(id);

-- Index for lookups
CREATE INDEX idx_purchase_orders_maintenance_form_id ON public.purchase_orders(maintenance_form_id);
