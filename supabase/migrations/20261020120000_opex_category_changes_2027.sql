-- Categorías OPEX: renombrar, fusionar y retirar desde 2027 (el 2026 no se toca).
--
-- Reglas:
--  * Todo cambio rige desde el año indicado (mínimo 2027). Las OC, presupuestos y reportes
--    de 2026 conservan sus categorías y nombres.
--  * Nunca se borra una categoría que ya existía: "eliminar" = retirarla desde 2027
--    (valid_to_year = 2026).
--  * Fusionar, retirar y deshacer se hacen en funciones (todo o nada) y quedan bloqueadas
--    cuando "Aplicar categorías" ya se ejecutó para ese año (applied_at con valor).
--  * Las filas de 2027 que crea el cierre de 2026 (opex_master_budget, opex_local_additional)
--    nacen con las categorías antiguas; apply_opex_category_mappings las pasa a las nuevas.
--  * Una OC solo puede usar categorías vigentes en el año de su fecha de OC (trigger H).
--
-- Orden de aplicación: 20261016120000 (plan items), 20261016180000 (exclusiones) y luego este archivo.
-- Todas las funciones son SECURITY INVOKER: corren con los permisos (y el RLS) de quien las llama.

-- A) Vigencia por año en categorías (NULL = sin límite: todo sigue como hoy).
ALTER TABLE public.opex_categories
  ADD COLUMN valid_from_year INTEGER,
  ADD COLUMN valid_to_year INTEGER,
  ADD CONSTRAINT opex_categories_valid_years_check
    CHECK (valid_from_year IS NULL OR valid_to_year IS NULL OR valid_from_year <= valid_to_year);

-- B) Mapa "categoría antigua -> nueva" (to_category_id NULL = retirada sin destino).
CREATE TABLE public.opex_category_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id UUID NOT NULL,                        -- una fusión, renombre o retiro = un lote
  year INTEGER NOT NULL,                         -- primer año en que aplica
  from_category_id UUID NOT NULL REFERENCES public.opex_categories(id) ON DELETE RESTRICT,
  to_category_id UUID REFERENCES public.opex_categories(id) ON DELETE RESTRICT,
  target_created BOOLEAN NOT NULL DEFAULT false, -- la categoría destino la creó este lote
  applied_at TIMESTAMPTZ,                        -- se llena con "Aplicar categorías"
  created_by UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (year, from_category_id),
  CHECK (to_category_id IS NULL OR from_category_id <> to_category_id)
);
CREATE INDEX idx_opex_category_mappings_batch ON public.opex_category_mappings(batch_id);
ALTER TABLE public.opex_category_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view opex_category_mappings"
  ON public.opex_category_mappings FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can insert opex_category_mappings"
  ON public.opex_category_mappings FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update opex_category_mappings"
  ON public.opex_category_mappings FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete opex_category_mappings"
  ON public.opex_category_mappings FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- C) Ayudas internas.
-- Primer año en que se pueden redefinir categorías (un solo lugar para cambiarlo).
CREATE OR REPLACE FUNCTION public.opex_first_category_year() RETURNS INTEGER
LANGUAGE sql IMMUTABLE AS $$ SELECT 2027 $$;

