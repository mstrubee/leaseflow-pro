-- ============================================================
-- Fix 1: Restrict org_members email/phone to admins only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read org_members" ON public.org_members;
REVOKE SELECT ON public.org_members FROM authenticated;
GRANT SELECT (id, company_id, name, position, parent_id, display_order, created_at)
  ON public.org_members TO authenticated;

CREATE POLICY "Authenticated users can read non-sensitive org_members"
  ON public.org_members FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- Fix 2: Close privilege-escalation in can_access_gantt
-- Zero-permission accounts must NOT gain Gantt write access.
-- Configured users without a contract-section restriction keep access.
-- ============================================================
CREATE OR REPLACE FUNCTION public.can_access_gantt(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_permissions
      WHERE user_id = _user_id AND resource = 'contract_gantt'
    )
    OR (
      -- User is configured (has at least one permission assigned)
      EXISTS (
        SELECT 1 FROM public.user_permissions WHERE user_id = _user_id
      )
      -- and has no contract-section restriction (so the Cronograma is visible)
      AND NOT EXISTS (
        SELECT 1 FROM public.user_permissions
        WHERE user_id = _user_id
          AND resource IN (
            'contract_address','contract_contact','contract_commercial',
            'contract_renegotiation','contract_surfaces','contract_documents',
            'contract_repository','contract_gantt','contract_alerts','contract_patents'
          )
      )
    )
$$;