-- Drop the existing overly permissive policy on version_notices
DROP POLICY IF EXISTS "Allow all operations on version_notices" ON public.version_notices;

-- Create proper permission-based policies for version_notices table

-- SELECT policy - users need contracts view permission
CREATE POLICY "Users can view version_notices with contracts permission"
ON public.version_notices FOR SELECT
USING (
  has_permission(auth.uid(), 'contracts', 'view') OR 
  has_permission(auth.uid(), 'contracts', 'edit') OR 
  has_permission(auth.uid(), 'contracts', 'all') OR
  has_role(auth.uid(), 'admin')
);

-- INSERT policy - users need contracts edit permission
CREATE POLICY "Users can insert version_notices with contracts edit permission"
ON public.version_notices FOR INSERT
WITH CHECK (
  has_permission(auth.uid(), 'contracts', 'edit') OR 
  has_permission(auth.uid(), 'contracts', 'all') OR
  has_role(auth.uid(), 'admin')
);

-- UPDATE policy - users need contracts edit permission
CREATE POLICY "Users can update version_notices with contracts edit permission"
ON public.version_notices FOR UPDATE
USING (
  has_permission(auth.uid(), 'contracts', 'edit') OR 
  has_permission(auth.uid(), 'contracts', 'all') OR
  has_role(auth.uid(), 'admin')
);

-- DELETE policy - users need contracts edit permission
CREATE POLICY "Users can delete version_notices with contracts edit permission"
ON public.version_notices FOR DELETE
USING (
  has_permission(auth.uid(), 'contracts', 'edit') OR 
  has_permission(auth.uid(), 'contracts', 'all') OR
  has_role(auth.uid(), 'admin')
);