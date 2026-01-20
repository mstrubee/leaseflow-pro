-- Create table for OC Requests (Solicitudes de OC)
CREATE TABLE public.oc_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  budget_id UUID REFERENCES public.contract_budgets(id) ON DELETE SET NULL,
  budget_line_id UUID REFERENCES public.budget_lines(id) ON DELETE SET NULL,
  
  -- Naming: date_correlative_lineName_projectName
  request_number TEXT NOT NULL,
  correlative_of_day INTEGER NOT NULL DEFAULT 1,
  request_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Details
  line_name TEXT NOT NULL,
  project_name TEXT NOT NULL,
  description TEXT,
  amount_uf NUMERIC DEFAULT 0,
  amount_clp NUMERIC DEFAULT 0,
  input_currency TEXT DEFAULT 'UF',
  uf_value_at_entry NUMERIC DEFAULT 0,
  supplier_name TEXT,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  year INTEGER NOT NULL,
  
  -- Status: pending = not yet converted to OC, converted = has associated OC
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'converted')),
  
  -- Reference to the actual OC once converted
  purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  
  -- Created by user
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.oc_requests ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view OC requests"
ON public.oc_requests
FOR SELECT
USING (true);

CREATE POLICY "Admins can manage OC requests"
ON public.oc_requests
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create OC requests"
ON public.oc_requests
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own OC requests"
ON public.oc_requests
FOR UPDATE
USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_oc_requests_updated_at
BEFORE UPDATE ON public.oc_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster queries
CREATE INDEX idx_oc_requests_contract_id ON public.oc_requests(contract_id);
CREATE INDEX idx_oc_requests_budget_line_id ON public.oc_requests(budget_line_id);
CREATE INDEX idx_oc_requests_status ON public.oc_requests(status);
CREATE INDEX idx_oc_requests_request_date ON public.oc_requests(request_date);

-- Table to store the OC Request form template (uploaded by admin)
CREATE TABLE public.oc_request_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.oc_request_templates ENABLE ROW LEVEL SECURITY;

-- RLS policies for templates
CREATE POLICY "Anyone can view active templates"
ON public.oc_request_templates
FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can manage templates"
ON public.oc_request_templates
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for templates
CREATE TRIGGER update_oc_request_templates_updated_at
BEFORE UPDATE ON public.oc_request_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();