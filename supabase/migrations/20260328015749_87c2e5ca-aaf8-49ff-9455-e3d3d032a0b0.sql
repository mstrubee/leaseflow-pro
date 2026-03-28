
-- Update trigger to use street for disambiguation on duplicate contract names
CREATE OR REPLACE FUNCTION public.create_general_folder_for_contract()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_root_id uuid;
  v_max_order int;
  v_prefix text;
  v_has_ap boolean;
  v_has_ag boolean;
  v_base_name text;
  v_folder_name text;
  v_street text;
  v_counter int := 2;
BEGIN
  SELECT id INTO v_root_id FROM general_folders WHERE is_contract_root = true LIMIT 1;
  IF v_root_id IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(MAX(display_order), 0) + 1 INTO v_max_order FROM general_folders WHERE parent_id = v_root_id;

  SELECT EXISTS(
    SELECT 1 FROM contract_companies cc
    JOIN companies co ON co.id = cc.company_id
    WHERE cc.contract_id = NEW.id AND co.name ILIKE '%autoplanet%'
  ) INTO v_has_ap;

  SELECT EXISTS(
    SELECT 1 FROM contract_companies cc
    JOIN companies co ON co.id = cc.company_id
    WHERE cc.contract_id = NEW.id AND co.name ILIKE '%agroplanet%'
  ) INTO v_has_ag;

  IF v_has_ap AND v_has_ag THEN v_prefix := 'AP/AG';
  ELSIF v_has_ap THEN v_prefix := 'AP';
  ELSIF v_has_ag THEN v_prefix := 'AG';
  ELSE v_prefix := NULL;
  END IF;

  IF v_prefix IS NOT NULL THEN
    v_base_name := v_prefix || ' - ' || NEW.name;
  ELSE
    v_base_name := NEW.name;
  END IF;

  v_folder_name := v_base_name;

  -- If name already exists, try to differentiate using street address
  IF EXISTS (SELECT 1 FROM general_folders WHERE parent_id = v_root_id AND name = v_folder_name) THEN
    SELECT ca.street INTO v_street
    FROM contract_addresses ca
    WHERE ca.contract_id = NEW.id
    LIMIT 1;

    IF v_street IS NOT NULL AND v_street != '' THEN
      v_folder_name := v_base_name || ' (' || v_street || ')';
    END IF;
  END IF;

  -- Final fallback: counter suffix
  WHILE EXISTS (
    SELECT 1 FROM general_folders
    WHERE parent_id = v_root_id
      AND name = v_folder_name
  ) LOOP
    v_folder_name := v_base_name || ' (' || v_counter || ')';
    v_counter := v_counter + 1;
  END LOOP;

  INSERT INTO general_folders (name, parent_id, display_order, contract_id)
  VALUES (v_folder_name, v_root_id, v_max_order, NEW.id)
  ON CONFLICT (contract_id) DO NOTHING;

  RETURN NEW;
END;
$function$;
