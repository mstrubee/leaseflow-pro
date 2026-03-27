
CREATE TABLE public.general_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.general_folders(id) ON DELETE CASCADE,
  display_order INT DEFAULT 0,
  drive_folder_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.general_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view general folders"
  ON public.general_folders FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage general folders"
  ON public.general_folders FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.general_folder_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID NOT NULL REFERENCES public.general_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  file_type TEXT,
  drive_file_id TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  uploaded_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.general_folder_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view general folder files"
  ON public.general_folder_files FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage general folder files"
  ON public.general_folder_files FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
