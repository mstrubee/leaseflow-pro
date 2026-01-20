-- Fix the INSERT policy to require assigned_to matches current user OR user is admin
DROP POLICY IF EXISTS "Authenticated users can insert alerts" ON public.alerts;

CREATE POLICY "Users can insert alerts assigned to themselves"
ON public.alerts
FOR INSERT
TO authenticated
WITH CHECK (
  assigned_to = auth.uid() 
  OR public.has_role(auth.uid(), 'admin')
);