-- Create junction table for contract-company relationship
CREATE TABLE public.contract_companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(contract_id, company_id)
);

-- Enable RLS
ALTER TABLE public.contract_companies ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view contract_companies"
ON public.contract_companies FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert contract_companies"
ON public.contract_companies FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can delete contract_companies"
ON public.contract_companies FOR DELETE
TO authenticated
USING (true);