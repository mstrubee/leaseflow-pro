-- Create business_cases table for storing spreadsheet data
CREATE TABLE public.business_cases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Business Case',
  spreadsheet_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create index for faster lookups
CREATE INDEX idx_business_cases_contract_id ON public.business_cases(contract_id);

-- Enable RLS
ALTER TABLE public.business_cases ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view all business cases"
ON public.business_cases FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert business cases"
ON public.business_cases FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update business cases"
ON public.business_cases FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete business cases"
ON public.business_cases FOR DELETE
TO authenticated
USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_business_cases_updated_at
BEFORE UPDATE ON public.business_cases
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();