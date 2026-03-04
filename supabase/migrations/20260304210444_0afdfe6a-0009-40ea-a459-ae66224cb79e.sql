
-- Create alert_viewers junction table
CREATE TABLE public.alert_viewers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID NOT NULL REFERENCES public.alerts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(alert_id, user_id)
);

-- Enable RLS
ALTER TABLE public.alert_viewers ENABLE ROW LEVEL SECURITY;

-- RLS for alert_viewers
CREATE POLICY "Authenticated users can view alert_viewers"
  ON public.alert_viewers FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can manage alert_viewers"
  ON public.alert_viewers FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Drop the overly permissive SELECT policy on alerts
DROP POLICY IF EXISTS "Users can view alerts" ON public.alerts;

-- Update the SELECT policy to only show alerts to creator, assigned_to, or viewers
DROP POLICY IF EXISTS "Users can view alerts assigned to them" ON public.alerts;
DROP POLICY IF EXISTS "Users can view their assigned alerts" ON public.alerts;

CREATE POLICY "Users can view own or assigned alerts"
  ON public.alerts FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin')
    OR created_by = auth.uid()
    OR assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.alert_viewers av
      WHERE av.alert_id = id AND av.user_id = auth.uid()
    )
  );
