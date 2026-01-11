-- Add monthly columns to opex_master_budget (in CLP)
ALTER TABLE public.opex_master_budget
ADD COLUMN IF NOT EXISTS amount_clp numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS month_01_clp numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS month_02_clp numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS month_03_clp numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS month_04_clp numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS month_05_clp numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS month_06_clp numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS month_07_clp numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS month_08_clp numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS month_09_clp numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS month_10_clp numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS month_11_clp numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS month_12_clp numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS uf_value_at_entry numeric DEFAULT 0;