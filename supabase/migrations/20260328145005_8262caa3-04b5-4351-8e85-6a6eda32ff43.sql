-- 1. Move files from root-level OC folders to OOCC folders (where both exist)
UPDATE repository_files
SET folder_id = oocc.id
FROM repository_folders oc
JOIN repository_folders oocc ON oocc.contract_id = oc.contract_id
  AND lower(oocc.name) = 'oocc'
  AND oocc.parent_id IS NOT NULL
WHERE repository_files.folder_id = oc.id
  AND lower(oc.name) in ('oc','facturas')
  AND oc.parent_id IS NULL
  AND oc.contract_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM contracts c WHERE c.id = oc.contract_id AND c.deleted_at IS NULL
  );

-- 2. Move files from sub-level OC/FACTURAS folders to sibling OOCC folders
UPDATE repository_files
SET folder_id = oocc.id
FROM repository_folders oc
JOIN repository_folders oocc ON oocc.contract_id = oc.contract_id
  AND lower(oocc.name) = 'oocc'
  AND oocc.parent_id = oc.parent_id
WHERE repository_files.folder_id = oc.id
  AND lower(oc.name) in ('oc','facturas')
  AND oc.parent_id IS NOT NULL
  AND oc.contract_id IS NOT NULL;

-- 3. Delete now-empty sub-level OC/FACTURAS folders that have OOCC siblings
DELETE FROM repository_folders
WHERE id IN (
  SELECT oc.id
  FROM repository_folders oc
  JOIN repository_folders oocc ON oocc.contract_id = oc.contract_id
    AND lower(oocc.name) = 'oocc'
    AND oocc.parent_id = oc.parent_id
  WHERE lower(oc.name) in ('oc','facturas')
    AND oc.parent_id IS NOT NULL
    AND oc.contract_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM repository_files f WHERE f.folder_id = oc.id)
);

-- 4. Delete now-empty root-level OC/Facturas folders that have a sub-level OOCC
DELETE FROM repository_folders
WHERE id IN (
  SELECT oc.id
  FROM repository_folders oc
  WHERE lower(oc.name) in ('oc','facturas')
    AND oc.parent_id IS NULL
    AND oc.contract_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM repository_files f WHERE f.folder_id = oc.id)
    AND EXISTS (
      SELECT 1 FROM repository_folders oocc
      WHERE oocc.contract_id = oc.contract_id AND lower(oocc.name) = 'oocc'
    )
);

-- 5. For contracts that ONLY have root OC (no OOCC anywhere), rename OC to OOCC
UPDATE repository_folders
SET name = 'OOCC', folder_type = 'oocc'
WHERE id IN (
  SELECT oc.id
  FROM repository_folders oc
  WHERE lower(oc.name) = 'oc'
    AND oc.contract_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM repository_folders oocc
      WHERE oocc.contract_id = oc.contract_id AND lower(oocc.name) = 'oocc'
    )
);

-- 6. Delete remaining empty root-level Facturas folders
DELETE FROM repository_folders
WHERE id IN (
  SELECT rf.id
  FROM repository_folders rf
  WHERE lower(rf.name) = 'facturas'
    AND rf.parent_id IS NULL
    AND rf.contract_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM repository_files f WHERE f.folder_id = rf.id)
);