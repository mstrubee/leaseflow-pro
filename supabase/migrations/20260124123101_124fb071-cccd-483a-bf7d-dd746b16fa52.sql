-- Create logos table
CREATE TABLE public.app_logos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  logo_key VARCHAR(50) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  storage_path TEXT,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.app_logos ENABLE ROW LEVEL SECURITY;

-- Everyone can view logos
CREATE POLICY "Anyone can view logos" 
ON public.app_logos 
FOR SELECT 
USING (true);

-- Only admins can modify logos (check user_roles table)
CREATE POLICY "Admins can manage logos" 
ON public.app_logos 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'admin'
  )
);

-- Create storage bucket for logos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('logos', 'logos', true);

-- Storage policies for logos bucket
CREATE POLICY "Anyone can view logos" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'logos');

CREATE POLICY "Admins can upload logos" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'logos' 
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'admin'
  )
);

CREATE POLICY "Admins can update logos" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'logos' 
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'admin'
  )
);

CREATE POLICY "Admins can delete logos" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'logos' 
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'admin'
  )
);

-- Insert default logos
INSERT INTO public.app_logos (logo_key, display_name, display_order) VALUES
  ('agroplanet', 'Logo Agroplanet', 1),
  ('autoplanet', 'Logo Autoplanet', 2),
  ('dashboard_header', 'Logo Dashboard (Header)', 3);

-- Trigger for updated_at
CREATE TRIGGER update_app_logos_updated_at
BEFORE UPDATE ON public.app_logos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();