-- Verifica ADMIN, año permitido y que "Aplicar categorías" no se haya ejecutado para ese año.
CREATE OR REPLACE FUNCTION public.opex_assert_category_year_open(p_year INTEGER) RETURNS VOID
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Solo un ADMIN puede cambiar categorías';
  END IF;
  IF p_year IS NULL OR p_year < public.opex_first_category_year() THEN
    RAISE EXCEPTION 'Las categorías nuevas rigen desde %: el año % no se puede cambiar',
      public.opex_first_category_year(), p_year;
  END IF;
  IF EXISTS (SELECT 1 FROM opex_category_mappings WHERE year = p_year AND applied_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Las categorías de % ya se aplicaron: no se pueden cambiar ni deshacer', p_year;
  END IF;
END $$;

-- Bloquea y valida las categorías de origen de una fusión o retiro.
CREATE OR REPLACE FUNCTION public.opex_lock_sources_for_change(p_year INTEGER, p_ids UUID[]) RETURNS VOID
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_src RECORD;
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) < 1 THEN
    RAISE EXCEPTION 'Selecciona al menos una categoría';
  END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(p_ids) x) <> cardinality(p_ids) THEN
    RAISE EXCEPTION 'Hay categorías repetidas';
  END IF;
  IF (SELECT count(*) FROM opex_categories WHERE id = ANY(p_ids)) <> cardinality(p_ids) THEN
    RAISE EXCEPTION 'Alguna categoría no existe';
  END IF;
  FOR v_src IN SELECT id, name, is_active, valid_from_year, valid_to_year
               FROM opex_categories WHERE id = ANY(p_ids) FOR UPDATE LOOP
    IF NOT v_src.is_active OR (v_src.valid_to_year IS NOT NULL AND v_src.valid_to_year < p_year) THEN
      RAISE EXCEPTION 'La categoría "%" ya no está vigente para %', v_src.name, p_year;
    END IF;
    IF v_src.valid_from_year IS NOT NULL AND v_src.valid_from_year >= p_year THEN
      RAISE EXCEPTION 'La categoría "%" nació para %: deshaz ese cambio primero', v_src.name, p_year;
    END IF;
  END LOOP;
  -- Sin cadenas (A -> B -> C en el mismo año): una categoría que recibe una fusión no se puede mover.
  IF EXISTS (SELECT 1 FROM opex_category_mappings WHERE year = p_year AND to_category_id = ANY(p_ids)) THEN
    RAISE EXCEPTION 'Una de las categorías ya recibe otra fusión: deshaz esa fusión primero';
  END IF;
END $$;

-- D) Fusionar (con un solo origen = renombrar). Devuelve el lote para poder deshacerlo.
CREATE OR REPLACE FUNCTION public.merge_opex_categories(
  p_year INTEGER, p_from UUID[], p_to_id UUID, p_to_name TEXT
) RETURNS UUID
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_batch UUID := gen_random_uuid();
  v_to UUID := p_to_id;
  v_created BOOLEAN := false;
  v_name TEXT := btrim(coalesce(p_to_name, ''));
BEGIN
  PERFORM public.opex_assert_category_year_open(p_year);
  PERFORM public.opex_lock_sources_for_change(p_year, p_from);

  IF v_to IS NOT NULL THEN
    IF v_to = ANY(p_from) THEN
      RAISE EXCEPTION 'El destino no puede ser una de las categorías a fusionar';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM opex_categories WHERE id = v_to AND is_active
                   AND (valid_from_year IS NULL OR valid_from_year <= p_year)
                   AND (valid_to_year IS NULL OR valid_to_year >= p_year)) THEN
      RAISE EXCEPTION 'La categoría destino no está vigente para %', p_year;
    END IF;
  ELSE
    IF v_name = '' THEN
      RAISE EXCEPTION 'Ingresa el nombre de la categoría final';
    END IF;
    IF EXISTS (SELECT 1 FROM opex_categories WHERE lower(btrim(name)) = lower(v_name)) THEN
      RAISE EXCEPTION 'Ya existe una categoría llamada "%": elígela como destino', v_name;
    END IF;
    INSERT INTO opex_categories (name, display_order, is_active, valid_from_year, created_by, supplier_category_id)
    SELECT v_name, min(display_order), true, p_year, auth.uid(),
           (array_agg(supplier_category_id) FILTER (WHERE supplier_category_id IS NOT NULL))[1]
    FROM opex_categories WHERE id = ANY(p_from)
    RETURNING id INTO v_to;
    v_created := true;
  END IF;

  UPDATE opex_categories SET valid_to_year = p_year - 1, updated_at = now() WHERE id = ANY(p_from);
  INSERT INTO opex_category_mappings (batch_id, year, from_category_id, to_category_id, target_created)
  SELECT v_batch, p_year, f, v_to, v_created FROM unnest(p_from) f;
  RETURN v_batch;
END $$;

