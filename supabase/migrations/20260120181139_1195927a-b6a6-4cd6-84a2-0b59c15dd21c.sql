-- Add responsible user and external emails to alerts
ALTER TABLE public.alerts 
ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS external_emails TEXT[] DEFAULT '{}';

-- Add comment for clarity
COMMENT ON COLUMN public.alerts.assigned_to IS 'Primary responsible user (must be a registered user)';
COMMENT ON COLUMN public.alerts.external_emails IS 'Additional external email addresses for notifications';

-- Create index for faster lookups by assigned user
CREATE INDEX IF NOT EXISTS idx_alerts_assigned_to ON public.alerts(assigned_to);

-- Update RLS policy to allow users to see alerts assigned to them
DROP POLICY IF EXISTS "Users can view alerts assigned to them" ON public.alerts;
CREATE POLICY "Users can view alerts assigned to them" 
ON public.alerts 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'admin') OR 
    assigned_to = auth.uid()
  )
);