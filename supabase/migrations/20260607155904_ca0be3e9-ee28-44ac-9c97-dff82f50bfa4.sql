-- Restrict column-level SELECT so email/phone are not readable by all authenticated users
REVOKE SELECT ON public.org_members FROM authenticated;
GRANT SELECT (id, name, position, company_id, parent_id, display_order, created_at)
  ON public.org_members TO authenticated;

-- Admin-only function to read full member details (including email/phone)
CREATE OR REPLACE FUNCTION public.get_org_members_admin()
RETURNS SETOF public.org_members
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.org_members
  WHERE public.has_role(auth.uid(), 'admin'::app_role)
  ORDER BY display_order;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_members_admin() TO authenticated;