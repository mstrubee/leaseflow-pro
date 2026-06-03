DROP POLICY IF EXISTS "Users with alerts permission can view alert history" ON public.alert_history;
CREATE POLICY "Admins can view alert history"
ON public.alert_history
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));