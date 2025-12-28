-- Create table for budget carryover (arrastre de presupuesto)
-- This tracks pending OC balances carried over from previous years
CREATE TABLE public.budget_carryover (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  source_year INTEGER NOT NULL,
  target_year INTEGER NOT NULL,
  budget_type TEXT NOT NULL, -- 'inversion_inicial' or 'capex'
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  amount_uf NUMERIC NOT NULL DEFAULT 0, -- Pending balance (OC amount - invoiced amount)
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  notes TEXT,
  UNIQUE(purchase_order_id, target_year)
);

-- Enable RLS
ALTER TABLE public.budget_carryover ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users
CREATE POLICY "Authenticated users can manage budget carryover"
ON public.budget_carryover
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Create index for faster queries
CREATE INDEX idx_budget_carryover_contract_year ON public.budget_carryover(contract_id, target_year);
CREATE INDEX idx_budget_carryover_budget_type ON public.budget_carryover(budget_type);