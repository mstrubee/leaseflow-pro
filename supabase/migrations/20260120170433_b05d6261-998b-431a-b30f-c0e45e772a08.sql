-- Create alert categories table
CREATE TABLE public.alert_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  code TEXT NOT NULL UNIQUE,
  display_order INTEGER DEFAULT 0,
  is_system BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.alert_categories ENABLE ROW LEVEL SECURITY;

-- RLS policies for alert_categories
CREATE POLICY "Everyone can view active alert categories"
  ON public.alert_categories FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage alert categories"
  ON public.alert_categories FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Insert default categories
INSERT INTO public.alert_categories (name, code, description, display_order, is_system) VALUES
  ('Alertas de Contratos', 'contract_alerts', 'Alertas relacionadas con términos y avisos de contratos', 1, true),
  ('Alertas de Seguimiento', 'tracking_alerts', 'Alertas de seguimiento general y documentos de patentes', 2, true);

-- Add category_id to alerts table
ALTER TABLE public.alerts 
ADD COLUMN category_id UUID REFERENCES public.alert_categories(id);

-- Update existing contract-related alerts to use the contract category
UPDATE public.alerts 
SET category_id = (SELECT id FROM public.alert_categories WHERE code = 'contract_alerts')
WHERE alert_type IN ('contract_expiration', 'contract_renewal', 'early_termination_notice');

-- Update remaining alerts to tracking category
UPDATE public.alerts 
SET category_id = (SELECT id FROM public.alert_categories WHERE code = 'tracking_alerts')
WHERE category_id IS NULL;