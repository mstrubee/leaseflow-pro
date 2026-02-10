
-- Table for admin-manageable Comité GP status options
CREATE TABLE public.comite_gp_statuses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT DEFAULT 'gray',
  display_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.comite_gp_statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active comite_gp_statuses"
  ON public.comite_gp_statuses FOR SELECT USING (true);

CREATE POLICY "Admins can manage comite_gp_statuses"
  ON public.comite_gp_statuses FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Seed initial options
INSERT INTO public.comite_gp_statuses (name, color, display_order) VALUES
  ('Aceptada', 'green', 1),
  ('Rechazada', 'red', 2),
  ('Aceptada ' || EXTRACT(YEAR FROM CURRENT_DATE)::int + 1, 'blue', 3);

-- Add comite_gp_status column to contracts
ALTER TABLE public.contracts ADD COLUMN comite_gp_status TEXT DEFAULT NULL;
