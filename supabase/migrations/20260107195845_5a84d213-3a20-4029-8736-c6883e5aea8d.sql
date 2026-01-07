-- Drop overly permissive policies on contract_companies
DROP POLICY IF EXISTS "Authenticated users can view contract_companies" ON public.contract_companies;
DROP POLICY IF EXISTS "Authenticated users can insert contract_companies" ON public.contract_companies;
DROP POLICY IF EXISTS "Authenticated users can delete contract_companies" ON public.contract_companies;

-- Create proper policies matching the contracts table pattern
CREATE POLICY "Admins can manage contract_companies"
ON public.contract_companies
FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view contract_companies with permission"
ON public.contract_companies
FOR SELECT
USING (
  has_permission(auth.uid(), 'contracts', 'view') OR
  has_permission(auth.uid(), 'contracts', 'edit') OR
  has_permission(auth.uid(), 'contracts', 'all')
);

CREATE POLICY "Users can modify contract_companies with permission"
ON public.contract_companies
FOR INSERT
WITH CHECK (
  has_permission(auth.uid(), 'contracts', 'edit') OR
  has_permission(auth.uid(), 'contracts', 'all')
);

CREATE POLICY "Users can delete contract_companies with permission"
ON public.contract_companies
FOR DELETE
USING (
  has_permission(auth.uid(), 'contracts', 'edit') OR
  has_permission(auth.uid(), 'contracts', 'all')
);