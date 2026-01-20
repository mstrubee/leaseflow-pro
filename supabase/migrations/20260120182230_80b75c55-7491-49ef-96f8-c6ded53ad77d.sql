-- Drop existing policies on alerts table
DROP POLICY IF EXISTS "Users can view their assigned alerts" ON public.alerts;
DROP POLICY IF EXISTS "Admins can view all alerts" ON public.alerts;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.alerts;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.alerts;
DROP POLICY IF EXISTS "Enable update for users based on email" ON public.alerts;
DROP POLICY IF EXISTS "Enable delete for users based on email" ON public.alerts;
DROP POLICY IF EXISTS "Authenticated users can insert alerts" ON public.alerts;
DROP POLICY IF EXISTS "Authenticated users can update alerts" ON public.alerts;
DROP POLICY IF EXISTS "Authenticated users can delete alerts" ON public.alerts;

-- Create new RLS policies
-- Users can only view alerts assigned to them OR if they are admins
CREATE POLICY "Users can view their assigned alerts"
ON public.alerts
FOR SELECT
TO authenticated
USING (
  assigned_to = auth.uid() 
  OR public.has_role(auth.uid(), 'admin')
);

-- Users can insert alerts (they will be assigned to themselves by default)
CREATE POLICY "Authenticated users can insert alerts"
ON public.alerts
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Users can update their own assigned alerts OR admins can update any
CREATE POLICY "Users can update their assigned alerts"
ON public.alerts
FOR UPDATE
TO authenticated
USING (
  assigned_to = auth.uid() 
  OR public.has_role(auth.uid(), 'admin')
);

-- Users can delete their own assigned alerts OR admins can delete any
CREATE POLICY "Users can delete their assigned alerts"
ON public.alerts
FOR DELETE
TO authenticated
USING (
  assigned_to = auth.uid() 
  OR public.has_role(auth.uid(), 'admin')
);