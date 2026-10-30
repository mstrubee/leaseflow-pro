-- Cambiar la categoría OPEX de una Solicitud de OC, todo o nada.
--
-- La imputación OPEX de una solicitud vive en oc_requests.opex_master_id. Si la solicitud ya se convirtió en
-- OC, el consumo del presupuesto se calcula desde purchase_orders (opex_master_id para el disponible,
-- opex_category_id para los reportes), así que hay que mover ambos lados a la vez. Hecho desde la app eran dos
-- escrituras separadas: si la segunda fallaba o se cortaba la conexión, la OC y la solicitud quedaban en
-- categorías distintas y el presupuesto descuadrado. En una función, Postgres las ejecuta en una sola
-- transacción: o se aplican las dos o no se aplica ninguna (incluido el error del trigger
-- trg_po_opex_category_year, que revierte todo).
--
-- SECURITY INVOKER (por defecto): corre con los permisos y el RLS de quien llama, igual que el resto de las
-- funciones OPEX. Además exige rol ADMIN.
--
-- Reversión: DROP FUNCTION public.change_oc_request_opex_line(UUID, UUID);
-- No crea tablas ni toca datos existentes.

CREATE OR REPLACE FUNCTION public.change_oc_request_opex_line(p_request_id UUID, p_opex_master_id UUID)
RETURNS VOID
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_req oc_requests%ROWTYPE;
  v_cur_year INTEGER;
  v_target RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Solo un ADMIN puede cambiar la línea OPEX de una solicitud';
  END IF;

  -- Bloquea la solicitud mientras dura el cambio, para que nadie la convierta o edite en paralelo.
  SELECT * INTO v_req FROM oc_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La solicitud no existe';
  END IF;
  IF v_req.budget_id IS NOT NULL OR v_req.opex_master_id IS NULL THEN
    RAISE EXCEPTION 'La solicitud no está imputada a una categoría OPEX';
  END IF;
  IF v_req.opex_master_id = p_opex_master_id THEN
    RETURN; -- sin cambios
  END IF;

  SELECT b.id, b.year, b.category_id, b.is_closed, c.name
    INTO v_target
    FROM opex_master_budget b
    LEFT JOIN opex_categories c ON c.id = b.category_id
   WHERE b.id = p_opex_master_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La categoría OPEX no existe';
  END IF;
  IF v_target.is_closed THEN
    RAISE EXCEPTION 'El presupuesto OPEX de esa categoría está cerrado';
  END IF;

  -- Debe ser del mismo año presupuestario que la imputación actual.
  SELECT year INTO v_cur_year FROM opex_master_budget WHERE id = v_req.opex_master_id;
  v_cur_year := COALESCE(v_cur_year, v_req.year);
  IF v_target.year <> v_cur_year THEN
    RAISE EXCEPTION 'La categoría debe ser del presupuesto OPEX de %', v_cur_year;
  END IF;

  IF v_req.status = 'converted' THEN
    IF v_req.purchase_order_id IS NULL THEN
      RAISE EXCEPTION 'La OC creada desde esta solicitud no está vinculada a ella: cambia la categoría directamente en la OC';
    END IF;
    UPDATE purchase_orders
       SET opex_master_id = v_target.id,
           opex_category_id = COALESCE(v_target.category_id, opex_category_id)
     WHERE id = v_req.purchase_order_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No se pudo actualizar la OC asociada (no existe o no hay permisos suficientes)';
    END IF;
  END IF;

  UPDATE oc_requests
     SET opex_master_id = v_target.id,
         line_name = COALESCE(v_target.name, v_req.line_name)
   WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se pudo actualizar la solicitud (sin permisos suficientes)';
  END IF;
END $$;

-- Solo usuarios con sesión (nada para anon ni PUBLIC); el control fino es el rol ADMIN de arriba.
REVOKE EXECUTE ON FUNCTION public.change_oc_request_opex_line(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_oc_request_opex_line(UUID, UUID) TO authenticated;
