-- Add parent_id column to folder_templates for hierarchical subfolder support
ALTER TABLE public.folder_templates 
ADD COLUMN parent_id uuid REFERENCES public.folder_templates(id) ON DELETE CASCADE;

-- Create index for faster parent lookups
CREATE INDEX idx_folder_templates_parent_id ON public.folder_templates(parent_id);