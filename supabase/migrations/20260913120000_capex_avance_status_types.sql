-- "Estado Avance CAPEX" (En Curso/Terminado/Programado) por contrato, mismo
-- patrón que capex_clasificacion_types: administrable desde Admin > Estados
-- y Categorías, con nombre y color de badge.
CREATE TABLE public.capex_avance_status_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT DEFAULT 'gray',
  display_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.capex_avance_status_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active capex_avance_status_types"
  ON public.capex_avance_status_types FOR SELECT USING (true);

CREATE POLICY "Admins can manage capex_avance_status_types"
  ON public.capex_avance_status_types FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

INSERT INTO public.capex_avance_status_types (name, color, display_order) VALUES
  ('Programado', 'gray', 1),
  ('En Curso', 'blue', 2),
  ('Terminado', 'green', 3);

ALTER TABLE public.contracts ADD COLUMN capex_avance_status TEXT DEFAULT NULL;
