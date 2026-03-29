-- Fix orphan OOCC/Facturas folders that are at root level but should be under "OC y FACTURAS"
-- Step 1: Move files from orphan folders to the correct child folder, then delete orphan
-- Step 2: If no correct child exists, reparent the orphan

DO $$
DECLARE
  v_orphan RECORD;
  v_oc_parent_id UUID;
  v_correct_child_id UUID;
BEGIN
  -- Process each orphan OOCC or Facturas folder at root level
  FOR v_orphan IN
    SELECT rf.id, rf.contract_id, rf.name, rf.folder_type, rf.drive_folder_id
    FROM repository_folders rf
    WHERE rf.contract_id IS NOT NULL
      AND rf.parent_id IS NULL
      AND lower(rf.folder_type) IN ('oocc', 'facturas')
    ORDER BY rf.contract_id
  LOOP
    -- Find the "OC y FACTURAS" parent for this contract
    SELECT id INTO v_oc_parent_id
    FROM repository_folders
    WHERE contract_id = v_orphan.contract_id
      AND lower(folder_type) = 'oc_y_facturas'
      AND parent_id IS NULL
    LIMIT 1;

    IF v_oc_parent_id IS NULL THEN
      -- No OC y FACTURAS parent exists, skip (shouldn't happen)
      RAISE NOTICE 'No OC y FACTURAS parent for contract %, skipping orphan %', v_orphan.contract_id, v_orphan.id;
      CONTINUE;
    END IF;

    -- Check if a correct child already exists under OC y FACTURAS
    SELECT id INTO v_correct_child_id
    FROM repository_folders
    WHERE contract_id = v_orphan.contract_id
      AND parent_id = v_oc_parent_id
      AND lower(folder_type) = lower(v_orphan.folder_type)
    LIMIT 1;

    IF v_correct_child_id IS NOT NULL AND v_correct_child_id != v_orphan.id THEN
      -- Correct child exists: move files from orphan to correct child, then delete orphan
      UPDATE repository_files
      SET folder_id = v_correct_child_id
      WHERE folder_id = v_orphan.id;

      DELETE FROM repository_folders WHERE id = v_orphan.id;
      
      RAISE NOTICE 'Merged orphan % into correct child % for contract %', v_orphan.id, v_correct_child_id, v_orphan.contract_id;
    ELSE
      -- No correct child: reparent the orphan under OC y FACTURAS
      UPDATE repository_folders
      SET parent_id = v_oc_parent_id, is_base_folder = false
      WHERE id = v_orphan.id;
      
      RAISE NOTICE 'Reparented orphan % under OC y FACTURAS for contract %', v_orphan.id, v_orphan.contract_id;
    END IF;
  END LOOP;
END $$;