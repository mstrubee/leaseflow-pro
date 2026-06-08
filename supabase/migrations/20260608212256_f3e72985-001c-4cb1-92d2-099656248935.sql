CREATE TABLE public.supplier_bank_details (
  supplier_id uuid PRIMARY KEY REFERENCES public.suppliers(id) ON DELETE CASCADE,
  bank_name text,
  bank_account_type text,
  bank_account_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_bank_details TO authenticated;
GRANT ALL ON public.supplier_bank_details TO service_role;

ALTER TABLE public.supplier_bank_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage supplier bank details"
  ON public.supplier_bank_details
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_supplier_bank_details_updated_at
  BEFORE UPDATE ON public.supplier_bank_details
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.supplier_bank_details (supplier_id, bank_name, bank_account_type, bank_account_number)
SELECT id, bank_name, bank_account_type, bank_account_number
FROM public.suppliers
WHERE bank_name IS NOT NULL OR bank_account_type IS NOT NULL OR bank_account_number IS NOT NULL;

ALTER TABLE public.suppliers
  DROP COLUMN bank_name,
  DROP COLUMN bank_account_type,
  DROP COLUMN bank_account_number;