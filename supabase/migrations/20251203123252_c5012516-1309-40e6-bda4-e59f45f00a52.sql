-- Create repository folders table
CREATE TABLE public.repository_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.repository_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_base_folder BOOLEAN NOT NULL DEFAULT false,
  folder_type TEXT, -- For base folders: 'caso_negocio', 'due_diligence', etc.
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create repository files table
CREATE TABLE public.repository_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  folder_id UUID NOT NULL REFERENCES public.repository_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  file_type TEXT,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.repository_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repository_files ENABLE ROW LEVEL SECURITY;

-- RLS policies for folders
CREATE POLICY "Allow all for authenticated users on repository_folders"
ON public.repository_folders
FOR ALL
USING (true)
WITH CHECK (true);

-- RLS policies for files
CREATE POLICY "Allow all for authenticated users on repository_files"
ON public.repository_files
FOR ALL
USING (true)
WITH CHECK (true);