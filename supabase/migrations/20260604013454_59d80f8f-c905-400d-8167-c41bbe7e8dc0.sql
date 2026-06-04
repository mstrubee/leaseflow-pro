-- 1. Fix privilege escalation on alert_viewers
DROP POLICY IF EXISTS "Authenticated users can manage alert_viewers" ON public.alert_viewers;

CREATE POLICY "Owners assignees admins can add alert_viewers"
ON public.alert_viewers
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.alerts a
    WHERE a.id = alert_id
      AND (a.created_by = auth.uid() OR a.assigned_to = auth.uid())
  )
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Owners assignees admins can update alert_viewers"
ON public.alert_viewers
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.alerts a
    WHERE a.id = alert_id
      AND (a.created_by = auth.uid() OR a.assigned_to = auth.uid())
  )
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Owners assignees admins can delete alert_viewers"
ON public.alert_viewers
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.alerts a
    WHERE a.id = alert_id
      AND (a.created_by = auth.uid() OR a.assigned_to = auth.uid())
  )
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- 2. Restrict app_settings writes to admins only
DROP POLICY IF EXISTS "app_settings escritura" ON public.app_settings;

CREATE POLICY "app_settings escritura admin"
ON public.app_settings
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));