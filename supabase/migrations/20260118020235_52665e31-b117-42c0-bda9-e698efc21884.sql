
-- Fix RLS policies for business_cases table
-- Business cases contain financial spreadsheet data and should require contracts permissions

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can view all business cases" ON public.business_cases;
DROP POLICY IF EXISTS "Authenticated users can insert business cases" ON public.business_cases;
DROP POLICY IF EXISTS "Authenticated users can update business cases" ON public.business_cases;
DROP POLICY IF EXISTS "Authenticated users can delete business cases" ON public.business_cases;

-- Create proper permission-based policies
-- SELECT: Users can view business cases if they own it, created it, or have contracts permission
CREATE POLICY "Users can view business cases with permission"
ON public.business_cases FOR SELECT
USING (
  created_by = auth.uid() OR
  has_permission(auth.uid(), 'contracts', 'view') OR
  has_permission(auth.uid(), 'contracts', 'edit') OR
  has_permission(auth.uid(), 'contracts', 'all') OR
  has_role(auth.uid(), 'admin')
);

-- INSERT: Users can create business cases if they have contracts edit permission
CREATE POLICY "Users can insert business cases with permission"
ON public.business_cases FOR INSERT
WITH CHECK (
  has_permission(auth.uid(), 'contracts', 'edit') OR
  has_permission(auth.uid(), 'contracts', 'all') OR
  has_role(auth.uid(), 'admin')
);

-- UPDATE: Users can update business cases they created or with contracts edit permission
CREATE POLICY "Users can update business cases with permission"
ON public.business_cases FOR UPDATE
USING (
  created_by = auth.uid() OR
  has_permission(auth.uid(), 'contracts', 'edit') OR
  has_permission(auth.uid(), 'contracts', 'all') OR
  has_role(auth.uid(), 'admin')
);

-- DELETE: Users can delete business cases they created or with contracts edit permission
CREATE POLICY "Users can delete business cases with permission"
ON public.business_cases FOR DELETE
USING (
  created_by = auth.uid() OR
  has_permission(auth.uid(), 'contracts', 'edit') OR
  has_permission(auth.uid(), 'contracts', 'all') OR
  has_role(auth.uid(), 'admin')
);

-- Fix renegotiation_drafts SELECT policy to use proper permission checks
DROP POLICY IF EXISTS "Authenticated users can view renegotiation drafts" ON public.renegotiation_drafts;

CREATE POLICY "Users can view renegotiation drafts with permission"
ON public.renegotiation_drafts FOR SELECT
USING (
  created_by = auth.uid() OR
  has_permission(auth.uid(), 'contracts', 'view') OR
  has_permission(auth.uid(), 'contracts', 'edit') OR
  has_permission(auth.uid(), 'contracts', 'all') OR
  has_role(auth.uid(), 'admin')
);
