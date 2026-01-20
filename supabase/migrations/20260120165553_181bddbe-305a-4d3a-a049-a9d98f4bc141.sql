-- Add repository_folder_id to patent_checklist_sections for document storage location
ALTER TABLE public.patent_checklist_sections 
ADD COLUMN repository_folder_id uuid REFERENCES public.repository_folders(id) ON DELETE SET NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.patent_checklist_sections.repository_folder_id IS 'The default repository folder where documents for this section should be stored';