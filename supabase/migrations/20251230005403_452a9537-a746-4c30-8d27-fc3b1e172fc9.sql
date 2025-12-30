-- Create patent_statuses table for dynamic status management with colors
CREATE TABLE public.patent_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  bg_color text NOT NULL DEFAULT '#f3f4f6',
  text_color text NOT NULL DEFAULT '#374151',
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.patent_statuses ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins can manage statuses" ON public.patent_statuses
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view statuses" ON public.patent_statuses
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Insert default statuses matching current enum
INSERT INTO public.patent_statuses (code, name, bg_color, text_color, display_order) VALUES
  ('pendiente', 'Pendiente', '#fee2e2', '#991b1b', 1),
  ('en_curso', 'En Curso', '#fef9c3', '#854d0e', 2),
  ('ok', 'Ok', '#dcfce7', '#166534', 3),
  ('nuevo_doc', 'Nuevo Doc', '#dbeafe', '#1e40af', 4),
  ('no_aplica', 'No Aplica', '#f3f4f6', '#374151', 5);

-- Add section_id to emitters for section-specific emitters
ALTER TABLE public.patent_emitters 
  ADD COLUMN section_id uuid REFERENCES public.patent_checklist_sections(id) ON DELETE SET NULL;

-- Create junction table for item-specific emitters
CREATE TABLE public.patent_item_emitters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_item_id uuid NOT NULL REFERENCES public.patent_checklist_items(id) ON DELETE CASCADE,
  emitter_id uuid NOT NULL REFERENCES public.patent_emitters(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(checklist_item_id, emitter_id)
);

-- Enable RLS on junction table
ALTER TABLE public.patent_item_emitters ENABLE ROW LEVEL SECURITY;

-- Policies for junction table
CREATE POLICY "Admins can manage item emitters" ON public.patent_item_emitters
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view item emitters" ON public.patent_item_emitters
  FOR SELECT USING (auth.uid() IS NOT NULL);