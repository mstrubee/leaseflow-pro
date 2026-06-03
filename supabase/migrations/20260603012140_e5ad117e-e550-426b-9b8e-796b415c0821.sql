-- 1) app_settings: restrict read to authenticated users only
DROP POLICY IF EXISTS "app_settings lectura" ON public.app_settings;
CREATE POLICY "app_settings lectura"
ON public.app_settings
FOR SELECT
TO authenticated
USING (true);

-- 2) closing_process_notes: scope SELECT to users with contracts view permission (or admin)
DROP POLICY IF EXISTS "Authenticated users can view closing notes" ON public.closing_process_notes;
CREATE POLICY "Users can view closing notes with permission"
ON public.closing_process_notes
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_permission(auth.uid(), 'contracts'::text, 'view'::permission_type)
  OR has_permission(auth.uid(), 'contracts'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'contracts'::text, 'all'::permission_type)
);

-- 3) user_activity_thresholds: add per-user SELECT policy so realtime/RLS only exposes own row
CREATE POLICY "Users can view their own activity thresholds"
ON public.user_activity_thresholds
FOR SELECT
TO authenticated
USING (user_id = auth.uid());