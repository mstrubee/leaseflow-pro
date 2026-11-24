-- ================================================================
-- Migration: expense_reports_lock
-- Date: 2026-08-25
-- Purpose:
--   Un informe "enviado" no se puede editar ni borrar. Solo un admin
--   puede conceder una excepción caso a caso (edit_unlocked) para
--   volver a habilitar la edición de sus gastos. Antes esto SOLO se
--   enforzaba en la UI (readOnly) — acá se enforza también en RLS,
--   porque un llamado directo al cliente de Supabase podía saltárselo.
-- ================================================================

ALTER TABLE public.expense_reports
  ADD COLUMN IF NOT EXISTS edit_unlocked boolean NOT NULL DEFAULT false;

-- Solo un admin puede pasar edit_unlocked de false a true. El dueño SÍ
-- puede volver a bloquearlo (true -> false), p.ej. al reenviar el
-- informe corregido.
CREATE OR REPLACE FUNCTION public.enforce_expense_report_unlock_admin_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.edit_unlocked = true AND OLD.edit_unlocked = false
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Solo un administrador puede habilitar la edición de un informe enviado';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expense_reports_unlock_admin_only ON public.expense_reports;
CREATE TRIGGER trg_expense_reports_unlock_admin_only
  BEFORE UPDATE ON public.expense_reports
  FOR EACH ROW EXECUTE FUNCTION public.enforce_expense_report_unlock_admin_only();

-- expense_reports: borrar un informe enviado queda reservado a admin,
-- sin excepción por edit_unlocked (el desbloqueo es solo para editar).
DROP POLICY IF EXISTS "expense_reports_delete" ON public.expense_reports;
CREATE POLICY "expense_reports_delete" ON public.expense_reports FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (created_by = auth.uid() AND status <> 'enviado')
  );

-- expense_items: insert/update/delete respetan el lock del informe
-- padre (patrón padre-hijo), salvo que esté edit_unlocked o sea admin.
DROP POLICY IF EXISTS "expense_items_insert" ON public.expense_items;
CREATE POLICY "expense_items_insert" ON public.expense_items FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.expense_reports r
      WHERE r.id = expense_items.expense_report_id
        AND r.created_by = auth.uid()
        AND (r.status <> 'enviado' OR r.edit_unlocked = true)
    )
  );

DROP POLICY IF EXISTS "expense_items_update" ON public.expense_items;
CREATE POLICY "expense_items_update" ON public.expense_items FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (
      created_by = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.expense_reports r
        WHERE r.id = expense_items.expense_report_id
          AND (r.status <> 'enviado' OR r.edit_unlocked = true)
      )
    )
  );

DROP POLICY IF EXISTS "expense_items_delete" ON public.expense_items;
CREATE POLICY "expense_items_delete" ON public.expense_items FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (
      created_by = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.expense_reports r
        WHERE r.id = expense_items.expense_report_id
          AND (r.status <> 'enviado' OR r.edit_unlocked = true)
      )
    )
  );
