
-- Categorías de KPI
CREATE TABLE public.kpi_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Tipos de meta (configurables)
CREATE TABLE public.kpi_goal_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Frecuencias de medición
CREATE TABLE public.kpi_frequencies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  months_interval INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- KPIs principales
CREATE TABLE public.kpis (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES public.kpi_categories(id) ON DELETE CASCADE,
  description TEXT,
  formula TEXT,
  formula_variables JSONB DEFAULT '[]'::jsonb,
  unit TEXT,
  goal_value NUMERIC,
  goal_type_id UUID REFERENCES public.kpi_goal_types(id),
  threshold_green NUMERIC,
  threshold_yellow NUMERIC,
  threshold_red NUMERIC,
  frequency_id UUID REFERENCES public.kpi_frequencies(id),
  responsible_user_id UUID REFERENCES auth.users(id),
  data_source TEXT,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Valores medidos de KPI
CREATE TABLE public.kpi_measurements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kpi_id UUID NOT NULL REFERENCES public.kpis(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  value NUMERIC NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Historial de cambios (auditoría)
CREATE TABLE public.kpi_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  old_values JSONB,
  new_values JSONB,
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  changed_by UUID REFERENCES auth.users(id)
);

-- Historial de versiones de fórmulas
CREATE TABLE public.kpi_formula_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kpi_id UUID NOT NULL REFERENCES public.kpis(id) ON DELETE CASCADE,
  formula TEXT NOT NULL,
  formula_variables JSONB DEFAULT '[]'::jsonb,
  version_number INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.kpi_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_goal_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_frequencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_formula_versions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for authenticated users
CREATE POLICY "Authenticated users can view kpi_categories" ON public.kpi_categories FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage kpi_categories" ON public.kpi_categories FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can view kpi_goal_types" ON public.kpi_goal_types FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage kpi_goal_types" ON public.kpi_goal_types FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can view kpi_frequencies" ON public.kpi_frequencies FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage kpi_frequencies" ON public.kpi_frequencies FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can view kpis" ON public.kpis FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage kpis" ON public.kpis FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can view kpi_measurements" ON public.kpi_measurements FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage kpi_measurements" ON public.kpi_measurements FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can view kpi_audit_log" ON public.kpi_audit_log FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert kpi_audit_log" ON public.kpi_audit_log FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can view kpi_formula_versions" ON public.kpi_formula_versions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage kpi_formula_versions" ON public.kpi_formula_versions FOR ALL USING (auth.uid() IS NOT NULL);

-- Insert default categories
INSERT INTO public.kpi_categories (name, description, display_order) VALUES
  ('Contratos & Negociación', 'KPIs relacionados con gestión de contratos y negociaciones', 1),
  ('Crecimiento de Red', 'KPIs de expansión y crecimiento de la red de locales', 2),
  ('Eficiencia Energética', 'KPIs de consumo y eficiencia energética', 3),
  ('Control de Activos', 'KPIs de gestión y control de activos', 4),
  ('Control Ambiental (Respel)', 'KPIs de gestión ambiental y residuos peligrosos', 5),
  ('Patentes & Permisos', 'KPIs de cumplimiento de patentes y permisos', 6),
  ('Eficiencia Operativa de Espacio', 'KPIs de uso eficiente del espacio', 7);

-- Insert default goal types
INSERT INTO public.kpi_goal_types (name, description) VALUES
  ('Mayor es Mejor', 'El valor más alto indica mejor desempeño'),
  ('Menor es Mejor', 'El valor más bajo indica mejor desempeño'),
  ('Rango', 'El valor debe estar dentro de un rango específico'),
  ('Exacto', 'El valor debe coincidir exactamente con la meta');

-- Insert default frequencies
INSERT INTO public.kpi_frequencies (name, months_interval) VALUES
  ('Mensual', 1),
  ('Trimestral', 3),
  ('Semestral', 6),
  ('Anual', 12);

-- Trigger for updated_at
CREATE TRIGGER update_kpi_categories_updated_at BEFORE UPDATE ON public.kpi_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_kpis_updated_at BEFORE UPDATE ON public.kpis FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