-- E) Retirar ("eliminar") una categoría desde p_year, sin destino. Nunca borra la fila.
--    Si tiene montos para p_year, hay que fusionarla con otra categoría en vez de retirarla.
CREATE OR REPLACE FUNCTION public.retire_opex_category(p_year INTEGER, p_category_id UUID) RETURNS UUID
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_batch UUID := gen_random_uuid();
BEGIN
  PERFORM public.opex_assert_category_year_open(p_year);
  PERFORM public.opex_lock_sources_for_change(p_year, ARRAY[p_category_id]);
  IF EXISTS (SELECT 1 FROM opex_budget_plan_items WHERE year = p_year AND category_id = p_category_id)
     OR EXISTS (SELECT 1 FROM opex_master_budget WHERE year = p_year AND category_id = p_category_id
                AND (coalesce(amount_uf, 0) <> 0 OR coalesce(amount_clp, 0) <> 0))
     OR EXISTS (SELECT 1 FROM opex_local_additional WHERE year = p_year AND category_id = p_category_id
                AND coalesce(amount_uf, 0) <> 0) THEN
    RAISE EXCEPTION 'La categoría tiene presupuesto o montos agregados para %: fusiónala con otra categoría', p_year;
  END IF;
  UPDATE opex_categories SET valid_to_year = p_year - 1, updated_at = now() WHERE id = p_category_id;
  INSERT INTO opex_category_mappings (batch_id, year, from_category_id, to_category_id, target_created)
  VALUES (v_batch, p_year, p_category_id, NULL, false);
  RETURN v_batch;
END $$;

-- F) Deshacer una fusión, renombre o retiro (solo antes de "Aplicar categorías").
CREATE OR REPLACE FUNCTION public.undo_opex_category_change(p_batch UUID) RETURNS VOID
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_to UUID; v_created BOOLEAN; v_year INTEGER;
BEGIN
  SELECT year INTO v_year FROM opex_category_mappings WHERE batch_id = p_batch LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El cambio no existe';
  END IF;
  PERFORM public.opex_assert_category_year_open(v_year);

  SELECT to_category_id, target_created INTO v_to, v_created
  FROM opex_category_mappings WHERE batch_id = p_batch LIMIT 1;

  IF v_created AND (
       EXISTS (SELECT 1 FROM purchase_orders WHERE opex_category_id = v_to)
    OR EXISTS (SELECT 1 FROM opex_master_budget WHERE category_id = v_to)
    OR EXISTS (SELECT 1 FROM opex_local_additional WHERE category_id = v_to)
    OR EXISTS (SELECT 1 FROM opex_budget_plan_items WHERE category_id = v_to)
    OR EXISTS (SELECT 1 FROM supplier_opex_categories WHERE opex_category_id = v_to)
    OR EXISTS (SELECT 1 FROM opex_category_mappings WHERE batch_id <> p_batch
               AND (from_category_id = v_to OR to_category_id = v_to))) THEN
    RAISE EXCEPTION 'La categoría nueva ya tiene movimientos: no se puede deshacer';
  END IF;

  UPDATE opex_categories SET valid_to_year = NULL, updated_at = now()
  WHERE id IN (SELECT from_category_id FROM opex_category_mappings WHERE batch_id = p_batch);
  DELETE FROM opex_category_mappings WHERE batch_id = p_batch;
  IF v_created THEN
    DELETE FROM opex_categories WHERE id = v_to;  -- creada por este mismo lote y sin uso
  END IF;
END $$;

