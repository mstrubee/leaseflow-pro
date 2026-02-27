
CREATE TABLE public.user_activity_thresholds (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  idle_minutes integer NOT NULL DEFAULT 5,
  inactive_minutes integer NOT NULL DEFAULT 15
);

ALTER TABLE public.user_activity_thresholds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage activity thresholds"
ON public.user_activity_thresholds
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.user_activity_thresholds;
