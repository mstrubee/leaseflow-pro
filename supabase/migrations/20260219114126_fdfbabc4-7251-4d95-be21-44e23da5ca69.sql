
-- Tabla de historial
CREATE TABLE public.maintenance_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.maintenance_forms(id) ON DELETE CASCADE,
  field_changed text NOT NULL,
  old_value text,
  new_value text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid
);

ALTER TABLE public.maintenance_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON public.maintenance_status_history
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert" ON public.maintenance_status_history
  FOR INSERT TO authenticated WITH CHECK (true);

-- Columnas de fecha en maintenance_forms
ALTER TABLE public.maintenance_forms
  ADD COLUMN status_changed_at timestamptz,
  ADD COLUMN sub_status_solicitado_at timestamptz,
  ADD COLUMN sub_status_pre_aprobado_at timestamptz,
  ADD COLUMN sub_status_evaluado_at timestamptz,
  ADD COLUMN sub_status_cotizando_at timestamptz,
  ADD COLUMN sub_status_en_ejecucion_at timestamptz,
  ADD COLUMN sub_status_resuelto_at timestamptz;

-- Trigger function
CREATE OR REPLACE FUNCTION public.track_maintenance_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.status_changed_at := now();
    INSERT INTO maintenance_status_history (form_id, field_changed, old_value, new_value, changed_by)
    VALUES (NEW.id, 'status', OLD.status, NEW.status, auth.uid());
  END IF;

  IF OLD.sub_status IS DISTINCT FROM NEW.sub_status THEN
    CASE NEW.sub_status
      WHEN 'solicitado' THEN NEW.sub_status_solicitado_at := now();
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
$$;

CREATE TRIGGER trg_maintenance_status_change
  BEFORE UPDATE ON public.maintenance_forms
  FOR EACH ROW
  EXECUTE FUNCTION public.track_maintenance_status_change();

-- Seed: approximate dates for existing resolved forms
UPDATE maintenance_forms
SET sub_status_resuelto_at = updated_at
WHERE sub_status = 'resuelto' AND sub_status_resuelto_at IS NULL;
