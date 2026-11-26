-- CEBE por empresa para contratos con más de una empresa, y CEBE por Orden CO.
--
-- Hoy el CEBE es un único campo personalizado del contrato (contract_custom_fields
-- "cebe"), leído por muchos módulos. ESO NO SE TOCA: esta migración solo AGREGA.
--  * contract_cebes: N CEBE por contrato, cada uno asignado a UNA empresa del contrato.
--  * contract_co_orders.cebe_id: cada Orden CO puede asignarse a uno de esos CEBE.
--
-- Migración aditiva e idempotente. Aplicar solo al Supabase nuevo (rama `migration`).

CREATE TABLE IF NOT EXISTS public.contract_cebes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cebe text NOT NULL CHECK (length(btrim(cebe)) > 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Un mismo CEBE no puede repetirse dentro de un contrato (así pertenece a una sola empresa).
CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_cebes_contract_cebe
  ON public.contract_cebes (contract_id, lower(btrim(cebe)));
CREATE INDEX IF NOT EXISTS idx_contract_cebes_contract
  ON public.contract_cebes (contract_id, sort_order);

ALTER TABLE public.contract_cebes ENABLE ROW LEVEL SECURITY;

-- Lectura: igual que contract_companies (cualquier usuario autenticado)
DROP POLICY IF EXISTS "Authenticated users can view contract_cebes" ON public.contract_cebes;
CREATE POLICY "Authenticated users can view contract_cebes"
  ON public.contract_cebes FOR SELECT TO authenticated
  USING (true);

-- Escritura: admin o quien puede editar contratos
DROP POLICY IF EXISTS "Contract editors can manage contract_cebes" ON public.contract_cebes;
CREATE POLICY "Contract editors can manage contract_cebes"
  ON public.contract_cebes FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_permission(auth.uid(), 'contracts'::text, 'edit'::permission_type)
    OR public.has_permission(auth.uid(), 'contracts'::text, 'all'::permission_type)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_permission(auth.uid(), 'contracts'::text, 'edit'::permission_type)
    OR public.has_permission(auth.uid(), 'contracts'::text, 'all'::permission_type)
  );

DROP TRIGGER IF EXISTS update_contract_cebes_updated_at ON public.contract_cebes;
CREATE TRIGGER update_contract_cebes_updated_at
  BEFORE UPDATE ON public.contract_cebes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Cada Orden CO puede asignarse a un CEBE (opcional). Si se borra el CEBE, la CO queda sin asignar.
ALTER TABLE public.contract_co_orders
  ADD COLUMN IF NOT EXISTS cebe_id uuid REFERENCES public.contract_cebes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contract_co_orders_cebe ON public.contract_co_orders (cebe_id);

-- Integridad: el CEBE de una CO debe ser del mismo contrato que la CO.
CREATE OR REPLACE FUNCTION public.check_co_order_cebe_same_contract()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.cebe_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contract_cebes c
    WHERE c.id = NEW.cebe_id AND c.contract_id = NEW.contract_id
  ) THEN
    RAISE EXCEPTION 'El CEBE de la Orden CO debe pertenecer al mismo contrato'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_co_order_cebe_same_contract ON public.contract_co_orders;
CREATE TRIGGER check_co_order_cebe_same_contract
  BEFORE INSERT OR UPDATE OF cebe_id, contract_id ON public.contract_co_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.check_co_order_cebe_same_contract();
