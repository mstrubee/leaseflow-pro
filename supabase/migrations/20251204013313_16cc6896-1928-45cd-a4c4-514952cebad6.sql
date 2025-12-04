-- Add Google Drive IDs to repository tables
ALTER TABLE public.repository_folders 
ADD COLUMN drive_folder_id TEXT;

ALTER TABLE public.repository_files 
ADD COLUMN drive_file_id TEXT;

-- Add drive folder ID to contracts for the main project folder
ALTER TABLE public.contracts
ADD COLUMN drive_folder_id TEXT;