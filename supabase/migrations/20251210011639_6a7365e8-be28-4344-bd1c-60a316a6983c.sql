-- Add currency tracking fields to purchase_orders
ALTER TABLE public.purchase_orders
ADD COLUMN IF NOT EXISTS input_currency TEXT DEFAULT 'UF',
ADD COLUMN IF NOT EXISTS amount_clp NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS uf_value_at_entry NUMERIC DEFAULT 0;

-- Add currency tracking fields to invoices
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS input_currency TEXT DEFAULT 'UF',
ADD COLUMN IF NOT EXISTS amount_clp NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS uf_value_at_entry NUMERIC DEFAULT 0;