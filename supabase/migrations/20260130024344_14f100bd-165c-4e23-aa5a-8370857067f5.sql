-- Add negotiation_notes column to contracts table
ALTER TABLE public.contracts
ADD COLUMN negotiation_notes text DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.contracts.negotiation_notes IS 'Notes specific to contract negotiation phase. Cleared when contract status changes to firmado.';

-- Create function to clear negotiation notes when contract becomes firmado
CREATE OR REPLACE FUNCTION public.clear_negotiation_notes_on_firmado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- If status is changing to 'firmado', clear negotiation notes
  IF NEW.status = 'firmado' AND (OLD.status IS NULL OR OLD.status != 'firmado') THEN
    NEW.negotiation_notes := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger to auto-clear notes
CREATE TRIGGER clear_negotiation_notes_trigger
BEFORE UPDATE ON public.contracts
FOR EACH ROW
EXECUTE FUNCTION public.clear_negotiation_notes_on_firmado();