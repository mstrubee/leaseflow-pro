
-- Update existing contract folder names to show only prefix + contract name
UPDATE general_folders gf
SET name = array_to_string(
  ARRAY_REMOVE(ARRAY[
    CASE 
      WHEN comp_ag.name IS NOT NULL AND comp_ap.name IS NOT NULL THEN 'AP/AG'
      WHEN comp_ap.name IS NOT NULL THEN 'AP'
      WHEN comp_ag.name IS NOT NULL THEN 'AG'
      ELSE NULL
    END,
    c.name
  ], NULL),
  ' - '
)
FROM contracts c
LEFT JOIN LATERAL (
  SELECT comp2.name FROM contract_companies cc2 JOIN companies comp2 ON comp2.id = cc2.company_id WHERE cc2.contract_id = c.id AND comp2.name ILIKE '%autoplanet%' LIMIT 1
) comp_ap ON true
LEFT JOIN LATERAL (
  SELECT comp2.name FROM contract_companies cc2 JOIN companies comp2 ON comp2.id = cc2.company_id WHERE cc2.contract_id = c.id AND comp2.name ILIKE '%agroplanet%' LIMIT 1
) comp_ag ON true
WHERE gf.contract_id = c.id;

-- Update trigger to use simplified naming
CREATE OR REPLACE FUNCTION public.create_general_folder_for_contract()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_root_id uuid;
  v_max_order int;
  v_prefix text;
  v_has_ap boolean;
  v_has_ag boolean;
  v_folder_name text;
BEGIN
  SELECT id INTO v_root_id FROM general_folders WHERE is_contract_root = true LIMIT 1;
  IF v_root_id IS NULL THEN RETURN NEW; END IF;
  
  SELECT COALESCE(MAX(display_order), 0) + 1 INTO v_max_order FROM general_folders WHERE parent_id = v_root_id;

  SELECT EXISTS(SELECT 1 FROM contract_companies cc JOIN companies co ON co.id = cc.company_id WHERE cc.contract_id = NEW.id AND co.name ILIKE '%autoplanet%') INTO v_has_ap;
  SELECT EXISTS(SELECT 1 FROM contract_companies cc JOIN companies co ON co.id = cc.company_id WHERE cc.contract_id = NEW.id AND co.name ILIKE '%agroplanet%') INTO v_has_ag;

  IF v_has_ap AND v_has_ag THEN v_prefix := 'AP/AG';
  ELSIF v_has_ap THEN v_prefix := 'AP';
  ELSIF v_has_ag THEN v_prefix := 'AG';
  ELSE v_prefix := NULL;
  END IF;

  IF v_prefix IS NOT NULL THEN
    v_folder_name := v_prefix || ' - ' || NEW.name;
  ELSE
    v_folder_name := NEW.name;
  END IF;

  INSERT INTO general_folders (name, parent_id, display_order, contract_id)
  VALUES (v_folder_name, v_root_id, v_max_order, NEW.id)
  ON CONFLICT DO NOTHING;
  
  RETURN NEW;
END;
$$;
