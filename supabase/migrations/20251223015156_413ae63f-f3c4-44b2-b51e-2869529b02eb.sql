
-- Tabla de feriados nacionales
CREATE TABLE public.holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country TEXT NOT NULL DEFAULT 'Chile',
  date DATE NOT NULL,
  name TEXT NOT NULL,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(country, date)
);

-- Habilitar RLS
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

-- Políticas de feriados
CREATE POLICY "Users can view holidays" ON public.holidays
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage holidays" ON public.holidays
  FOR ALL USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Insertar feriados de Chile 2024-2025
INSERT INTO public.holidays (country, date, name, is_recurring) VALUES
  ('Chile', '2024-01-01', 'Año Nuevo', true),
  ('Chile', '2024-03-29', 'Viernes Santo', false),
  ('Chile', '2024-03-30', 'Sábado Santo', false),
  ('Chile', '2024-05-01', 'Día del Trabajo', true),
  ('Chile', '2024-05-21', 'Día de las Glorias Navales', true),
  ('Chile', '2024-06-20', 'Día Nacional de los Pueblos Indígenas', false),
  ('Chile', '2024-06-29', 'San Pedro y San Pablo', true),
  ('Chile', '2024-07-16', 'Día de la Virgen del Carmen', true),
  ('Chile', '2024-08-15', 'Asunción de la Virgen', true),
  ('Chile', '2024-09-18', 'Fiestas Patrias', true),
  ('Chile', '2024-09-19', 'Día de las Glorias del Ejército', true),
  ('Chile', '2024-09-20', 'Feriado adicional Fiestas Patrias', false),
  ('Chile', '2024-10-12', 'Encuentro de Dos Mundos', true),
  ('Chile', '2024-10-31', 'Día de las Iglesias Evangélicas', true),
  ('Chile', '2024-11-01', 'Día de Todos los Santos', true),
  ('Chile', '2024-12-08', 'Inmaculada Concepción', true),
  ('Chile', '2024-12-25', 'Navidad', true),
  ('Chile', '2025-01-01', 'Año Nuevo', true),
  ('Chile', '2025-04-18', 'Viernes Santo', false),
  ('Chile', '2025-04-19', 'Sábado Santo', false),
  ('Chile', '2025-05-01', 'Día del Trabajo', true),
  ('Chile', '2025-05-21', 'Día de las Glorias Navales', true),
  ('Chile', '2025-06-20', 'Día Nacional de los Pueblos Indígenas', false),
  ('Chile', '2025-06-29', 'San Pedro y San Pablo', true),
  ('Chile', '2025-07-16', 'Día de la Virgen del Carmen', true),
  ('Chile', '2025-08-15', 'Asunción de la Virgen', true),
  ('Chile', '2025-09-18', 'Fiestas Patrias', true),
  ('Chile', '2025-09-19', 'Día de las Glorias del Ejército', true),
  ('Chile', '2025-10-12', 'Encuentro de Dos Mundos', true),
  ('Chile', '2025-10-31', 'Día de las Iglesias Evangélicas', true),
  ('Chile', '2025-11-01', 'Día de Todos los Santos', true),
  ('Chile', '2025-12-08', 'Inmaculada Concepción', true),
  ('Chile', '2025-12-25', 'Navidad', true);

-- Plantillas de Gantt
CREATE TABLE public.gantt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.gantt_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view active templates" ON public.gantt_templates
  FOR SELECT USING (auth.uid() IS NOT NULL AND is_active = true);

CREATE POLICY "Admins can manage templates" ON public.gantt_templates
  FOR ALL USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Tareas de plantilla
CREATE TABLE public.gantt_template_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.gantt_templates(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.gantt_template_tasks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  default_duration_days INTEGER DEFAULT 1,
  duration_type TEXT NOT NULL DEFAULT 'calendar' CHECK (duration_type IN ('calendar', 'business')),
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.gantt_template_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view template tasks" ON public.gantt_template_tasks
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage template tasks" ON public.gantt_template_tasks
  FOR ALL USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Dependencias de plantilla
CREATE TABLE public.gantt_template_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.gantt_template_tasks(id) ON DELETE CASCADE,
  depends_on_task_id UUID NOT NULL REFERENCES public.gantt_template_tasks(id) ON DELETE CASCADE,
  lag_days INTEGER DEFAULT 0,
  lag_type TEXT NOT NULL DEFAULT 'calendar' CHECK (lag_type IN ('calendar', 'business')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id, depends_on_task_id)
);

ALTER TABLE public.gantt_template_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view template dependencies" ON public.gantt_template_dependencies
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage template dependencies" ON public.gantt_template_dependencies
  FOR ALL USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Líneas de tiempo por contrato
CREATE TABLE public.gantt_timelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Línea de Tiempo Principal',
  template_id UUID REFERENCES public.gantt_templates(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.gantt_timelines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage timelines" ON public.gantt_timelines
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Tareas de Gantt
CREATE TABLE public.gantt_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timeline_id UUID NOT NULL REFERENCES public.gantt_timelines(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.gantt_tasks(id) ON DELETE CASCADE,
  template_task_id UUID REFERENCES public.gantt_template_tasks(id),
  name TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  duration_days INTEGER DEFAULT 1,
  duration_type TEXT NOT NULL DEFAULT 'calendar' CHECK (duration_type IN ('calendar', 'business')),
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'delayed')),
  has_lag BOOLEAN DEFAULT false,
  lag_days INTEGER DEFAULT 0,
  lag_type TEXT NOT NULL DEFAULT 'calendar' CHECK (lag_type IN ('calendar', 'business')),
  notes TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.gantt_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage tasks" ON public.gantt_tasks
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Dependencias de tareas
CREATE TABLE public.gantt_task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.gantt_tasks(id) ON DELETE CASCADE,
  depends_on_task_id UUID NOT NULL REFERENCES public.gantt_tasks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id, depends_on_task_id)
);

ALTER TABLE public.gantt_task_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage dependencies" ON public.gantt_task_dependencies
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Relación tareas con órdenes de compra
CREATE TABLE public.gantt_task_purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.gantt_tasks(id) ON DELETE CASCADE,
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id, purchase_order_id)
);

ALTER TABLE public.gantt_task_purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage task purchase orders" ON public.gantt_task_purchase_orders
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Trigger para actualizar updated_at
CREATE TRIGGER update_gantt_templates_updated_at
  BEFORE UPDATE ON public.gantt_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_gantt_timelines_updated_at
  BEFORE UPDATE ON public.gantt_timelines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_gantt_tasks_updated_at
  BEFORE UPDATE ON public.gantt_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
