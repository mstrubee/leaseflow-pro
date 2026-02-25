
-- Create maintenance criticality categories table
CREATE TABLE public.maintenance_criticality_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add criticality_category_id to maintenance_forms
ALTER TABLE public.maintenance_forms
  ADD COLUMN criticality_category_id UUID REFERENCES public.maintenance_criticality_categories(id);

-- RLS for maintenance_criticality_categories
ALTER TABLE public.maintenance_criticality_categories ENABLE ROW LEVEL SECURITY;

-- Read: all authenticated users
CREATE POLICY "Authenticated users can read criticality categories"
  ON public.maintenance_criticality_categories
  FOR SELECT
  TO authenticated
  USING (true);

-- Insert: admins only
CREATE POLICY "Admins can insert criticality categories"
  ON public.maintenance_criticality_categories
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Update: admins only
CREATE POLICY "Admins can update criticality categories"
  ON public.maintenance_criticality_categories
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Delete: admins only
CREATE POLICY "Admins can delete criticality categories"
  ON public.maintenance_criticality_categories
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
