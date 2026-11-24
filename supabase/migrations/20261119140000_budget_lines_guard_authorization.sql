-- Guarda de autorización en budget_lines.
--
-- Problema: la política "Users can update budget_lines with permission" deja que
-- cualquier usuario con permiso de edición de presupuesto modifique CUALQUIER columna,
-- incluido `status`. Que solo el admin pueda autorizar o rechazar hoy se controla
-- únicamente en la interfaz.
--
-- Este trigger lo exige en la base, sin tocar las políticas RLS:
--   * Quien NO es admin no puede:
--       - pasar una línea a "autorizado" ni sacarla de "autorizado";
--       - rechazar una solicitud ("solicita_autorizar" -> "no_autorizado");
--       - escribir rejected_at / rejection_note / rejected_by, salvo LIMPIARLAS al volver
--         a solicitar autorización (queda en "solicita_autorizar" con los tres en NULL).
--   * Sí conserva lo demás: pasar "no_autorizado" -> "solicita_autorizar" y cualquier
--     edición de monto/cantidad/etc. que no toque estas columnas.
--   * Sin usuario (auth.uid() NULL: service_role, Edge Functions con service key, SQL
--     Editor, migraciones, jobs) no se restringe nada.
--   * Solo UPDATE. No cubre INSERT a propósito: el cierre de año y "Actualizar plantilla"
--     insertan líneas conservando su estado "autorizado" y bloquearlo rompería esos flujos.
--
-- Reversión:
--   DROP TRIGGER IF EXISTS trg_budget_lines_guard_authorization ON public.budget_lines;
--   DROP FUNCTION IF EXISTS public.guard_budget_line_authorization();

CREATE OR REPLACE FUNCTION public.guard_budget_line_authorization()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_can_authorize boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Regla de negocio: solo el admin autoriza y rechaza (el permiso `budget_autorizar`
  -- ya no habilita nada). has_role es la misma función que usa la política RLS de admins.
  v_can_authorize := public.has_role(auth.uid(), 'admin'::app_role);

  IF v_can_authorize THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'autorizado' OR OLD.status = 'autorizado' THEN
      RAISE EXCEPTION 'No tienes permiso para autorizar ni des-autorizar líneas de presupuesto'
        USING ERRCODE = '42501';
    END IF;
    IF OLD.status = 'solicita_autorizar' AND NEW.status = 'no_autorizado' THEN
      RAISE EXCEPTION 'No tienes permiso para rechazar solicitudes de autorización'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.rejected_at IS DISTINCT FROM OLD.rejected_at
     OR NEW.rejection_note IS DISTINCT FROM OLD.rejection_note
     OR NEW.rejected_by IS DISTINCT FROM OLD.rejected_by THEN
    IF NOT (
      NEW.rejected_at IS NULL
      AND NEW.rejection_note IS NULL
      AND NEW.rejected_by IS NULL
      AND NEW.status = 'solicita_autorizar'
    ) THEN
      RAISE EXCEPTION 'No tienes permiso para registrar observaciones de rechazo'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_budget_lines_guard_authorization ON public.budget_lines;
CREATE TRIGGER trg_budget_lines_guard_authorization
  BEFORE UPDATE ON public.budget_lines
  FOR EACH ROW
  WHEN (
    OLD.status IS DISTINCT FROM NEW.status
    OR OLD.rejected_at IS DISTINCT FROM NEW.rejected_at
    OR OLD.rejection_note IS DISTINCT FROM NEW.rejection_note
    OR OLD.rejected_by IS DISTINCT FROM NEW.rejected_by
  )
  EXECUTE FUNCTION public.guard_budget_line_authorization();
