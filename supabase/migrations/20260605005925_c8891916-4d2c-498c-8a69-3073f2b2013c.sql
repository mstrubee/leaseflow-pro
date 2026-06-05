CREATE TABLE public.contract_business_cases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (contract_id)
);

GRANT SELECT, INSERT, UPDATE ON public.contract_business_cases TO authenticated;
GRANT DELETE ON public.contract_business_cases TO authenticated;
GRANT ALL ON public.contract_business_cases TO service_role;

ALTER TABLE public.contract_business_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view business cases"
  ON public.contract_business_cases FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can create business cases"
  ON public.contract_business_cases FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update business cases"
  ON public.contract_business_cases FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins can delete business cases"
  ON public.contract_business_cases FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_contract_business_cases_updated_at
  BEFORE UPDATE ON public.contract_business_cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();