-- G) "Aplicar categorías": pasa las filas de p_year a las categorías nuevas. Todo o nada, y repetible:
--    solo procesa mapeos sin applied_at, así que una segunda ejecución no cambia nada.
CREATE OR REPLACE FUNCTION public.apply_opex_category_mappings(p_year INTEGER) RETURNS JSONB
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_t UUID;
  v_n INTEGER;
  v_bad TEXT;
  v_mappings INTEGER;
  v_budget INTEGER := 0;
  v_additional INTEGER := 0;
  v_items INTEGER;
  v_links INTEGER;
  v_oc_pending INTEGER;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Solo un ADMIN puede aplicar categorías';
  END IF;
  IF p_year IS NULL OR p_year < public.opex_first_category_year() THEN
    RAISE EXCEPTION 'Las categorías nuevas rigen desde %: el año % no se toca',
      public.opex_first_category_year(), p_year;
  END IF;
  -- Las filas de p_year las crea el cierre del año anterior: si no se cerró, no hay qué mover todavía.
  IF NOT EXISTS (SELECT 1 FROM opex_master_budget WHERE year = p_year - 1 AND is_closed) THEN
    RAISE EXCEPTION 'Primero hay que cerrar el año %', p_year - 1;
  END IF;
  -- Evita que dos personas apliquen a la vez.
  PERFORM 1 FROM opex_category_mappings WHERE year = p_year FOR UPDATE;

  -- Una categoría retirada sin destino no puede conservar montos: no se borran presupuestos en silencio.
  SELECT string_agg(c.name, ', ' ORDER BY c.name) INTO v_bad
  FROM opex_category_mappings m JOIN opex_categories c ON c.id = m.from_category_id
  WHERE m.year = p_year AND m.applied_at IS NULL AND m.to_category_id IS NULL
    AND (EXISTS (SELECT 1 FROM opex_master_budget b WHERE b.year = p_year AND b.category_id = m.from_category_id
                 AND (coalesce(b.amount_uf, 0) <> 0 OR coalesce(b.amount_clp, 0) <> 0))
      OR EXISTS (SELECT 1 FROM opex_local_additional a WHERE a.year = p_year AND a.category_id = m.from_category_id
                 AND coalesce(a.amount_uf, 0) <> 0)
      OR EXISTS (SELECT 1 FROM opex_budget_plan_items i WHERE i.year = p_year AND i.category_id = m.from_category_id));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Categorías retiradas con montos en %: deshaz el retiro y fusiónalas con otra (%)', p_year, v_bad;
  END IF;

  FOR v_t IN SELECT DISTINCT to_category_id FROM opex_category_mappings
             WHERE year = p_year AND applied_at IS NULL AND to_category_id IS NOT NULL LOOP
    -- Presupuesto maestro: suma las filas de origen en la del destino (UNIQUE year + category_id).
    INSERT INTO opex_master_budget (year, category_id, amount_uf, amount_clp,
        month_01_clp, month_02_clp, month_03_clp, month_04_clp, month_05_clp, month_06_clp,
        month_07_clp, month_08_clp, month_09_clp, month_10_clp, month_11_clp, month_12_clp,
        uf_value_at_entry, notes)
    SELECT p_year, v_t, coalesce(sum(b.amount_uf), 0), sum(b.amount_clp),
        sum(b.month_01_clp), sum(b.month_02_clp), sum(b.month_03_clp), sum(b.month_04_clp),
        sum(b.month_05_clp), sum(b.month_06_clp), sum(b.month_07_clp), sum(b.month_08_clp),
        sum(b.month_09_clp), sum(b.month_10_clp), sum(b.month_11_clp), sum(b.month_12_clp),
        (array_agg(b.uf_value_at_entry))[1], 'Incluye categorías fusionadas'
    FROM opex_master_budget b JOIN opex_category_mappings m ON m.from_category_id = b.category_id
    WHERE b.year = p_year AND m.year = p_year AND m.applied_at IS NULL AND m.to_category_id = v_t
    HAVING count(*) > 0
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
    DELETE FROM opex_master_budget b USING opex_category_mappings m
    WHERE b.year = p_year AND b.category_id = m.from_category_id
      AND m.year = p_year AND m.applied_at IS NULL AND m.to_category_id = v_t;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_budget := v_budget + v_n;

    -- Montos adicionales por local (arrastres del cierre): se suman por local (UNIQUE contract + year + category).
    INSERT INTO opex_local_additional (contract_id, year, category_id, amount_uf, notes)
    SELECT a.contract_id, p_year, v_t, sum(a.amount_uf),
           concat_ws('; ', string_agg(DISTINCT a.notes, '; '), 'categorías fusionadas')
    FROM opex_local_additional a JOIN opex_category_mappings m ON m.from_category_id = a.category_id
    WHERE a.year = p_year AND m.year = p_year AND m.applied_at IS NULL AND m.to_category_id = v_t
    GROUP BY a.contract_id
    ON CONFLICT (contract_id, year, category_id) DO UPDATE SET
      amount_uf = opex_local_additional.amount_uf + EXCLUDED.amount_uf,
      notes = concat_ws('; ', opex_local_additional.notes, 'Incluye categorías fusionadas'),
      updated_at = now();
    DELETE FROM opex_local_additional a USING opex_category_mappings m
    WHERE a.year = p_year AND a.category_id = m.from_category_id
      AND m.year = p_year AND m.applied_at IS NULL AND m.to_category_id = v_t;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_additional := v_additional + v_n;
  END LOOP;

  -- OPEX agregado de la planificación: pasa a la categoría nueva.
  UPDATE opex_budget_plan_items i SET category_id = m.to_category_id, updated_at = now()
  FROM opex_category_mappings m
  WHERE i.year = p_year AND i.category_id = m.from_category_id
    AND m.year = p_year AND m.applied_at IS NULL AND m.to_category_id IS NOT NULL;
  GET DIAGNOSTICS v_items = ROW_COUNT;

  -- Proveedores: se agrega el vínculo con la categoría nueva; los antiguos se conservan (sirven para 2026).
  INSERT INTO supplier_opex_categories (supplier_id, opex_category_id)
  SELECT DISTINCT s.supplier_id, m.to_category_id
  FROM supplier_opex_categories s JOIN opex_category_mappings m ON m.from_category_id = s.opex_category_id
  WHERE m.year = p_year AND m.applied_at IS NULL AND m.to_category_id IS NOT NULL
  ON CONFLICT (supplier_id, opex_category_id) DO NOTHING;
  GET DIAGNOSTICS v_links = ROW_COUNT;

  -- Solo informa (no modifica OC): OC de p_year que siguen con una categoría que cambió.
  SELECT count(*) INTO v_oc_pending
  FROM purchase_orders p
  WHERE p.deleted_at IS NULL
    AND (p.year = p_year OR p.order_date >= make_date(p_year, 1, 1))
    AND p.opex_category_id IN (SELECT from_category_id FROM opex_category_mappings WHERE year = p_year);

  UPDATE opex_category_mappings SET applied_at = now() WHERE year = p_year AND applied_at IS NULL;
  GET DIAGNOSTICS v_mappings = ROW_COUNT;

  RETURN jsonb_build_object(
    'mappings_applied', v_mappings, 'budget_rows_merged', v_budget, 'additional_rows_merged', v_additional,
    'plan_items_moved', v_items, 'supplier_links_added', v_links, 'purchase_orders_with_old_category', v_oc_pending);
