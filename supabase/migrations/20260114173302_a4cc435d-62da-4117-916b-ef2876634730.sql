-- Add comments field to contract_patents table for patent checklist observations
ALTER TABLE public.contract_patents
  ADD COLUMN IF NOT EXISTS comments TEXT;

COMMENT ON COLUMN public.contract_patents.comments IS 'Comentarios y observaciones del checklist de patentes (máximo 250 caracteres)';