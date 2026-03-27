
-- Add contract_id and is_contract_root to general_folders
ALTER TABLE general_folders ADD COLUMN contract_id uuid REFERENCES contracts(id) ON DELETE CASCADE;
ALTER TABLE general_folders ADD COLUMN is_contract_root boolean DEFAULT false;

-- Unique constraint only for non-null contract_id
CREATE UNIQUE INDEX unique_general_folder_contract ON general_folders (contract_id) WHERE contract_id IS NOT NULL;

-- Mark the existing "Contratos" folder as contract root
UPDATE general_folders SET is_contract_root = true WHERE id = 'dd628b93-e86d-412b-b319-aa80a93b567c';

-- Backfill subfolders for each existing contract
INSERT INTO general_folders (name, parent_id, display_order, contract_id)
SELECT 
  array_to_string(
    ARRAY_REMOVE(ARRAY[
      CASE WHEN comp.name ILIKE '%agroplanet%' THEN 'AG'
           WHEN comp.name ILIKE '%autoplanet%' THEN 'AP'
           ELSE NULL END,
      cfv_codigo.field_value,
      cfv_cebe.field_value,
      c.name
    ], NULL),
    ' - '
  ) AS folder_name,
  'dd628b93-e86d-412b-b319-aa80a93b567c'::uuid,
  ROW_NUMBER() OVER (ORDER BY c.name),
  c.id
FROM contracts c
LEFT JOIN LATERAL (
  SELECT comp2.name FROM contract_companies cc2 JOIN companies comp2 ON comp2.id = cc2.company_id WHERE cc2.contract_id = c.id LIMIT 1
) comp ON true
LEFT JOIN contract_custom_field_values cfv_codigo ON cfv_codigo.contract_id = c.id AND cfv_codigo.field_id = '3eae654b-cf1b-4c4e-903f-1e3d9098c80e'
LEFT JOIN contract_custom_field_values cfv_cebe ON cfv_cebe.contract_id = c.id AND cfv_cebe.field_id = '7abe8b1b-26de-4534-b8fc-60cec13e4109'
WHERE c.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- Trigger for auto-creating general subfolder on new contract
CREATE OR REPLACE FUNCTION public.create_general_folder_for_contract()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_root_id uuid;
  v_max_order int;
BEGIN
  SELECT id INTO v_root_id FROM general_folders WHERE is_contract_root = true LIMIT 1;
  IF v_root_id IS NULL THEN RETURN NEW; END IF;
  
  SELECT COALESCE(MAX(display_order), 0) + 1 INTO v_max_order FROM general_folders WHERE parent_id = v_root_id;
  
  INSERT INTO general_folders (name, parent_id, display_order, contract_id)
  VALUES (NEW.name, v_root_id, v_max_order, NEW.id)
  ON CONFLICT DO NOTHING;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER create_general_folder_on_contract
AFTER INSERT ON contracts
FOR EACH ROW
EXECUTE FUNCTION create_general_folder_for_contract();
