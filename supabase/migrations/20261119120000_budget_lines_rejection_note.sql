-- Rechazo de solicitudes de autorización ("Solicita Autorizar").
-- Un admin puede rechazar la solicitud: la línea vuelve a "No Autorizado" y queda
-- "Observada" con una observación opcional, visible en el contrato (globo sobre el
-- badge) y en /purchase-orders > "Solicita Autorización".
-- rejected_at es la marca de "Observado"; se limpia al volver a solicitar o autorizar.
-- Solo agrega columnas nullable a una tabla existente: no requiere GRANT nuevo
-- (los permisos de tabla y RLS de budget_lines siguen aplicando).
ALTER TABLE public.budget_lines
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_note text,
  ADD COLUMN IF NOT EXISTS rejected_by uuid;

COMMENT ON COLUMN public.budget_lines.rejected_at IS 'Cuándo un admin rechazó la solicitud de autorización (marca "Observado"). NULL = sin observación vigente.';
COMMENT ON COLUMN public.budget_lines.rejection_note IS 'Observación escrita por el admin al rechazar (opcional).';
COMMENT ON COLUMN public.budget_lines.rejected_by IS 'auth.users.id del admin que rechazó.';
