-- Tabla para almacenar los formatos/plantillas tipo de presupuesto
CREATE TABLE public.budget_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  budget_type TEXT NOT NULL CHECK (budget_type IN ('inversion_inicial', 'capex')),
  is_active BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabla para las líneas de las plantillas (jerárquica, sin límite de niveles)
CREATE TABLE public.budget_template_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.budget_templates(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.budget_template_lines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  default_amount_uf NUMERIC DEFAULT 0,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.budget_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_template_lines ENABLE ROW LEVEL SECURITY;

-- Policies: Admin can manage templates, all authenticated users can view
CREATE POLICY "Admins can manage budget templates" 
ON public.budget_templates 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view budget templates" 
ON public.budget_templates 
FOR SELECT 
USING (auth.uid() IS NOT NULL AND is_active = true);

CREATE POLICY "Admins can manage budget template lines" 
ON public.budget_template_lines 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view budget template lines" 
ON public.budget_template_lines 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Indexes
CREATE INDEX idx_budget_templates_type ON public.budget_templates(budget_type);
CREATE INDEX idx_budget_template_lines_template ON public.budget_template_lines(template_id);
CREATE INDEX idx_budget_template_lines_parent ON public.budget_template_lines(parent_id);

-- Trigger for updated_at
CREATE TRIGGER update_budget_templates_updated_at
  BEFORE UPDATE ON public.budget_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();