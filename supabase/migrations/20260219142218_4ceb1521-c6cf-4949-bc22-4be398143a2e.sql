
-- 1. Create root "Patentes" folder
INSERT INTO repository_folders (name, parent_id, contract_id, folder_type, is_base_folder)
VALUES ('Patentes', NULL, NULL, 'patent_shared_contracts', true);

-- 2. Generate subfolders for all existing contracts with status = 'firmado'
INSERT INTO repository_folders (name, parent_id, contract_id, folder_type, is_base_folder)
SELECT
  array_to_string(
    ARRAY_REMOVE(
      ARRAY[
        CASE
          WHEN comp.name ILIKE '%agroplanet%' THEN 'AG'
          WHEN comp.name ILIKE '%autoplanet%' THEN 'AP'
          ELSE NULL
        END,
        cfv_codigo.field_value,
        cfv_cebe.field_value,
        c.name
      ],
      NULL
    ),
    ' - '
  ) AS folder_name,
  pf.id AS parent_id,
  NULL AS contract_id,
  'patent_contract_sub' AS folder_type,
  false AS is_base_folder
FROM contracts c
CROSS JOIN (
  SELECT id FROM repository_folders
  WHERE folder_type = 'patent_shared_contracts' AND contract_id IS NULL
  LIMIT 1
) pf
LEFT JOIN contract_companies cc ON cc.contract_id = c.id
LEFT JOIN companies comp ON comp.id = cc.company_id
LEFT JOIN contract_custom_field_values cfv_cebe
  ON cfv_cebe.contract_id = c.id
  AND cfv_cebe.field_id = '7abe8b1b-26de-4534-b8fc-60cec13e4109'
LEFT JOIN contract_custom_field_values cfv_codigo
  ON cfv_codigo.contract_id = c.id
  AND cfv_codigo.field_id = '3eae654b-cf1b-4c4e-903f-1e3d9098c80e'
WHERE c.status = 'firmado' AND c.deleted_at IS NULL;

-- 3. Create trigger function
CREATE OR REPLACE FUNCTION public.create_patent_contract_folder()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_parent_id UUID;
  v_company_name TEXT;
  v_prefix TEXT;
  v_cebe TEXT;
  v_codigo TEXT;
  v_folder_name TEXT;
  v_parts TEXT[];
  v_exists BOOLEAN;
BEGIN
  -- Find the Patentes root folder
  SELECT id INTO v_parent_id
  FROM repository_folders
  WHERE folder_type = 'patent_shared_contracts' AND contract_id IS NULL
  LIMIT 1;

  IF v_parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Determine company prefix
  SELECT comp.name INTO v_company_name
  FROM contract_companies cc
  JOIN companies comp ON comp.id = cc.company_id
  WHERE cc.contract_id = NEW.id
  LIMIT 1;

  IF v_company_name ILIKE '%agroplanet%' THEN
    v_prefix := 'AG';
  ELSIF v_company_name ILIKE '%autoplanet%' THEN
    v_prefix := 'AP';
  ELSE
    v_prefix := NULL;
  END IF;

  -- Get Codigo
  SELECT cfv.field_value INTO v_codigo
  FROM contract_custom_field_values cfv
  WHERE cfv.contract_id = NEW.id
    AND cfv.field_id = '3eae654b-cf1b-4c4e-903f-1e3d9098c80e';

  -- Get CEBE
  SELECT cfv.field_value INTO v_cebe
  FROM contract_custom_field_values cfv
  WHERE cfv.contract_id = NEW.id
    AND cfv.field_id = '7abe8b1b-26de-4534-b8fc-60cec13e4109';

  -- Build name from non-null parts
  v_parts := ARRAY_REMOVE(ARRAY[v_prefix, v_codigo, v_cebe, NEW.name], NULL);
  v_folder_name := array_to_string(v_parts, ' - ');

  -- Check if subfolder already exists
  SELECT EXISTS(
    SELECT 1 FROM repository_folders
    WHERE parent_id = v_parent_id AND name = v_folder_name
  ) INTO v_exists;

  IF NOT v_exists THEN
    INSERT INTO repository_folders (name, parent_id, contract_id, folder_type, is_base_folder)
    VALUES (v_folder_name, v_parent_id, NULL, 'patent_contract_sub', false);
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Create triggers
CREATE TRIGGER create_patent_folder_on_update
  AFTER UPDATE ON contracts
  FOR EACH ROW
  WHEN (NEW.status = 'firmado' AND OLD.status IS DISTINCT FROM 'firmado')
  EXECUTE FUNCTION create_patent_contract_folder();

CREATE TRIGGER create_patent_folder_on_insert
  AFTER INSERT ON contracts
  FOR EACH ROW
  WHEN (NEW.status = 'firmado')
  EXECUTE FUNCTION create_patent_contract_folder();
