-- Add status column to repository_files
ALTER TABLE public.repository_files 
ADD COLUMN status text DEFAULT 'pendiente';

-- Create table for custom folder statuses (admin can define per folder)
CREATE TABLE public.folder_statuses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  folder_id uuid NOT NULL REFERENCES public.repository_folders(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text DEFAULT '#6b7280',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(folder_id, name)
);

-- Enable RLS on folder_statuses
ALTER TABLE public.folder_statuses ENABLE ROW LEVEL SECURITY;

-- RLS policies for folder_statuses
CREATE POLICY "Allow all for authenticated users on folder_statuses"
ON public.folder_statuses
FOR ALL
USING (true)
WITH CHECK (true);

-- Create storage bucket for repository files
INSERT INTO storage.buckets (id, name, public)
VALUES ('repository-files', 'repository-files', true);

-- Storage policies for repository-files bucket
CREATE POLICY "Anyone can view repository files"
ON storage.objects FOR SELECT
USING (bucket_id = 'repository-files');

CREATE POLICY "Authenticated users can upload repository files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'repository-files' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update their repository files"
ON storage.objects FOR UPDATE
USING (bucket_id = 'repository-files' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete repository files"
ON storage.objects FOR DELETE
USING (bucket_id = 'repository-files' AND auth.role() = 'authenticated');