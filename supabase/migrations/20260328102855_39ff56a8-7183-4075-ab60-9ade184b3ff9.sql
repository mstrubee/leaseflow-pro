CREATE TABLE public.file_destination_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text NOT NULL UNIQUE,
  folder_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.file_destination_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read file destination settings"
  ON public.file_destination_settings FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can manage file destination settings"
  ON public.file_destination_settings FOR ALL
  TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Insert defaults
INSERT INTO public.file_destination_settings (setting_key, folder_name) VALUES
  ('oc_folder', 'OC'),
  ('invoice_folder', 'Facturas')
ON CONFLICT (setting_key) DO NOTHING;