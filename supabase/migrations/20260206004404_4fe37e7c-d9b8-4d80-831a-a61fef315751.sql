
CREATE TABLE public.maintenance_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_number text NOT NULL,
  status text NOT NULL DEFAULT 'proceso',
  created_date date,
  resolution_date date,
  contract_id uuid REFERENCES public.contracts(id),
  contract_name text,
  general_description text,
  electrical_description text,
  civil_description text,
  hvac_description text,
  fixed_assets_description text,
  additional_comments text,
  year integer DEFAULT EXTRACT(YEAR FROM now()),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz,
  created_by uuid
);

ALTER TABLE public.maintenance_forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read maintenance_forms"
  ON public.maintenance_forms FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert maintenance_forms"
  ON public.maintenance_forms FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update maintenance_forms"
  ON public.maintenance_forms FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
