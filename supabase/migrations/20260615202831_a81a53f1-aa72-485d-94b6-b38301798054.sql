-- Fix 1: Remove the permissive ALL policy on gantt_task_purchase_orders that
-- bypasses can_access_gantt() for every authenticated user.
DROP POLICY IF EXISTS "Authenticated users can manage task purchase orders" ON public.gantt_task_purchase_orders;

-- Restrict SELECT to users who can access the Gantt (consistent with sibling tables)
DROP POLICY IF EXISTS "Authenticated users can view gantt_task_purchase_orders" ON public.gantt_task_purchase_orders;
CREATE POLICY "Users with gantt access can view gantt_task_purchase_orders"
  ON public.gantt_task_purchase_orders FOR SELECT
  USING (public.can_access_gantt(auth.uid()));

-- Fix 2: org_members PII (email, phone) must not be exposed to non-admins.
-- Replace blanket SELECT policy + use column-level grants that EXCLUDE email/phone.
DROP POLICY IF EXISTS "Authenticated users can read non-sensitive org_members" ON public.org_members;

REVOKE SELECT ON public.org_members FROM authenticated;
GRANT SELECT (id, company_id, name, position, parent_id, display_order, created_at)
  ON public.org_members TO authenticated;

-- Row-scoped SELECT policy; combined with column grants above, non-admins can read
-- only the non-sensitive columns. Admins read all columns via get_org_members_admin().
CREATE POLICY "Authenticated users can read non-sensitive org_members"
  ON public.org_members FOR SELECT
  TO authenticated
  USING (true);