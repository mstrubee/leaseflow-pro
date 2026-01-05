-- Add supplier_name column to budget_lines table
ALTER TABLE public.budget_lines 
ADD COLUMN supplier_name TEXT;