-- Create table to link purchase orders with multiple budget lines
CREATE TABLE public.purchase_order_budget_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  budget_line_id UUID NOT NULL REFERENCES public.budget_lines(id) ON DELETE CASCADE,
  amount_uf NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(purchase_order_id, budget_line_id)
);

-- Enable RLS
ALTER TABLE public.purchase_order_budget_lines ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
CREATE POLICY "Authenticated users can view purchase order budget lines"
ON public.purchase_order_budget_lines
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert purchase order budget lines"
ON public.purchase_order_budget_lines
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update purchase order budget lines"
ON public.purchase_order_budget_lines
FOR UPDATE
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete purchase order budget lines"
ON public.purchase_order_budget_lines
FOR DELETE
USING (auth.uid() IS NOT NULL);

-- Create index for faster lookups
CREATE INDEX idx_po_budget_lines_po_id ON public.purchase_order_budget_lines(purchase_order_id);
CREATE INDEX idx_po_budget_lines_line_id ON public.purchase_order_budget_lines(budget_line_id);

-- Add comment
COMMENT ON TABLE public.purchase_order_budget_lines IS 'Links purchase orders to multiple CAPEX budget lines with allocated amounts';