-- Distribución del gasto de una OC entre los CEBE de un local "mixto" (2 o más CEBE en
-- contract_cebes), y su desglose por CEBE en cada pago del plan de pagos.
--
-- Dos tablas nuevas, aditivas. No se modifica ninguna tabla ni columna existente.
--
--  * oc_cebe_distributions: reparto por CEBE de UN documento (Requerimiento, Solicitud
--    u OC). Un documento se identifica con exactamente una de estas tres claves, igual
--    que oc_payment_plans: quotation_number (Requerimiento), oc_request_id (Solicitud),
--    purchase_order_id (OC). Al avanzar en el flujo la distribución se COPIA al
--    documento siguiente.
--      amount_clp = verdad (pesos enteros, suman el total del documento).
--      percent    = derivado de amount_clp (4 decimales, cuadrado a 100).
--
--  * oc_payment_plan_cebes: sublíneas por CEBE de cada pago (oc_payment_plans). Se
--    generan a partir de la distribución del documento; al borrar el pago se borran solas.
--
-- Migración idempotente. Requiere antes 20261126120000_contract_cebes.sql.
-- Aplicar solo al Supabase nuevo (rama `migration`).

CREATE TABLE IF NOT EXISTS public.oc_cebe_distributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  quotation_number text,
  oc_request_id uuid REFERENCES public.oc_requests(id) ON DELETE CASCADE,
  purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  -- RESTRICT: no se puede borrar un CEBE que ya tiene gasto distribuido.
  cebe_id uuid NOT NULL REFERENCES public.contract_cebes(id) ON DELETE RESTRICT,
  percent numeric(9,4) NOT NULL CHECK (percent >= 0 AND percent <= 100),
  amount_clp numeric NOT NULL CHECK (amount_clp >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oc_cebe_distributions_one_document CHECK (
    (quotation_number IS NOT NULL)::int
    + (oc_request_id IS NOT NULL)::int
    + (purchase_order_id IS NOT NULL)::int = 1
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_oc_cebe_dist_request
  ON public.oc_cebe_distributions (oc_request_id, cebe_id) WHERE oc_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_oc_cebe_dist_po
  ON public.oc_cebe_distributions (purchase_order_id, cebe_id) WHERE purchase_order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_oc_cebe_dist_quotation
  ON public.oc_cebe_distributions (contract_id, quotation_number, cebe_id) WHERE quotation_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_oc_cebe_dist_cebe ON public.oc_cebe_distributions (cebe_id);

ALTER TABLE public.oc_cebe_distributions ENABLE ROW LEVEL SECURITY;

-- Mismos permisos que oc_payment_plans: lectura y gestión para usuarios autenticados.
DROP POLICY IF EXISTS "Authenticated users can view oc_cebe_distributions" ON public.oc_cebe_distributions;
CREATE POLICY "Authenticated users can view oc_cebe_distributions"
  ON public.oc_cebe_distributions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage oc_cebe_distributions" ON public.oc_cebe_distributions;
CREATE POLICY "Authenticated users can manage oc_cebe_distributions"
  ON public.oc_cebe_distributions FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP TRIGGER IF EXISTS update_oc_cebe_distributions_updated_at ON public.oc_cebe_distributions;
CREATE TRIGGER update_oc_cebe_distributions_updated_at
  BEFORE UPDATE ON public.oc_cebe_distributions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.oc_payment_plan_cebes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_plan_id uuid NOT NULL REFERENCES public.oc_payment_plans(id) ON DELETE CASCADE,
  cebe_id uuid NOT NULL REFERENCES public.contract_cebes(id) ON DELETE RESTRICT,
  percent numeric(9,4) NOT NULL CHECK (percent >= 0 AND percent <= 100),
  amount_clp numeric NOT NULL CHECK (amount_clp >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_plan_id, cebe_id)
);

CREATE INDEX IF NOT EXISTS idx_oc_payment_plan_cebes_cebe ON public.oc_payment_plan_cebes (cebe_id);

ALTER TABLE public.oc_payment_plan_cebes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view oc_payment_plan_cebes" ON public.oc_payment_plan_cebes;
CREATE POLICY "Authenticated users can view oc_payment_plan_cebes"
  ON public.oc_payment_plan_cebes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage oc_payment_plan_cebes" ON public.oc_payment_plan_cebes;
CREATE POLICY "Authenticated users can manage oc_payment_plan_cebes"
  ON public.oc_payment_plan_cebes FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
