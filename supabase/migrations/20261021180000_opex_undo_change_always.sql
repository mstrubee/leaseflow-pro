-- Deshacer una fusión, renombre o retiro: SIEMPRE se puede (mientras no se hayan aplicado las categorías del año).
--
-- Antes se bloqueaba si la categoría final que creó la fusión ya tenía movimientos (por ejemplo, OPEX agregado
-- escrito en su fila). Ahora, en vez de bloquear, esos registros VUELVEN a una de las categorías originales
-- (la que elijas con p_move_to; si no se indica, la primera de la fusión por orden y nombre) y recién entonces
-- se elimina la categoría final, que la creó la misma fusión. No se pierde ningún monto ni registro:
--   * OPEX agregado de la planificación, OC y adicionales por local: pasan a la categoría elegida.
--   * Presupuesto maestro: se suma a la fila de la categoría elegida (respeta UNIQUE año + categoría).
--   * Proveedores vinculados a la categoría final: quedan vinculados a las categorías originales.
-- Si el lote que se deshace es el que creó la categoría final, se deshace la fusión completa (incluye las
-- categorías que se agregaron después con "Editar"). Un retiro, un lote que solo agregó categorías o una fusión hacia
-- una categoría que ya existía solo se desarman: la categoría final existente no se toca.
-- Devuelve cuántos registros se movieron.
DROP FUNCTION IF EXISTS public.undo_opex_category_change(UUID);

