-- Add INSERT policy for alert_categories (admins can create new categories)
CREATE POLICY "Admins can insert alert categories"
  ON public.alert_categories FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Add UPDATE policy for alert_categories
CREATE POLICY "Admins can update alert categories"
  ON public.alert_categories FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Add DELETE policy for alert_categories
CREATE POLICY "Admins can delete alert categories"
  ON public.alert_categories FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );