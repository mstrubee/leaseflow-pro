-- Add next_actions field and update comments to support 500 characters
-- (TEXT type already supports unlimited, just documenting the intent)

ALTER TABLE public.contract_patents
  ADD COLUMN IF NOT EXISTS next_actions TEXT;

COMMENT ON COLUMN public.contract_patents.comments IS 'Comentarios y observaciones del checklist de patentes (máximo 500 caracteres)';
COMMENT ON COLUMN public.contract_patents.next_actions IS 'Próximas acciones del checklist de patentes (máximo 500 caracteres)';