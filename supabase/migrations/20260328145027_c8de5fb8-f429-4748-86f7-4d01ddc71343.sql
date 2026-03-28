-- Delete all empty FACTURAS and "OC y FACTURAS" subfolders (inside parent folders)
-- These are legacy template remnants with 0 files
DELETE FROM repository_folders
WHERE id IN (
  SELECT rf.id
  FROM repository_folders rf
  WHERE lower(rf.name) in ('facturas','oc y facturas')
    AND rf.parent_id IS NOT NULL
    AND rf.contract_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM repository_files f WHERE f.folder_id = rf.id)
);