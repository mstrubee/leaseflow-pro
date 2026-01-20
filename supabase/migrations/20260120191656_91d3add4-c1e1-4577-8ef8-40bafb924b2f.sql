-- Junction table for multiple budget lines per OC or OC Request
CREATE TABLE public.oc_budget_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  oc_request_id UUID REFERENCES public.oc_requests(id) ON DELETE CASCADE,
  budget_line_id UUID NOT NULL REFERENCES public.budget_lines(id) ON DELETE CASCADE,
  amount_uf NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- At least one of purchase_order_id or oc_request_id must be set
  CONSTRAINT oc_budget_lines_reference_check CHECK (
    (purchase_order_id IS NOT NULL AND oc_request_id IS NULL) OR 
    (purchase_order_id IS NULL AND oc_request_id IS NOT NULL)
  )
);

-- Enable RLS
ALTER TABLE public.oc_budget_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view oc_budget_lines" ON public.oc_budget_lines FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage oc_budget_lines" ON public.oc_budget_lines FOR ALL USING (auth.uid() IS NOT NULL);

CREATE INDEX idx_oc_budget_lines_po ON public.oc_budget_lines(purchase_order_id);
CREATE INDEX idx_oc_budget_lines_request ON public.oc_budget_lines(oc_request_id);
CREATE INDEX idx_oc_budget_lines_line ON public.oc_budget_lines(budget_line_id);

-- Payment plans table
CREATE TABLE public.oc_payment_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  oc_request_id UUID REFERENCES public.oc_requests(id) ON DELETE CASCADE,
  payment_number INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  amount_uf NUMERIC NOT NULL DEFAULT 0,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
  paid_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  CONSTRAINT oc_payment_plans_reference_check CHECK (
    (purchase_order_id IS NOT NULL AND oc_request_id IS NULL) OR 
    (purchase_order_id IS NULL AND oc_request_id IS NOT NULL)
  )
);

ALTER TABLE public.oc_payment_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view payment plans" ON public.oc_payment_plans FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage payment plans" ON public.oc_payment_plans FOR ALL USING (auth.uid() IS NOT NULL);

CREATE TRIGGER update_oc_payment_plans_updated_at
BEFORE UPDATE ON public.oc_payment_plans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_oc_payment_plans_po ON public.oc_payment_plans(purchase_order_id);
CREATE INDEX idx_oc_payment_plans_request ON public.oc_payment_plans(oc_request_id);

-- Quotations table with file storage
CREATE TABLE public.oc_quotations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_line_id UUID NOT NULL REFERENCES public.budget_lines(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  quotation_number TEXT NOT NULL,
  correlative INTEGER NOT NULL DEFAULT 1,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT,
  line_name TEXT NOT NULL,
  project_name TEXT NOT NULL,
  description TEXT,
  amount_uf NUMERIC DEFAULT 0,
  amount_clp NUMERIC DEFAULT 0,
  file_path TEXT,
  file_name TEXT,
  quotation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_selected BOOLEAN DEFAULT false,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.oc_quotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view quotations" ON public.oc_quotations FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage quotations" ON public.oc_quotations FOR ALL USING (auth.uid() IS NOT NULL);

CREATE TRIGGER update_oc_quotations_updated_at
BEFORE UPDATE ON public.oc_quotations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_oc_quotations_line ON public.oc_quotations(budget_line_id);
CREATE INDEX idx_oc_quotations_contract ON public.oc_quotations(contract_id);
CREATE INDEX idx_oc_quotations_supplier ON public.oc_quotations(supplier_id);