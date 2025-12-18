-- Create enum for patent priority
CREATE TYPE public.patent_priority AS ENUM ('priority_1', 'priority_2', 'priority_3', 'vigente');

-- Create enum for document status
CREATE TYPE public.patent_doc_status AS ENUM ('pendiente', 'en_curso', 'ok', 'nuevo_doc');

-- Table for checklist sections (admin configurable)
CREATE TABLE public.patent_checklist_sections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table for checklist items template (admin configurable)
CREATE TABLE public.patent_checklist_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  section_id UUID NOT NULL REFERENCES public.patent_checklist_sections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table for custom columns (admin configurable)
CREATE TABLE public.patent_custom_columns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  column_type TEXT NOT NULL DEFAULT 'text',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table for emitters list (admin configurable)
CREATE TABLE public.patent_emitters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table for contract patent info (priority per contract)
CREATE TABLE public.contract_patents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE UNIQUE,
  priority patent_priority NOT NULL DEFAULT 'priority_3',
  priority_changed_at TIMESTAMP WITH TIME ZONE,
  priority_changed_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table for document records per contract/item
CREATE TABLE public.patent_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  checklist_item_id UUID NOT NULL REFERENCES public.patent_checklist_items(id) ON DELETE CASCADE,
  status patent_doc_status NOT NULL DEFAULT 'pendiente',
  status_changed_at TIMESTAMP WITH TIME ZONE,
  status_changed_by UUID,
  emitter_id UUID REFERENCES public.patent_emitters(id),
  responsible TEXT,
  start_date DATE,
  deadline_days INTEGER,
  end_date DATE,
  document_url TEXT,
  drive_file_id TEXT,
  storage_provider TEXT DEFAULT 'local',
  folder_id UUID REFERENCES public.repository_folders(id),
  notes TEXT,
  custom_data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(contract_id, checklist_item_id)
);

-- Table for patent document alerts
CREATE TABLE public.patent_document_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patent_document_id UUID NOT NULL REFERENCES public.patent_documents(id) ON DELETE CASCADE,
  alert_column TEXT NOT NULL,
  alert_date DATE NOT NULL,
  frequency_days INTEGER,
  recipients TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID
);

-- Enable RLS on all tables
ALTER TABLE public.patent_checklist_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patent_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patent_custom_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patent_emitters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_patents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patent_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patent_document_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for patent_checklist_sections
CREATE POLICY "Admins can manage checklist sections"
  ON public.patent_checklist_sections FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view checklist sections"
  ON public.patent_checklist_sections FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- RLS Policies for patent_checklist_items
CREATE POLICY "Admins can manage checklist items"
  ON public.patent_checklist_items FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view checklist items"
  ON public.patent_checklist_items FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- RLS Policies for patent_custom_columns
CREATE POLICY "Admins can manage custom columns"
  ON public.patent_custom_columns FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view custom columns"
  ON public.patent_custom_columns FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- RLS Policies for patent_emitters
CREATE POLICY "Admins can manage emitters"
  ON public.patent_emitters FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view emitters"
  ON public.patent_emitters FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- RLS Policies for contract_patents
CREATE POLICY "Authenticated users can manage contract patents"
  ON public.contract_patents FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- RLS Policies for patent_documents
CREATE POLICY "Authenticated users can manage patent documents"
  ON public.patent_documents FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- RLS Policies for patent_document_alerts
CREATE POLICY "Authenticated users can manage patent alerts"
  ON public.patent_document_alerts FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Insert default sections
INSERT INTO public.patent_checklist_sections (code, name, display_order) VALUES
  ('section_a', 'Sección A: Documentación Solicitud Patentes', 1),
  ('section_b', 'Sección B: Documentación DOM / Recepción Final', 2);

-- Insert default items for Section A
INSERT INTO public.patent_checklist_items (section_id, name, display_order)
SELECT s.id, item.name, item.ord
FROM public.patent_checklist_sections s,
(VALUES
  ('Recepción Final', 1),
  ('Cert TE1 (Elect)', 2),
  ('Contrato arriendo', 3),
  ('Constitución de Sociedad', 4),
  ('Vigencia de Sociedad', 5),
  ('Poderes de Rep. Legal', 6),
  ('Vigencia de Poderes', 7),
  ('Declaración de capital', 8),
  ('Apertura de sucursal', 9),
  ('RUT Empresa', 10),
  ('RUT Rep. Legal', 11),
  ('Informe Sanitario (ST)', 12),
  ('Certificación RESPEL', 13)
) AS item(name, ord)
WHERE s.code = 'section_a';

-- Insert default items for Section B
INSERT INTO public.patent_checklist_items (section_id, name, display_order)
SELECT s.id, item.name, item.ord
FROM public.patent_checklist_sections s,
(VALUES
  ('Certificado Informes Previos', 1),
  ('Certificado Dominio Vigente', 2),
  ('Desarchivo Municipal', 3),
  ('Certificado de No Expropiación Serviu', 4),
  ('Certificado de No Expropiación Municipal', 5),
  ('Factibilidad Eléctrica', 6),
  ('Factibilidad Sanitaria', 7),
  ('Proyecto de Cálculo', 8),
  ('Permiso de Edificación', 9),
  ('Certificado TE1', 10),
  ('Certificado Dotación Sanitaria', 11),
  ('Certificado Accesos (Serviu / MOP)', 12),
  ('Certificado Bomberos', 13)
) AS item(name, ord)
WHERE s.code = 'section_b';