-- Clear drive_folder_id references that point to deleted/orphan OOCC Drive folders
-- For OOCC/Facturas under OC y FACTURAS where the drive_folder_id was from the orphan root
UPDATE repository_folders
SET drive_folder_id = NULL
WHERE lower(folder_type) IN ('oocc','facturas')
  AND parent_id IS NOT NULL
  AND drive_folder_id IS NOT NULL
  AND contract_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM repository_folders parent
    WHERE parent.id = repository_folders.parent_id
      AND parent.drive_folder_id IS NOT NULL
  );