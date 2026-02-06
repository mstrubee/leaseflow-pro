
-- Drop old single-value column and replace with array
ALTER TABLE public.purchase_orders DROP COLUMN IF EXISTS maintenance_form_id;
ALTER TABLE public.purchase_orders ADD COLUMN maintenance_form_ids uuid[] DEFAULT '{}';
