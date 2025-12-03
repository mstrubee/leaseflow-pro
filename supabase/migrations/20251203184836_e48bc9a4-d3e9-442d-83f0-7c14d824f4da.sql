-- Create folder templates table for admin-defined base folders
CREATE TABLE public.folder_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  folder_type TEXT UNIQUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.folder_templates ENABLE ROW LEVEL SECURITY;

-- Everyone can view templates
CREATE POLICY "Anyone can view folder templates"
ON public.folder_templates
FOR SELECT
USING (true);

-- Only admins can manage templates
CREATE POLICY "Admins can manage folder templates"
ON public.folder_templates
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default templates (matching existing BASE_FOLDERS)
INSERT INTO public.folder_templates (name, folder_type, display_order) VALUES
  ('Caso de Negocio', 'caso_negocio', 1),
  ('Due Diligence Técnico-Inmobiliario', 'due_diligence', 2),
  ('Municipales', 'municipales', 3),
  ('Títulos', 'titulos', 4),
  ('Planos', 'planos', 5),
  ('Información Patentes', 'patentes', 6),
  ('Borradores de Contrato', 'borradores', 7),
  ('Anexos de Contrato', 'anexos', 8),
  ('Contratos Anteriores', 'anteriores', 9);