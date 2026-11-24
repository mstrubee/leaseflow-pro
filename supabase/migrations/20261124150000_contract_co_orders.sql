-- Órdenes CO por contrato/proyecto.
--
-- Reglas de negocio:
--  * Un contrato puede tener varias Órdenes CO (número + monto en PESOS / CLP).
--  * La suma de los montos CO es el "Monto Congelado" (aprobado por directorio)
--    del CAPEX del proyecto y reemplaza al valor guardado en
--    contract_budgets.frozen_amount_clp mientras exista al menos un monto CO > 0.
--  * El monto congelado se maneja en PESOS. La UF es solo un dato informativo:
--    frozen_amount_uf se mantiene (compatibilidad con Lovable) como equivalente.
--    (El reemplazo se calcula al leer; el valor anterior NO se borra, así que si
--    se eliminan las CO el monto congelado manual vuelve a regir.)
--  * El número de CO se copia ("snapshot") a cada Solicitud de OC CAPEX en
--    oc_requests.co_order_numbers.
--  * SOLO un admin puede crear/editar/borrar CO y modificar el monto congelado.
--
-- NOTA MIGRACIÓN: archivo nuevo, idempotente (IF NOT EXISTS / OR REPLACE). Aplicar
-- únicamente al Supabase nuevo (rama `migration`). No mergear a `main` sin
-- confirmación de Matias (Lovable podría ejecutarlo en producción).

-- 0) Las columnas frozen_* existen en producción (Lovable) pero ninguna migración
--    del repo las crea. Se declaran aquí para que la DB nueva las tenga.
--    frozen_amount_clp es la fuente de verdad (pesos); frozen_amount_uf es el
--    equivalente informativo / valor histórico anterior.
ALTER TABLE public.contract_budgets
  ADD COLUMN IF NOT EXISTS frozen_amount_clp numeric CHECK (frozen_amount_clp IS NULL OR frozen_amount_clp >= 0),
  ADD COLUMN IF NOT EXISTS frozen_amount_uf numeric,
  ADD COLUMN IF NOT EXISTS frozen_at timestamptz,
  ADD COLUMN IF NOT EXISTS frozen_by uuid;

-- 1) Tabla de Órdenes CO
CREATE TABLE IF NOT EXISTS public.contract_co_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  co_number text NOT NULL CHECK (length(btrim(co_number)) > 0),
  -- Pesos (CLP). NULL = CO sin monto todavía.
  amount_clp numeric CHECK (amount_clp IS NULL OR amount_clp >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX IF NOT EXISTS idx_contract_co_orders_contract
  ON public.contract_co_orders(contract_id, sort_order);

ALTER TABLE public.contract_co_orders ENABLE ROW LEVEL SECURITY;

-- Escritura: solo admin
DROP POLICY IF EXISTS "Admins can manage contract_co_orders" ON public.contract_co_orders;
CREATE POLICY "Admins can manage contract_co_orders"
  ON public.contract_co_orders FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Lectura: mismos permisos que contract_budgets (necesaria para armar la
-- Solicitud de OC y para calcular el monto congelado)
DROP POLICY IF EXISTS "Users can view contract_co_orders with permission" ON public.contract_co_orders;
CREATE POLICY "Users can view contract_co_orders with permission"
  ON public.contract_co_orders FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(), 'budget'::text, 'view'::permission_type)
    OR public.has_permission(auth.uid(), 'budget'::text, 'edit'::permission_type)
    OR public.has_permission(auth.uid(), 'budget'::text, 'all'::permission_type)
  );

DROP TRIGGER IF EXISTS update_contract_co_orders_updated_at ON public.contract_co_orders;
CREATE TRIGGER update_contract_co_orders_updated_at
  BEFORE UPDATE ON public.contract_co_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Snapshot de las CO en cada Solicitud de OC (solo se llena en CAPEX)
ALTER TABLE public.oc_requests
  ADD COLUMN IF NOT EXISTS co_order_numbers text;

-- 3) Solo admin puede cambiar el monto congelado.
--    Hoy cualquier usuario con permiso 'budget edit' puede hacer UPDATE sobre
--    contract_budgets; este trigger bloquea únicamente las columnas frozen_*.
--    auth.uid() NULL (service role / edge functions) queda permitido.
CREATE OR REPLACE FUNCTION public.guard_contract_budget_frozen_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND (NEW.frozen_amount_uf IS DISTINCT FROM OLD.frozen_amount_uf
          OR NEW.frozen_amount_clp IS DISTINCT FROM OLD.frozen_amount_clp
          OR NEW.frozen_at IS DISTINCT FROM OLD.frozen_at
          OR NEW.frozen_by IS DISTINCT FROM OLD.frozen_by)
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo un administrador puede modificar el monto congelado'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_contract_budget_frozen_amount ON public.contract_budgets;
CREATE TRIGGER guard_contract_budget_frozen_amount
  BEFORE UPDATE ON public.contract_budgets
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_contract_budget_frozen_amount();
