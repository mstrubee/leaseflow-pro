-- Create table to track AI-imported fields
CREATE TABLE public.contract_import_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  field_label TEXT NOT NULL,
  imported_value TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('alta', 'media')),
  category TEXT NOT NULL CHECK (category IN ('contractual', 'ubicacion', 'partes')),
  imported_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  imported_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.contract_import_audit ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users
CREATE POLICY "Authenticated users can view import audit"
  ON public.contract_import_audit
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert import audit"
  ON public.contract_import_audit
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Create index for faster lookups
CREATE INDEX idx_contract_import_audit_contract_id ON public.contract_import_audit(contract_id);
CREATE INDEX idx_contract_import_audit_field_name ON public.contract_import_audit(field_name);