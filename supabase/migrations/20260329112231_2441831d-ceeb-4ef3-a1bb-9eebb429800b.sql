-- Fix remaining orphan OOCC/Facturas: create missing "OC y FACTURAS" parent, then reparent
DO $$
DECLARE
  v_orphan RECORD;
  v_oc_parent_id UUID;
  v_correct_child_id UUID;
BEGIN
  FOR v_orphan IN
    SELECT rf.id, rf.contract_id, rf.name, rf.folder_type, rf.drive_folder_id
    FROM repository_folders rf
    WHERE rf.contract_id IS NOT NULL
      AND rf.parent_id IS NULL
      AND lower(rf.folder_type) IN ('oocc', 'facturas')
    ORDER BY rf.contract_id
  LOOP
    -- Find or create "OC y FACTURAS" parent
    SELECT id INTO v_oc_parent_id
    FROM repository_folders
    WHERE contract_id = v_orphan.contract_id
      AND lower(folder_type) = 'oc_y_facturas'
      AND parent_id IS NULL
    LIMIT 1;

    IF v_oc_parent_id IS NULL THEN
      INSERT INTO repository_folders (contract_id, name, folder_type, is_base_folder, parent_id)
      VALUES (v_orphan.contract_id, 'OC y FACTURAS', 'oc_y_facturas', true, NULL)
      RETURNING id INTO v_oc_parent_id;
    END IF;

    -- Check if correct child exists
    SELECT id INTO v_correct_child_id
    FROM repository_folders
    WHERE contract_id = v_orphan.contract_id
      AND parent_id = v_oc_parent_id
      AND lower(folder_type) = lower(v_orphan.folder_type)
    LIMIT 1;

    IF v_correct_child_id IS NOT NULL AND v_correct_child_id != v_orphan.id THEN
      UPDATE repository_files SET folder_id = v_correct_child_id WHERE folder_id = v_orphan.id;
      DELETE FROM repository_folders WHERE id = v_orphan.id;
    ELSE
      UPDATE repository_folders
      SET parent_id = v_oc_parent_id, is_base_folder = false
      WHERE id = v_orphan.id;
    END IF;
  END LOOP;
END $$;