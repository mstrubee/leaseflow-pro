-- Create companies table
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add company_id to contracts
ALTER TABLE public.contracts ADD COLUMN company_id UUID REFERENCES public.companies(id);

-- Enable RLS
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- RLS policies for companies - all authenticated users can view
CREATE POLICY "Authenticated users can view companies" 
ON public.companies FOR SELECT 
TO authenticated
USING (true);

-- Only admins can insert/update/delete (enforced in application)
CREATE POLICY "Authenticated users can manage companies" 
ON public.companies FOR ALL 
TO authenticated
USING (true)
WITH CHECK (true);

-- Create index for better query performance
CREATE INDEX idx_contracts_company_id ON public.contracts(company_id);

-- Trigger for updated_at
CREATE TRIGGER update_companies_updated_at
BEFORE UPDATE ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();