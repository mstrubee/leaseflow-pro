-- Tabla administrable para "Tipos de CAPEX" (antes: 3 valores fijos
-- "nuevo"/"reemplazo"/"regularizacion" hardcodeados en el frontend). Mismo
-- patrón que comite_gp_statuses: nombre + color administrables desde
-- Admin > Estados y Categorías, sin tocar los valores ya guardados en
-- contracts.clasificacion (el "name" de cada tipo sigue siendo el mismo
-- string que ya se guarda ahí).
CREATE TABLE public.capex_clasificacion_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT DEFAULT 'gray',
  display_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.capex_clasificacion_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active capex_clasificacion_types"
  ON public.capex_clasificacion_types FOR SELECT USING (true);

CREATE POLICY "Admins can manage capex_clasificacion_types"
  ON public.capex_clasificacion_types FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Semilla con los 3 valores ya usados hoy (mismo texto exacto que
-- contracts.clasificacion), para no requerir ninguna migración de datos.
INSERT INTO public.capex_clasificacion_types (name, color, display_order) VALUES
  ('nuevo', 'blue', 1),
  ('reemplazo', 'orange', 2),
  ('regularizacion', 'green', 3);
