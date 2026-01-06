-- Create table for custom contract fields definitions (admin-managed)
CREATE TABLE public.contract_custom_fields (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  field_name TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for custom field values per contract
CREATE TABLE public.contract_custom_field_values (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES public.contract_custom_fields(id) ON DELETE CASCADE,
  field_value TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(contract_id, field_id)
);

-- Enable RLS
ALTER TABLE public.contract_custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_custom_field_values ENABLE ROW LEVEL SECURITY;

-- Policies for contract_custom_fields (only admin can manage)
CREATE POLICY "Admins can manage custom fields"
ON public.contract_custom_fields
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "All authenticated users can view custom fields"
ON public.contract_custom_fields
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Policies for contract_custom_field_values
CREATE POLICY "Authenticated users can view custom field values"
ON public.contract_custom_field_values
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can manage custom field values"
ON public.contract_custom_field_values
FOR ALL
USING (auth.uid() IS NOT NULL);

-- Trigger for updated_at
CREATE TRIGGER update_contract_custom_fields_updated_at
BEFORE UPDATE ON public.contract_custom_fields
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_contract_custom_field_values_updated_at
BEFORE UPDATE ON public.contract_custom_field_values
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();