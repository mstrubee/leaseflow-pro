-- Fix overly permissive RLS policies on renegotiation and supplier tables
-- This migration restricts access to proper authorization checks

-- ============================================
-- 1. FIX renegotiation_drafts policies
-- ============================================

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can insert renegotiation drafts" ON public.renegotiation_drafts;
DROP POLICY IF EXISTS "Authenticated users can update renegotiation drafts" ON public.renegotiation_drafts;
DROP POLICY IF EXISTS "Authenticated users can delete renegotiation drafts" ON public.renegotiation_drafts;

-- Create secure policies based on creator/permissions
CREATE POLICY "Users can insert drafts with contracts permission"
  ON public.renegotiation_drafts FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_permission(auth.uid(), 'contracts', 'edit') OR
    public.has_permission(auth.uid(), 'contracts', 'all') OR
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Users can update own drafts or with permission"
  ON public.renegotiation_drafts FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid() OR
    public.has_permission(auth.uid(), 'contracts', 'edit') OR
    public.has_permission(auth.uid(), 'contracts', 'all') OR
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Users can delete own drafts or with permission"
  ON public.renegotiation_drafts FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid() OR
    public.has_permission(auth.uid(), 'contracts', 'edit') OR
    public.has_permission(auth.uid(), 'contracts', 'all') OR
    public.has_role(auth.uid(), 'admin')
  );

-- ============================================
-- 2. FIX renegotiation_draft_escalations policies
-- ============================================

-- Drop existing overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can manage draft escalations" ON public.renegotiation_draft_escalations;

-- Create secure policies that check parent draft access
CREATE POLICY "Users can view draft escalations with permission"
  ON public.renegotiation_draft_escalations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.renegotiation_drafts d
      WHERE d.id = draft_id
      AND (
        d.created_by = auth.uid() OR
        public.has_permission(auth.uid(), 'contracts', 'view') OR
        public.has_permission(auth.uid(), 'contracts', 'edit') OR
        public.has_permission(auth.uid(), 'contracts', 'all') OR
        public.has_role(auth.uid(), 'admin')
      )
    )
  );

CREATE POLICY "Users can insert draft escalations with permission"
  ON public.renegotiation_draft_escalations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.renegotiation_drafts d
      WHERE d.id = draft_id
      AND (
        d.created_by = auth.uid() OR
        public.has_permission(auth.uid(), 'contracts', 'edit') OR
        public.has_permission(auth.uid(), 'contracts', 'all') OR
        public.has_role(auth.uid(), 'admin')
      )
    )
  );

CREATE POLICY "Users can update draft escalations with permission"
  ON public.renegotiation_draft_escalations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.renegotiation_drafts d
      WHERE d.id = draft_id
      AND (
        d.created_by = auth.uid() OR
        public.has_permission(auth.uid(), 'contracts', 'edit') OR
        public.has_permission(auth.uid(), 'contracts', 'all') OR
        public.has_role(auth.uid(), 'admin')
      )
    )
  );

CREATE POLICY "Users can delete draft escalations with permission"
  ON public.renegotiation_draft_escalations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.renegotiation_drafts d
      WHERE d.id = draft_id
      AND (
        d.created_by = auth.uid() OR
        public.has_permission(auth.uid(), 'contracts', 'edit') OR
        public.has_permission(auth.uid(), 'contracts', 'all') OR
        public.has_role(auth.uid(), 'admin')
      )
    )
  );

-- ============================================
-- 3. FIX renegotiation_draft_notice_ranges policies
-- ============================================

-- Drop existing overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can manage draft notice ranges" ON public.renegotiation_draft_notice_ranges;

-- Create secure policies that check parent draft access
CREATE POLICY "Users can view draft notice ranges with permission"
  ON public.renegotiation_draft_notice_ranges FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.renegotiation_drafts d
      WHERE d.id = draft_id
      AND (
        d.created_by = auth.uid() OR
        public.has_permission(auth.uid(), 'contracts', 'view') OR
        public.has_permission(auth.uid(), 'contracts', 'edit') OR
        public.has_permission(auth.uid(), 'contracts', 'all') OR
        public.has_role(auth.uid(), 'admin')
      )
    )
  );

CREATE POLICY "Users can insert draft notice ranges with permission"
  ON public.renegotiation_draft_notice_ranges FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.renegotiation_drafts d
      WHERE d.id = draft_id
      AND (
        d.created_by = auth.uid() OR
        public.has_permission(auth.uid(), 'contracts', 'edit') OR
        public.has_permission(auth.uid(), 'contracts', 'all') OR
        public.has_role(auth.uid(), 'admin')
      )
    )
  );

CREATE POLICY "Users can update draft notice ranges with permission"
  ON public.renegotiation_draft_notice_ranges FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.renegotiation_drafts d
      WHERE d.id = draft_id
      AND (
        d.created_by = auth.uid() OR
        public.has_permission(auth.uid(), 'contracts', 'edit') OR
        public.has_permission(auth.uid(), 'contracts', 'all') OR
        public.has_role(auth.uid(), 'admin')
      )
    )
  );

CREATE POLICY "Users can delete draft notice ranges with permission"
  ON public.renegotiation_draft_notice_ranges FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.renegotiation_drafts d
      WHERE d.id = draft_id
      AND (
        d.created_by = auth.uid() OR
        public.has_permission(auth.uid(), 'contracts', 'edit') OR
        public.has_permission(auth.uid(), 'contracts', 'all') OR
        public.has_role(auth.uid(), 'admin')
      )
    )
  );

-- ============================================
-- 4. FIX supplier_opex_categories policies
-- ============================================

-- Drop existing overly permissive policies (were exposed to public!)
DROP POLICY IF EXISTS "Allow insert supplier_opex_categories" ON public.supplier_opex_categories;
DROP POLICY IF EXISTS "Allow update supplier_opex_categories" ON public.supplier_opex_categories;
DROP POLICY IF EXISTS "Allow delete supplier_opex_categories" ON public.supplier_opex_categories;

-- Create secure policies requiring authentication and permissions
CREATE POLICY "Authenticated users can insert supplier_opex_categories"
  ON public.supplier_opex_categories FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_permission(auth.uid(), 'suppliers', 'edit') OR
    public.has_permission(auth.uid(), 'suppliers', 'all') OR
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Authenticated users can update supplier_opex_categories"
  ON public.supplier_opex_categories FOR UPDATE
  TO authenticated
  USING (
    public.has_permission(auth.uid(), 'suppliers', 'edit') OR
    public.has_permission(auth.uid(), 'suppliers', 'all') OR
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Authenticated users can delete supplier_opex_categories"
  ON public.supplier_opex_categories FOR DELETE
  TO authenticated
  USING (
    public.has_permission(auth.uid(), 'suppliers', 'edit') OR
    public.has_permission(auth.uid(), 'suppliers', 'all') OR
    public.has_role(auth.uid(), 'admin')
  );