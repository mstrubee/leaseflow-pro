-- Carpetas de patentes: el CEBE del nombre sale de "CEBE por empresa" (contract_cebes).
--
-- create_patent_contract_folder() (trigger de contracts) armaba el nombre de la carpeta
-- "AP - código - CEBE - nombre" leyendo el CEBE del campo personalizado antiguo (por id fijo).
-- Ese campo se elimina, así que ahora lee todos los CEBE del contrato, separados por coma.
-- Solo cambia la obtención del CEBE; el resto de la función es idéntico a 20260219142218.
--
-- Aplicar ANTES de borrar el campo antiguo. Idempotente (CREATE OR REPLACE).
-- Aplicar solo al Supabase nuevo (rama `migration`).

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

  -- Get CEBE: ahora desde "CEBE por empresa" (todos, separados por coma), no desde el campo antiguo
  SELECT string_agg(ce.cebe, ', ' ORDER BY ce.sort_order, ce.created_at) INTO v_cebe
  FROM contract_cebes ce
  WHERE ce.contract_id = NEW.id;

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