CREATE FUNCTION public.undo_opex_category_change(p_batch UUID, p_move_to UUID DEFAULT NULL) RETURNS JSONB
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_year INTEGER;
  v_to UUID;
  v_created BOOLEAN;
  v_sources UUID[];
  v_home UUID;
  v_n INTEGER;
  v_plan INTEGER := 0;
  v_oc INTEGER := 0;
  v_budget INTEGER := 0;
  v_additional INTEGER := 0;
  v_links INTEGER := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Solo un ADMIN puede cambiar categorías';
  END IF;
  SELECT year INTO v_year FROM opex_category_mappings WHERE batch_id = p_batch LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El cambio no existe';
  END IF;
  PERFORM public.opex_assert_category_year_open(v_year);

  SELECT to_category_id, bool_or(target_created) INTO v_to, v_created
  FROM opex_category_mappings WHERE batch_id = p_batch GROUP BY to_category_id;

  -- Retiro, lote que solo agregó categorías o fusión hacia una categoría que ya existía: no hay categoría creada.
  IF v_to IS NULL OR NOT v_created THEN
    UPDATE opex_categories SET valid_to_year = NULL, updated_at = now()
    WHERE id IN (SELECT from_category_id FROM opex_category_mappings WHERE batch_id = p_batch);
    DELETE FROM opex_category_mappings WHERE batch_id = p_batch;
    RETURN jsonb_build_object('final_category_deleted', false);
  END IF;

  -- Fusión creada por este lote: se deshace completa (todas las categorías que apuntan a la final, de cualquier lote).
  SELECT array_agg(from_category_id) INTO v_sources
  FROM opex_category_mappings WHERE year = v_year AND to_category_id = v_to;

  IF p_move_to IS NOT NULL AND NOT (p_move_to = ANY(v_sources)) THEN
    RAISE EXCEPTION 'La categoría elegida para recibir los montos no pertenece a la fusión';
  END IF;
  SELECT id INTO v_home FROM opex_categories
  WHERE id = coalesce(p_move_to, id) AND id = ANY(v_sources)
  ORDER BY display_order NULLS LAST, name, id LIMIT 1;

  -- Primero vuelven a estar vigentes los orígenes: así pueden recibir los registros (y el trigger de OC los acepta).
  UPDATE opex_categories SET valid_to_year = NULL, updated_at = now() WHERE id = ANY(v_sources);
  DELETE FROM opex_category_mappings WHERE year = v_year AND to_category_id = v_to;

  -- OPEX agregado de la planificación y OC (incluidas las eliminadas) vuelven a la categoría elegida.
  UPDATE opex_budget_plan_items SET category_id = v_home, updated_at = now() WHERE category_id = v_to;
  GET DIAGNOSTICS v_plan = ROW_COUNT;
  UPDATE purchase_orders SET opex_category_id = v_home WHERE opex_category_id = v_to;
  GET DIAGNOSTICS v_oc = ROW_COUNT;

  -- Presupuesto maestro: se suma a la fila de la categoría elegida (UNIQUE year + category_id).
  INSERT INTO opex_master_budget (year, category_id, amount_uf, amount_clp,
      month_01_clp, month_02_clp, month_03_clp, month_04_clp, month_05_clp, month_06_clp,
      month_07_clp, month_08_clp, month_09_clp, month_10_clp, month_11_clp, month_12_clp,
      uf_value_at_entry, notes)
  SELECT b.year, v_home, coalesce(sum(b.amount_uf), 0), sum(b.amount_clp),
      sum(b.month_01_clp), sum(b.month_02_clp), sum(b.month_03_clp), sum(b.month_04_clp),
      sum(b.month_05_clp), sum(b.month_06_clp), sum(b.month_07_clp), sum(b.month_08_clp),
      sum(b.month_09_clp), sum(b.month_10_clp), sum(b.month_11_clp), sum(b.month_12_clp),
      (array_agg(b.uf_value_at_entry))[1], 'Incluye montos de una fusión deshecha'
  FROM opex_master_budget b WHERE b.category_id = v_to GROUP BY b.year
  ON CONFLICT (year, category_id) DO UPDATE SET
    amount_uf = opex_master_budget.amount_uf + EXCLUDED.amount_uf,
    amount_clp = coalesce(opex_master_budget.amount_clp, 0) + coalesce(EXCLUDED.amount_clp, 0),
    month_01_clp = coalesce(opex_master_budget.month_01_clp, 0) + coalesce(EXCLUDED.month_01_clp, 0),
    month_02_clp = coalesce(opex_master_budget.month_02_clp, 0) + coalesce(EXCLUDED.month_02_clp, 0),
    month_03_clp = coalesce(opex_master_budget.month_03_clp, 0) + coalesce(EXCLUDED.month_03_clp, 0),
    month_04_clp = coalesce(opex_master_budget.month_04_clp, 0) + coalesce(EXCLUDED.month_04_clp, 0),
    month_05_clp = coalesce(opex_master_budget.month_05_clp, 0) + coalesce(EXCLUDED.month_05_clp, 0),
    month_06_clp = coalesce(opex_master_budget.month_06_clp, 0) + coalesce(EXCLUDED.month_06_clp, 0),
    month_07_clp = coalesce(opex_master_budget.month_07_clp, 0) + coalesce(EXCLUDED.month_07_clp, 0),
    month_08_clp = coalesce(opex_master_budget.month_08_clp, 0) + coalesce(EXCLUDED.month_08_clp, 0),
    month_09_clp = coalesce(opex_master_budget.month_09_clp, 0) + coalesce(EXCLUDED.month_09_clp, 0),
    month_10_clp = coalesce(opex_master_budget.month_10_clp, 0) + coalesce(EXCLUDED.month_10_clp, 0),
    month_11_clp = coalesce(opex_master_budget.month_11_clp, 0) + coalesce(EXCLUDED.month_11_clp, 0),
    month_12_clp = coalesce(opex_master_budget.month_12_clp, 0) + coalesce(EXCLUDED.month_12_clp, 0),
    updated_at = now();
  DELETE FROM opex_master_budget WHERE category_id = v_to;
  GET DIAGNOSTICS v_budget = ROW_COUNT;

  -- Adicionales por local: se suman por local (UNIQUE contract + year + category).
  INSERT INTO opex_local_additional (contract_id, year, category_id, amount_uf, notes)
  SELECT a.contract_id, a.year, v_home, sum(a.amount_uf),
         concat_ws('; ', string_agg(DISTINCT a.notes, '; '), 'fusión deshecha')
  FROM opex_local_additional a WHERE a.category_id = v_to GROUP BY a.contract_id, a.year
  ON CONFLICT (contract_id, year, category_id) DO UPDATE SET
    amount_uf = opex_local_additional.amount_uf + EXCLUDED.amount_uf,
    notes = concat_ws('; ', opex_local_additional.notes, 'Incluye montos de una fusión deshecha'),
    updated_at = now();
  DELETE FROM opex_local_additional WHERE category_id = v_to;
  GET DIAGNOSTICS v_additional = ROW_COUNT;

  -- Proveedores: lo vinculado a la categoría final queda vinculado a las categorías originales.
  INSERT INTO supplier_opex_categories (supplier_id, opex_category_id)
  SELECT s.supplier_id, src FROM supplier_opex_categories s CROSS JOIN unnest(v_sources) AS src
  WHERE s.opex_category_id = v_to
  ON CONFLICT (supplier_id, opex_category_id) DO NOTHING;
  GET DIAGNOSTICS v_links = ROW_COUNT;

  -- Ya nada apunta a la categoría final (la creó esta misma fusión): se elimina.
  DELETE FROM opex_categories WHERE id = v_to;

  RETURN jsonb_build_object(
    'final_category_deleted', true, 'moved_to_category_id', v_home,
    'plan_items_moved', v_plan, 'purchase_orders_moved', v_oc,
    'budget_rows_merged', v_budget, 'additional_rows_merged', v_additional, 'supplier_links_added', v_links);
END $$;

REVOKE EXECUTE ON FUNCTION public.undo_opex_category_change(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_opex_category_change(UUID, UUID) TO authenticated;

-- Refresca el caché de la API (evita "could not find the function" en funciones nuevas o con firma cambiada).
NOTIFY pgrst, 'reload schema';
