DROP POLICY IF EXISTS "Anyone can view OPEX master budget" ON public.opex_master_budget;

CREATE POLICY "Users can view OPEX master budget with permission"
ON public.opex_master_budget
FOR SELECT
TO authenticated
USING (
  has_permission(auth.uid(), 'opex', 'view'::permission_type)
  OR has_permission(auth.uid(), 'opex', 'edit'::permission_type)
  OR has_permission(auth.uid(), 'opex', 'all'::permission_type)
  OR has_role(auth.uid(), 'admin'::app_role)
);