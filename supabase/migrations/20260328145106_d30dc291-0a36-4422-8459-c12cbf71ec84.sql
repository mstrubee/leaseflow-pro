-- Move files from root "OC y FACTURAS" to OOCC where OOCC exists
UPDATE repository_files
SET folder_id = oocc.id
FROM repository_folders ocf
JOIN repository_folders oocc ON oocc.contract_id = ocf.contract_id
  AND lower(oocc.name) = 'oocc'
WHERE repository_files.folder_id = ocf.id
  AND ocf.name = 'OC y FACTURAS'
  AND ocf.parent_id IS NULL
  AND ocf.contract_id IS NOT NULL;

-- Delete all root "OC y FACTURAS" folders (now empty)
DELETE FROM repository_folders
WHERE id IN (
  SELECT rf.id
  FROM repository_folders rf
  WHERE rf.name = 'OC y FACTURAS'
    AND rf.parent_id IS NULL
    AND rf.contract_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM repository_files f WHERE f.folder_id = rf.id)
);