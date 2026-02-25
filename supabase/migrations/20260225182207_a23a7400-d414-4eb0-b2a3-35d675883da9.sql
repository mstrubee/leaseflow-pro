
ALTER TABLE public.maintenance_forms 
  ADD COLUMN IF NOT EXISTS sub_status_revisado_at timestamptz;

CREATE OR REPLACE FUNCTION public.track_maintenance_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.status_changed_at := now();
    INSERT INTO maintenance_status_history (form_id, field_changed, old_value, new_value, changed_by)
    VALUES (NEW.id, 'status', OLD.status, NEW.status, auth.uid());
  END IF;

  IF OLD.sub_status IS DISTINCT FROM NEW.sub_status THEN
    CASE NEW.sub_status
      WHEN 'solicitado' THEN NEW.sub_status_solicitado_at := now();
      WHEN 'revisado' THEN NEW.sub_status_revisado_at := now();
      WHEN 'pre_aprobado' THEN NEW.sub_status_pre_aprobado_at := now();
      WHEN 'evaluado' THEN NEW.sub_status_evaluado_at := now();
      WHEN 'cotizando' THEN NEW.sub_status_cotizando_at := now();
      WHEN 'en_ejecucion' THEN NEW.sub_status_en_ejecucion_at := now();
      WHEN 'resuelto' THEN NEW.sub_status_resuelto_at := now();
      ELSE NULL;
    END CASE;

    INSERT INTO maintenance_status_history (form_id, field_changed, old_value, new_value, changed_by)
    VALUES (NEW.id, 'sub_status', OLD.sub_status, NEW.sub_status, auth.uid());
  END IF;

  RETURN NEW;
END;
$function$;
