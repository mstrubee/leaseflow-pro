-- ================================================================
-- Migration: protect_privileged_profile_columns
-- Date: 2026-07-25
-- Purpose:
--   La política preexistente "Users can update own profile"
--   (USING (id = auth.uid()), sin WITH CHECK) permite a cualquier
--   usuario reescribir CUALQUIER columna de su propia fila de
--   profiles -- incluyendo las nuevas created_by/org_member_id/
--   invitation_status, y también email/is_active/profile_template_id.
--   Encontrado en la auditoría de seguridad de Fase 2: un
--   equipo_gerencia podría auto-reasignarse a otro gerente
--   (created_by) o marcar su propia invitación como 'active' sin
--   pasar por complete-invitation.
--
--   Fix: trigger BEFORE UPDATE que bloquea cambios a columnas
--   privilegiadas salvo que el caller sea service_role (Edge
--   Functions) o admin (UI de administración ya las edita
--   directamente hoy).
-- ================================================================

CREATE OR REPLACE FUNCTION public.protect_privileged_profile_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.org_member_id IS DISTINCT FROM OLD.org_member_id
     OR NEW.invitation_status IS DISTINCT FROM OLD.invitation_status
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.profile_template_id IS DISTINCT FROM OLD.profile_template_id
  THEN
    RAISE EXCEPTION 'No autorizado para modificar estos campos de perfil directamente';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_privileged_profile_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_privileged_profile_columns();
