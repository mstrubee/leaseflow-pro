-- ============================================================
-- FIX 1: can_access_gantt overly broad write access
-- Narrow the function so it no longer grants Gantt write access
-- to any user who merely has some unrelated permission and no
-- contract-section restriction. Now requires: admin, an explicit
-- contract_gantt permission, or a fully unconfigured user.
-- ============================================================
CREATE OR REPLACE FUNCTION public.can_access_gantt(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.has_role(_user_id, 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_permissions
      WHERE user_id = _user_id AND resource = 'contract_gantt'
    )
    OR NOT EXISTS (
      SELECT 1 FROM public.user_permissions WHERE user_id = _user_id
    )
$function$;

-- ============================================================
-- FIX 2: org_members email/phone exposure
-- Remove the broad authenticated SELECT policy (USING true) so the
-- base table is admin-only at the row level. Provide non-sensitive
-- columns to all authenticated users through a SECURITY DEFINER
-- function that never returns email or phone.
-- ============================================================

-- Drop the overly broad read policy
DROP POLICY IF EXISTS "Authenticated users can read non-sensitive org_members" ON public.org_members;

-- Remove the column-level SELECT grants; access now goes through the function
REVOKE SELECT (id, company_id, name, position, parent_id, display_order, created_at)
  ON public.org_members FROM authenticated;

-- Safe accessor: non-sensitive columns only (no email, no phone)
CREATE OR REPLACE FUNCTION public.get_org_members_basic()
 RETURNS TABLE(
   id uuid,
   company_id uuid,
   name text,
   "position" text,
   parent_id uuid,
   display_order integer,
   created_at timestamptz
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, company_id, name, "position", parent_id, display_order, created_at
  FROM public.org_members
  ORDER BY display_order, name
$function$;

REVOKE ALL ON FUNCTION public.get_org_members_basic() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_org_members_basic() TO authenticated;