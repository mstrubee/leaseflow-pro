-- ================================================================
-- Migration: oc_centro_mappings
-- Date: 2026-08-31
-- Purpose:
--   Recordar a qué contrato se asignó manualmente un código Centro de
--   SAP durante una importación masiva de OC, para no volver a pedirlo
--   en cargas futuras.
--
--   La UI de /purchase-orders/bulk-import ya prometía esto ("Los
--   marcados con Recordar quedarán guardados para futuros archivos"),
--   pero el campo `remember` nunca se persistía: el mapeo vivía solo en
--   memoria durante la importación y se perdía al terminar.
--
--   Se usa una tabla dedicada en vez de escribir el código en el campo
--   CEBE del contrato (que era la idea original del código). El CEBE es
--   un dato de negocio con formato propio (H####P####) y hay códigos
--   Centro alfanuméricos (p.ej. 04AE) que no encajan ahí: escribirlos
--   corrompería información real.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.oc_centro_mappings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Código tal como viene en la columna "Centro" del Excel, normalizado
  -- a mayúsculas sin espacios. UNIQUE: un código apunta a un solo
  -- contrato; reasignarlo es un UPDATE, no una segunda fila.
  centro_code  TEXT        NOT NULL UNIQUE,
  contract_id  UUID        NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  created_by   UUID        REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oc_centro_mappings_contract_id_idx
  ON public.oc_centro_mappings (contract_id);

ALTER TABLE public.oc_centro_mappings ENABLE ROW LEVEL SECURITY;

-- Mismo criterio que purchase_orders: admin total, y el resto según el
-- permiso granular de presupuestos. Sin la policy de SELECT la
-- importación no podría resolver los códigos recordados.
CREATE POLICY "Admins can manage oc_centro_mappings"
  ON public.oc_centro_mappings FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view oc_centro_mappings with permission"
  ON public.oc_centro_mappings FOR SELECT
  USING (
    has_permission(auth.uid(), 'budget', 'view') OR
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all')
  );

CREATE POLICY "Users can insert oc_centro_mappings with permission"
  ON public.oc_centro_mappings FOR INSERT
  WITH CHECK (
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all')
  );

CREATE POLICY "Users can update oc_centro_mappings with permission"
  ON public.oc_centro_mappings FOR UPDATE
  USING (
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all')
  );

CREATE POLICY "Users can delete oc_centro_mappings with permission"
  ON public.oc_centro_mappings FOR DELETE
  USING (
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all')
  );

COMMENT ON TABLE public.oc_centro_mappings IS
  'Código Centro de SAP → contrato, asignado a mano durante una importación masiva de OC. Evita volver a pedir la asignación en cargas futuras. No reemplaza al CEBE del contrato: es un mapeo aparte para códigos que el match automático no resuelve.';
