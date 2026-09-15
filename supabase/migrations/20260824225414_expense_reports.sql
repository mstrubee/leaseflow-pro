-- ================================================================
-- Migration: expense_reports
-- Date: 2026-08-24
-- Purpose:
--   "Rendición de Gastos" para usuarios con rol operador_terreno —
--   informes de gasto (expense_reports) con líneas individuales
--   (expense_items: foto de comprobante + datos del gasto). Bucket
--   privado nuevo para las fotos (RUT, montos y nombre de proveedor
--   son datos sensibles, igual criterio que isochrone-report-slides).
-- ================================================================

CREATE TABLE public.expense_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL,
  status      text NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador', 'enviado')),
  sent_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.expense_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_report_id  uuid NOT NULL REFERENCES public.expense_reports(id) ON DELETE CASCADE,
  created_by         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- path en el bucket expense-receipts (no una URL pública) — ver storageUtils.ts
  photo_path         text,
  expense_type       text CHECK (expense_type IN ('comidas_individuales', 'transporte', 'alojamiento', 'materiales', 'otros')),
  transaction_date   date,
  business_purpose   text,
  purchase_city      text,
  payment_type       text CHECK (payment_type IN ('efectivo', 'caja_chica', 'fondos_por_rendir')),
  total_amount       numeric(14, 2),
  currency           text,
  tax_amount         numeric(14, 2),
  has_receipt        boolean,
  receipt_type       text CHECK (receipt_type IN ('boleta', 'deposito', 'factura', 'recibo')),
  provider_rut       text,
  provider_name      text,
  receipt_number     text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON public.expense_items (expense_report_id);
CREATE INDEX ON public.expense_reports (created_by, status);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_expense_reports_updated_at
  BEFORE UPDATE ON public.expense_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_expense_items_updated_at
  BEFORE UPDATE ON public.expense_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.expense_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_items ENABLE ROW LEVEL SECURITY;

-- Dueño (created_by) + admin (has_role ya existe, mismo patrón que
-- supabase/migrations/20251203124225_*.sql).
CREATE POLICY "expense_reports_select" ON public.expense_reports FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "expense_reports_insert" ON public.expense_reports FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "expense_reports_update" ON public.expense_reports FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "expense_reports_delete" ON public.expense_reports FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "expense_items_select" ON public.expense_items FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "expense_items_insert" ON public.expense_items FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "expense_items_update" ON public.expense_items FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "expense_items_delete" ON public.expense_items FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Bucket privado para fotos de comprobantes (mismo template que
-- supabase/migrations/20260819110000_isochrone_report_slides.sql).
INSERT INTO storage.buckets (id, name, public) VALUES ('expense-receipts', 'expense-receipts', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated can read expense receipts" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'expense-receipts');
CREATE POLICY "Authenticated can upload expense receipts" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'expense-receipts');
CREATE POLICY "Authenticated can update expense receipts" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'expense-receipts');
CREATE POLICY "Authenticated can delete expense receipts" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'expense-receipts');
