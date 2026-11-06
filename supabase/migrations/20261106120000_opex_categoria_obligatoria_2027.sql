-- Desde 2027 una OC de OPEX no puede crearse (ni quedar) sin categoría OPEX.
--
-- Se amplía el trigger que ya valida la vigencia de la categoría (check_po_opex_category_year):
--   * Se considera OC de OPEX la que tiene budget_classification = 'OPEX' o un presupuesto OPEX maestro (opex_master_id).
--   * El año es el de la fecha de la OC (order_date); si no tiene fecha, el campo year.
--   * Solo rige desde el primer año de las categorías nuevas (2027, opex_first_category_year()): las OC anteriores
--     no se tocan y se siguen pudiendo editar igual que hoy.
--   * En una modificación solo se valida si cambia la categoría, la fecha, el año, la clasificación o el presupuesto
--     maestro; así una OC se puede seguir editando por otros motivos.
-- No cambia ni borra datos: solo rechaza guardados nuevos con un mensaje en español.
CREATE OR REPLACE FUNCTION public.check_po_opex_category_year() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_year INTEGER;
  v_name TEXT;
BEGIN
  v_year := coalesce(extract(year FROM NEW.order_date)::INTEGER, NEW.year);

  IF NEW.opex_category_id IS NULL THEN
    IF v_year >= public.opex_first_category_year()
       AND (NEW.budget_classification = 'OPEX' OR NEW.opex_master_id IS NOT NULL)
       AND (TG_OP = 'INSERT'
            OR NEW.order_date IS DISTINCT FROM OLD.order_date
            OR NEW.year IS DISTINCT FROM OLD.year
            OR NEW.opex_category_id IS DISTINCT FROM OLD.opex_category_id
            OR NEW.budget_classification IS DISTINCT FROM OLD.budget_classification
            OR NEW.opex_master_id IS DISTINCT FROM OLD.opex_master_id) THEN
      RAISE EXCEPTION 'Una OC de OPEX con fecha de % debe tener una categoría OPEX asignada', v_year
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.order_date IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.opex_category_id IS NOT DISTINCT FROM OLD.opex_category_id
     AND NEW.order_date IS NOT DISTINCT FROM OLD.order_date THEN
    RETURN NEW;
  END IF;
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

-- El trigger ahora también debe dispararse cuando cambian el año, la clasificación o el presupuesto maestro.
DROP TRIGGER IF EXISTS trg_po_opex_category_year ON public.purchase_orders;
CREATE TRIGGER trg_po_opex_category_year
  BEFORE INSERT OR UPDATE OF opex_category_id, order_date, year, budget_classification, opex_master_id ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.check_po_opex_category_year();

REVOKE EXECUTE ON FUNCTION public.check_po_opex_category_year() FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';
