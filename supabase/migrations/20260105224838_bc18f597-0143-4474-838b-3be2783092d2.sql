-- Expand suppliers table with additional fields
ALTER TABLE public.suppliers 
ADD COLUMN IF NOT EXISTS street TEXT,
ADD COLUMN IF NOT EXISTS street_number TEXT,
ADD COLUMN IF NOT EXISTS commune TEXT,
ADD COLUMN IF NOT EXISTS bank_name TEXT,
ADD COLUMN IF NOT EXISTS bank_account_type TEXT,
ADD COLUMN IF NOT EXISTS bank_account_number TEXT,
ADD COLUMN IF NOT EXISTS contact_name TEXT,
ADD COLUMN IF NOT EXISTS is_generic BOOLEAN DEFAULT false;

-- Create supplier categories/rubros table
CREATE TABLE IF NOT EXISTS public.supplier_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add category reference to suppliers
ALTER TABLE public.suppliers 
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.supplier_categories(id);

-- Create supplier emails table (allows multiple emails per supplier)
CREATE TABLE IF NOT EXISTS public.supplier_emails (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create supplier products junction table (links suppliers to template budget lines)
CREATE TABLE IF NOT EXISTS public.supplier_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  template_line_id UUID NOT NULL REFERENCES public.budget_template_lines(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(supplier_id, template_line_id)
);

-- Enable RLS on new tables
ALTER TABLE public.supplier_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_products ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for supplier_categories
CREATE POLICY "Allow read access to supplier_categories" 
ON public.supplier_categories FOR SELECT 
TO authenticated USING (true);

CREATE POLICY "Allow insert to supplier_categories" 
ON public.supplier_categories FOR INSERT 
TO authenticated WITH CHECK (true);

CREATE POLICY "Allow update to supplier_categories" 
ON public.supplier_categories FOR UPDATE 
TO authenticated USING (true);

CREATE POLICY "Allow delete to supplier_categories" 
ON public.supplier_categories FOR DELETE 
TO authenticated USING (true);

-- Create RLS policies for supplier_emails
CREATE POLICY "Allow read access to supplier_emails" 
ON public.supplier_emails FOR SELECT 
TO authenticated USING (true);

CREATE POLICY "Allow insert to supplier_emails" 
ON public.supplier_emails FOR INSERT 
TO authenticated WITH CHECK (true);

CREATE POLICY "Allow update to supplier_emails" 
ON public.supplier_emails FOR UPDATE 
TO authenticated USING (true);

CREATE POLICY "Allow delete to supplier_emails" 
ON public.supplier_emails FOR DELETE 
TO authenticated USING (true);

-- Create RLS policies for supplier_products
CREATE POLICY "Allow read access to supplier_products" 
ON public.supplier_products FOR SELECT 
TO authenticated USING (true);

CREATE POLICY "Allow insert to supplier_products" 
ON public.supplier_products FOR INSERT 
TO authenticated WITH CHECK (true);

CREATE POLICY "Allow update to supplier_products" 
ON public.supplier_products FOR UPDATE 
TO authenticated USING (true);

CREATE POLICY "Allow delete to supplier_products" 
ON public.supplier_products FOR DELETE 
TO authenticated USING (true);

-- Add trigger for updated_at on supplier_categories
CREATE TRIGGER update_supplier_categories_updated_at
BEFORE UPDATE ON public.supplier_categories
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add supplier_id to budget_lines for direct reference
ALTER TABLE public.budget_lines 
ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id);

-- Insert some default categories
INSERT INTO public.supplier_categories (name, description, display_order) VALUES
('Construcción', 'Materiales y servicios de construcción', 1),
('Electricidad', 'Instalaciones y materiales eléctricos', 2),
('Climatización', 'Sistemas de aire acondicionado y calefacción', 3),
('Sanitarios', 'Instalaciones y materiales sanitarios', 4),
('Mobiliario', 'Muebles y equipamiento', 5),
('Tecnología', 'Equipos y servicios tecnológicos', 6),
('Seguridad', 'Sistemas y servicios de seguridad', 7),
('Limpieza', 'Servicios y productos de limpieza', 8),
('Otros', 'Otros rubros', 99)
ON CONFLICT (name) DO NOTHING;