-- ============================================================
-- Migration: fix_gantt_template_rls_and_audit
-- Date: 2026-06-28
-- Purpose:
--   1. Allow users with gantt access to write template tasks/deps
--      (previously only admins; caused silent failures on export)
--   2. Enable RLS on maintenance_sub_statuses and oc_import_batches
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. gantt_template_tasks — allow gantt users to insert/update/delete
-- ──────────────────────────────────────────────────────────────
CREATE POLICY "Users with gantt access can insert gantt_template_tasks"
  ON public.gantt_template_tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (can_access_gantt(auth.uid()));

CREATE POLICY "Users with gantt access can update gantt_template_tasks"
  ON public.gantt_template_tasks
  FOR UPDATE
  TO authenticated
  USING (can_access_gantt(auth.uid()));

CREATE POLICY "Users with gantt access can delete gantt_template_tasks"
  ON public.gantt_template_tasks
  FOR DELETE
  TO authenticated
  USING (can_access_gantt(auth.uid()));

-- ──────────────────────────────────────────────────────────────
-- 2. gantt_template_dependencies — allow gantt users to write
-- ──────────────────────────────────────────────────────────────
CREATE POLICY "Users with gantt access can insert gantt_template_dependencies"
  ON public.gantt_template_dependencies
  FOR INSERT
  TO authenticated
  WITH CHECK (can_access_gantt(auth.uid()));

CREATE POLICY "Users with gantt access can update gantt_template_dependencies"
  ON public.gantt_template_dependencies
  FOR UPDATE
  TO authenticated
  USING (can_access_gantt(auth.uid()));

CREATE POLICY "Users with gantt access can delete gantt_template_dependencies"
  ON public.gantt_template_dependencies
  FOR DELETE
  TO authenticated
  USING (can_access_gantt(auth.uid()));

-- ──────────────────────────────────────────────────────────────
-- 3. gantt_templates — allow gantt users to insert/update/delete
-- ──────────────────────────────────────────────────────────────
CREATE POLICY "Users with gantt access can insert gantt_templates"
  ON public.gantt_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (can_access_gantt(auth.uid()));

CREATE POLICY "Users with gantt access can update gantt_templates"
  ON public.gantt_templates
  FOR UPDATE
  TO authenticated
  USING (can_access_gantt(auth.uid()));

CREATE POLICY "Users with gantt access can delete gantt_templates"
  ON public.gantt_templates
  FOR DELETE
  TO authenticated
  USING (can_access_gantt(auth.uid()));

-- ──────────────────────────────────────────────────────────────
-- 4. Enable RLS on tables that were missing it
-- ──────────────────────────────────────────────────────────────

-- maintenance_sub_statuses: reference/lookup table — all authenticated users read
ALTER TABLE public.maintenance_sub_statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view maintenance_sub_statuses"
  ON public.maintenance_sub_statuses
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage maintenance_sub_statuses"
  ON public.maintenance_sub_statuses
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- oc_import_batches: users manage their own import batches
ALTER TABLE public.oc_import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view oc_import_batches"
  ON public.oc_import_batches
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage oc_import_batches"
  ON public.oc_import_batches
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can insert oc_import_batches"
  ON public.oc_import_batches
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
