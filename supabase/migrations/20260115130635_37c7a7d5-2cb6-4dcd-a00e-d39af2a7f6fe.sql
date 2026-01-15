-- Add guarantee type fields to contract_versions
ALTER TABLE public.contract_versions 
ADD COLUMN IF NOT EXISTS guarantee_type text DEFAULT 'multiplier',
ADD COLUMN IF NOT EXISTS guarantee_fixed_amount numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS guarantee_fixed_currency text DEFAULT 'UF';

-- Add comment for documentation
COMMENT ON COLUMN public.contract_versions.guarantee_type IS 'Type of guarantee: multiplier, fixed_uf, fixed_clp';
COMMENT ON COLUMN public.contract_versions.guarantee_fixed_amount IS 'Fixed guarantee amount when not using multiplier';
COMMENT ON COLUMN public.contract_versions.guarantee_fixed_currency IS 'Currency for fixed guarantee: UF or CLP';

-- Create entry_expenses table for gastos de entrada
CREATE TABLE public.entry_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount_uf NUMERIC NOT NULL DEFAULT 0,
  amount_clp NUMERIC,
  currency TEXT NOT NULL DEFAULT 'UF',
  description TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID
);

-- Enable RLS
ALTER TABLE public.entry_expenses ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Authenticated users can view entry expenses" 
ON public.entry_expenses 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Admins can insert entry expenses" 
ON public.entry_expenses 
FOR INSERT 
TO authenticated 
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update entry expenses" 
ON public.entry_expenses 
FOR UPDATE 
TO authenticated 
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete entry expenses" 
ON public.entry_expenses 
FOR DELETE 
TO authenticated 
USING (public.has_role(auth.uid(), 'admin'));

-- Create trigger for updated_at
CREATE TRIGGER update_entry_expenses_updated_at
BEFORE UPDATE ON public.entry_expenses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();