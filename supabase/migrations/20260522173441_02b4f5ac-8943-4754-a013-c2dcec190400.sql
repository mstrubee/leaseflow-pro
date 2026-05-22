
-- 1. alert_history: restrict SELECT to users with alerts view permission or admin
DROP POLICY IF EXISTS "Authenticated users can view alert history" ON public.alert_history;
CREATE POLICY "Users with alerts permission can view alert history"
ON public.alert_history
FOR SELECT
TO authenticated
USING (
  has_permission(auth.uid(), 'alerts', 'view')
  OR has_permission(auth.uid(), 'alerts', 'edit')
  OR has_permission(auth.uid(), 'alerts', 'all')
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- 2. alert_recipients: restrict SELECT similarly
DROP POLICY IF EXISTS "Authenticated users can view alert_recipients" ON public.alert_recipients;
CREATE POLICY "Users with alerts permission can view alert_recipients"
ON public.alert_recipients
FOR SELECT
TO authenticated
USING (
  has_permission(auth.uid(), 'alerts', 'view')
  OR has_permission(auth.uid(), 'alerts', 'edit')
  OR has_permission(auth.uid(), 'alerts', 'all')
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- 3. Fix self-referencing join bug in alerts SELECT policy
DROP POLICY IF EXISTS "Users can view own or assigned alerts" ON public.alerts;
CREATE POLICY "Users can view own or assigned alerts"
ON public.alerts
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR created_by = auth.uid()
  OR assigned_to = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.alert_viewers av
    WHERE av.alert_id = alerts.id AND av.user_id = auth.uid()
  )
);

-- 4. Reference tables: restrict SELECT from public (incl. anon) to authenticated
DROP POLICY IF EXISTS "Anyone can view active comite_gp_statuses" ON public.comite_gp_statuses;
CREATE POLICY "Authenticated users can view active comite_gp_statuses"
ON public.comite_gp_statuses
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view active OPEX categories" ON public.opex_categories;
CREATE POLICY "Authenticated users can view active OPEX categories"
ON public.opex_categories
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow read supplier_opex_categories" ON public.supplier_opex_categories;
CREATE POLICY "Authenticated users can read supplier_opex_categories"
ON public.supplier_opex_categories
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view folder templates" ON public.folder_templates;
CREATE POLICY "Authenticated users can view folder templates"
ON public.folder_templates
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view active templates" ON public.oc_request_templates;
CREATE POLICY "Authenticated users can view active templates"
ON public.oc_request_templates
FOR SELECT TO authenticated USING (is_active = true);

-- 5. Storage: remove anonymous read on ot-files and repository-files
DROP POLICY IF EXISTS "Public read OT files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view repository files" ON storage.objects;
