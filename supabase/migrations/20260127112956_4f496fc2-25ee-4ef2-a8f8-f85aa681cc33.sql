-- Add soft delete columns to budget_lines
ALTER TABLE public.budget_lines 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

-- Create audit table for budget_lines changes
CREATE TABLE IF NOT EXISTS public.budget_lines_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_line_id UUID NOT NULL,
  budget_id UUID NOT NULL,
  action TEXT NOT NULL, -- 'create', 'update', 'delete', 'restore'
  old_values JSONB,
  new_values JSONB,
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_budget_lines_deleted_at ON public.budget_lines(deleted_at);
CREATE INDEX IF NOT EXISTS idx_budget_lines_audit_line_id ON public.budget_lines_audit(budget_line_id);
CREATE INDEX IF NOT EXISTS idx_budget_lines_audit_budget_id ON public.budget_lines_audit(budget_id);

-- Enable RLS
ALTER TABLE public.budget_lines_audit ENABLE ROW LEVEL SECURITY;

-- RLS policies for audit table
CREATE POLICY "Authenticated users can view audit logs"
ON public.budget_lines_audit FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert audit logs"
ON public.budget_lines_audit FOR INSERT
TO authenticated
WITH CHECK (true);

-- Function to log budget line changes
CREATE OR REPLACE FUNCTION public.log_budget_line_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.budget_lines_audit (budget_line_id, budget_id, action, new_values, changed_by)
    VALUES (NEW.id, NEW.budget_id, 'create', to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Check if this is a soft delete
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      INSERT INTO public.budget_lines_audit (budget_line_id, budget_id, action, old_values, new_values, changed_by)
      VALUES (NEW.id, NEW.budget_id, 'delete', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    -- Check if this is a restore
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      INSERT INTO public.budget_lines_audit (budget_line_id, budget_id, action, old_values, new_values, changed_by)
      VALUES (NEW.id, NEW.budget_id, 'restore', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    ELSE
      INSERT INTO public.budget_lines_audit (budget_line_id, budget_id, action, old_values, new_values, changed_by)
      VALUES (NEW.id, NEW.budget_id, 'update', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

-- Create trigger for audit logging
DROP TRIGGER IF EXISTS budget_lines_audit_trigger ON public.budget_lines;
CREATE TRIGGER budget_lines_audit_trigger
AFTER INSERT OR UPDATE ON public.budget_lines
FOR EACH ROW
EXECUTE FUNCTION public.log_budget_line_change();