END $$;

-- H) Una OC solo puede usar categorías vigentes en el año de su fecha de OC.
--    Sin cambios de categorías (valid_* en NULL) no tiene ningún efecto.
--    En UPDATE solo valida si la categoría o la fecha cambian de verdad: así una OC creada antes de una
--    fusión se puede seguir editando (por ejemplo, para agregarle una factura) aunque la app mande la fila completa.
CREATE OR REPLACE FUNCTION public.check_po_opex_category_year() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_year INTEGER;
  v_name TEXT;
BEGIN
  IF NEW.opex_category_id IS NULL OR NEW.order_date IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.opex_category_id IS NOT DISTINCT FROM OLD.opex_category_id
     AND NEW.order_date IS NOT DISTINCT FROM OLD.order_date THEN
    RETURN NEW;
  END IF;
  v_year := extract(year FROM NEW.order_date)::INTEGER;
  IF NOT EXISTS (SELECT 1 FROM opex_categories c WHERE c.id = NEW.opex_category_id
                 AND (c.valid_from_year IS NULL OR c.valid_from_year <= v_year)
                 AND (c.valid_to_year IS NULL OR c.valid_to_year >= v_year)) THEN
    SELECT name INTO v_name FROM opex_categories WHERE id = NEW.opex_category_id;
    RAISE EXCEPTION 'La categoría OPEX "%" no está vigente para una OC con fecha de %: elige una categoría vigente ese año',
      v_name, v_year
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_po_opex_category_year
  BEFORE INSERT OR UPDATE OF opex_category_id, order_date ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.check_po_opex_category_year();

-- I) Permisos.
-- Funciones que llama la app: solo usuarios con sesión (nada para anon ni PUBLIC).
REVOKE EXECUTE ON FUNCTION public.merge_opex_categories(INTEGER, UUID[], UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_opex_categories(INTEGER, UUID[], UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.retire_opex_category(INTEGER, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retire_opex_category(INTEGER, UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.undo_opex_category_change(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_opex_category_change(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_opex_category_mappings(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_opex_category_mappings(INTEGER) TO authenticated;

-- Funciones internas: sin acceso para PUBLIC ni anon. Las tres que usan las funciones de arriba conservan
-- EXECUTE para authenticated, porque al ser SECURITY INVOKER se ejecutan con los permisos de quien llama
-- (sin esto fallarían aunque la base no tenga permisos por defecto para authenticated).
REVOKE EXECUTE ON FUNCTION public.opex_first_category_year() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.opex_first_category_year() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.opex_assert_category_year_open(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.opex_assert_category_year_open(INTEGER) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.opex_lock_sources_for_change(INTEGER, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.opex_lock_sources_for_change(INTEGER, UUID[]) TO authenticated;
-- La función del trigger no necesita permiso de ejecución para dispararse.
REVOKE EXECUTE ON FUNCTION public.check_po_opex_category_year() FROM PUBLIC, anon;
