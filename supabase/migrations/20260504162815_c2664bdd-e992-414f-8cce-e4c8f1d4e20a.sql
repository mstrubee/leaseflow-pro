-- Add dependency type (start/end) and lag fields to gantt_task_dependencies
ALTER TABLE public.gantt_task_dependencies
  ADD COLUMN IF NOT EXISTS dep_type text NOT NULL DEFAULT 'end',
  ADD COLUMN IF NOT EXISTS lag_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lag_type text NOT NULL DEFAULT 'calendar';

-- Validate values via trigger (avoid CHECK with future flexibility)
CREATE OR REPLACE FUNCTION public.validate_gantt_dep_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.dep_type NOT IN ('start', 'end') THEN
    RAISE EXCEPTION 'dep_type must be start or end';
  END IF;
  IF NEW.lag_type NOT IN ('calendar', 'business') THEN
    RAISE EXCEPTION 'lag_type must be calendar or business';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_gantt_task_dep ON public.gantt_task_dependencies;
CREATE TRIGGER trg_validate_gantt_task_dep
  BEFORE INSERT OR UPDATE ON public.gantt_task_dependencies
  FOR EACH ROW EXECUTE FUNCTION public.validate_gantt_dep_fields();

-- Add dep_type to template dependencies (lag_days/lag_type already exist)
ALTER TABLE public.gantt_template_dependencies
  ADD COLUMN IF NOT EXISTS dep_type text NOT NULL DEFAULT 'end';

DROP TRIGGER IF EXISTS trg_validate_gantt_template_dep ON public.gantt_template_dependencies;
CREATE TRIGGER trg_validate_gantt_template_dep
  BEFORE INSERT OR UPDATE ON public.gantt_template_dependencies
  FOR EACH ROW EXECUTE FUNCTION public.validate_gantt_dep_fields();
