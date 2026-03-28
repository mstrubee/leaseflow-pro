
-- 1. Trigger: When a folder_template is RENAMED, rename matching repository_folders across all contracts
CREATE OR REPLACE FUNCTION public.propagate_template_rename()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.name IS DISTINCT FROM NEW.name THEN
    UPDATE repository_folders
    SET name = NEW.name
    WHERE folder_type = OLD.folder_type
      AND contract_id IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_propagate_template_rename
AFTER UPDATE ON folder_templates
FOR EACH ROW
WHEN (OLD.name IS DISTINCT FROM NEW.name)
EXECUTE FUNCTION propagate_template_rename();

-- 2. Trigger: When a folder_template is MOVED (parent_id changes), move matching repository_folders
CREATE OR REPLACE FUNCTION public.propagate_template_move()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_contract RECORD;
  v_new_parent_folder_type TEXT;
  v_new_parent_id UUID;
BEGIN
  IF OLD.parent_id IS DISTINCT FROM NEW.parent_id THEN
    -- Get the folder_type of the new parent template (NULL if moving to root)
    IF NEW.parent_id IS NOT NULL THEN
      SELECT folder_type INTO v_new_parent_folder_type
      FROM folder_templates WHERE id = NEW.parent_id;
    END IF;

    -- For each contract that has this folder_type
    FOR v_contract IN
      SELECT DISTINCT contract_id FROM repository_folders
      WHERE folder_type = NEW.folder_type AND contract_id IS NOT NULL
    LOOP
      IF NEW.parent_id IS NULL THEN
        -- Moving to root
        UPDATE repository_folders
        SET parent_id = NULL, is_base_folder = true
        WHERE folder_type = NEW.folder_type AND contract_id = v_contract.contract_id;
      ELSE
        -- Find the new parent folder in this contract
        SELECT id INTO v_new_parent_id
        FROM repository_folders
        WHERE folder_type = v_new_parent_folder_type AND contract_id = v_contract.contract_id
        LIMIT 1;

        IF v_new_parent_id IS NOT NULL THEN
          UPDATE repository_folders
          SET parent_id = v_new_parent_id, is_base_folder = false
          WHERE folder_type = NEW.folder_type AND contract_id = v_contract.contract_id;
        END IF;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_propagate_template_move
AFTER UPDATE ON folder_templates
FOR EACH ROW
WHEN (OLD.parent_id IS DISTINCT FROM NEW.parent_id)
EXECUTE FUNCTION propagate_template_move();

-- 3. Trigger: When a folder_template is CREATED, create the folder in all existing contracts
CREATE OR REPLACE FUNCTION public.propagate_template_create()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_contract RECORD;
  v_parent_folder_type TEXT;
  v_parent_id UUID;
BEGIN
  -- Get parent folder_type if it has a parent
  IF NEW.parent_id IS NOT NULL THEN
    SELECT folder_type INTO v_parent_folder_type
    FROM folder_templates WHERE id = NEW.parent_id;
  END IF;

  -- For each contract (get distinct contract_ids from repository_folders)
  FOR v_contract IN
    SELECT DISTINCT contract_id FROM repository_folders WHERE contract_id IS NOT NULL
  LOOP
    IF NEW.parent_id IS NULL THEN
      -- Root folder: insert directly
      INSERT INTO repository_folders (contract_id, name, is_base_folder, folder_type, parent_id)
      VALUES (v_contract.contract_id, NEW.name, true, NEW.folder_type, NULL)
      ON CONFLICT DO NOTHING;
    ELSE
      -- Subfolder: find the parent in this contract
      SELECT id INTO v_parent_id
      FROM repository_folders
      WHERE folder_type = v_parent_folder_type AND contract_id = v_contract.contract_id
      LIMIT 1;

      IF v_parent_id IS NOT NULL THEN
        INSERT INTO repository_folders (contract_id, name, is_base_folder, folder_type, parent_id)
        VALUES (v_contract.contract_id, NEW.name, false, NEW.folder_type, v_parent_id)
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_propagate_template_create
AFTER INSERT ON folder_templates
FOR EACH ROW
EXECUTE FUNCTION propagate_template_create();

-- 4. Trigger: When a folder_template is DELETED, move files to "Eliminados" folder and delete the folders
CREATE OR REPLACE FUNCTION public.propagate_template_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_contract RECORD;
  v_folder RECORD;
  v_eliminados_id UUID;
BEGIN
  -- For each contract that has folders with this folder_type
  FOR v_contract IN
    SELECT DISTINCT contract_id FROM repository_folders
    WHERE folder_type = OLD.folder_type AND contract_id IS NOT NULL
  LOOP
    -- Find or create "Eliminados" folder for this contract
    SELECT id INTO v_eliminados_id
    FROM repository_folders
    WHERE contract_id = v_contract.contract_id
      AND folder_type = '_eliminados'
      AND parent_id IS NULL
    LIMIT 1;

    IF v_eliminados_id IS NULL THEN
      INSERT INTO repository_folders (contract_id, name, is_base_folder, folder_type, parent_id)
      VALUES (v_contract.contract_id, 'Eliminados', true, '_eliminados', NULL)
      RETURNING id INTO v_eliminados_id;
    END IF;

    -- For each folder of this type in this contract
    FOR v_folder IN
      SELECT id FROM repository_folders
      WHERE folder_type = OLD.folder_type AND contract_id = v_contract.contract_id
    LOOP
      -- Move all files from this folder to "Eliminados"
      UPDATE repository_files
      SET folder_id = v_eliminados_id
      WHERE folder_id = v_folder.id;

      -- Delete the folder
      DELETE FROM repository_folders WHERE id = v_folder.id;
    END LOOP;
  END LOOP;

  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_propagate_template_delete
BEFORE DELETE ON folder_templates
FOR EACH ROW
EXECUTE FUNCTION propagate_template_delete();
