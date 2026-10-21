-- Orden de aplicación: después de 20261020120000_opex_category_changes_2027.sql (usa sus funciones y tablas).
--
-- Editar una fusión de categorías OPEX (solo antes de "Aplicar categorías"): cambiar el nombre de la
-- categoría final, agregar categorías a la fusión y/o quitar categorías de ella. Todo o nada.
--
-- Una "fusión" es la categoría final (p_to_id) con todas las categorías que apuntan a ella en ese año.
-- Reglas:
--  * Solo ADMIN, solo desde 2027 y solo mientras "Aplicar categorías" no se haya ejecutado para ese año.
--  * Quitar: la categoría vuelve a estar vigente en p_year. La fusión debe conservar al menos una categoría
--    (para eliminarla por completo se usa "Deshacer").
--  * Agregar: pasan por las mismas validaciones de una fusión nueva (vigente, no creada para este año,
--    que no reciba otra fusión) y quedan como un lote aparte.
--  * Renombrar: solo si la categoría final la creó una fusión de ese año. Una categoría que ya existía también
--    rige para años anteriores, y renombrarla cambiaría esos reportes.
--  * Nunca toca OC, presupuestos ni montos.
CREATE OR REPLACE FUNCTION public.update_opex_category_merge(
  p_year INTEGER, p_to_id UUID, p_new_name TEXT, p_add UUID[], p_remove UUID[]
) RETURNS VOID
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_name TEXT := btrim(coalesce(p_new_name, ''));
  v_add UUID[] := coalesce(p_add, ARRAY[]::UUID[]);
  v_remove UUID[] := coalesce(p_remove, ARRAY[]::UUID[]);
  v_created BOOLEAN;
  v_current_name TEXT;
  v_remaining INTEGER;
  v_batch UUID;
BEGIN
  PERFORM public.opex_assert_category_year_open(p_year);

  IF NOT EXISTS (SELECT 1 FROM opex_category_mappings WHERE year = p_year AND to_category_id = p_to_id) THEN
    RAISE EXCEPTION 'La fusión no existe';
  END IF;
  SELECT name INTO v_current_name FROM opex_categories WHERE id = p_to_id FOR UPDATE;
  v_created := EXISTS (SELECT 1 FROM opex_category_mappings
                       WHERE year = p_year AND to_category_id = p_to_id AND target_created);

  -- 1) Quitar categorías de la fusión.
  IF cardinality(v_remove) > 0 THEN
    IF (SELECT count(DISTINCT x) FROM unnest(v_remove) x) <> cardinality(v_remove) THEN
      RAISE EXCEPTION 'Hay categorías repetidas';
    END IF;
    IF (SELECT count(*) FROM opex_category_mappings
        WHERE year = p_year AND to_category_id = p_to_id AND from_category_id = ANY(v_remove)) <> cardinality(v_remove) THEN
      RAISE EXCEPTION 'Alguna categoría a quitar no pertenece a esta fusión';
    END IF;
    DELETE FROM opex_category_mappings
    WHERE year = p_year AND to_category_id = p_to_id AND from_category_id = ANY(v_remove);
    UPDATE opex_categories SET valid_to_year = NULL, updated_at = now() WHERE id = ANY(v_remove);
  END IF;

  -- 2) Agregar categorías a la fusión.
  IF cardinality(v_add) > 0 THEN
    IF p_to_id = ANY(v_add) THEN
      RAISE EXCEPTION 'La categoría final no puede agregarse a su propia fusión';
    END IF;
    PERFORM public.opex_lock_sources_for_change(p_year, v_add);
    v_batch := gen_random_uuid();
    UPDATE opex_categories SET valid_to_year = p_year - 1, updated_at = now() WHERE id = ANY(v_add);
    INSERT INTO opex_category_mappings (batch_id, year, from_category_id, to_category_id, target_created)
    SELECT v_batch, p_year, f, p_to_id, false FROM unnest(v_add) f;
  END IF;

  -- 3) Debe quedar al menos una categoría en la fusión.
  SELECT count(*) INTO v_remaining
  FROM opex_category_mappings WHERE year = p_year AND to_category_id = p_to_id;
  IF v_remaining = 0 THEN
    RAISE EXCEPTION 'Una fusión necesita al menos una categoría: usa "Deshacer" para eliminarla';
  END IF;

  -- La marca "la categoría final la creó esta fusión" debe sobrevivir aunque se quiten las categorías que la tenían:
  -- pasa al lote más antiguo de los que quedan (Deshacer actúa por lote).
  IF v_created AND NOT EXISTS (SELECT 1 FROM opex_category_mappings
                               WHERE year = p_year AND to_category_id = p_to_id AND target_created) THEN
    UPDATE opex_category_mappings SET target_created = true
    WHERE year = p_year AND to_category_id = p_to_id
      AND batch_id = (SELECT batch_id FROM opex_category_mappings
                      WHERE year = p_year AND to_category_id = p_to_id ORDER BY created_at, id LIMIT 1);
  END IF;

  -- 4) Cambiar el nombre de la categoría final.
  IF v_name <> '' AND v_name <> v_current_name THEN
    IF NOT v_created THEN
      RAISE EXCEPTION 'La categoría final ya existía antes de esta fusión y su nombre también rige para años anteriores: no se renombra aquí';
    END IF;
    IF EXISTS (SELECT 1 FROM opex_categories WHERE lower(btrim(name)) = lower(v_name) AND id <> p_to_id) THEN
      RAISE EXCEPTION 'Ya existe una categoría llamada "%"', v_name;
    END IF;
    UPDATE opex_categories SET name = v_name, updated_at = now() WHERE id = p_to_id;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.update_opex_category_merge(INTEGER, UUID, TEXT, UUID[], UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_opex_category_merge(INTEGER, UUID, TEXT, UUID[], UUID[]) TO authenticated;
