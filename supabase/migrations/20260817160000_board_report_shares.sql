-- Compartir el Informe Directorio por link.
--
-- El informe lleva los Business Case completos (CAPEX, rentas, P&L, VAN), así
-- que NO va al bucket `repository-files`: ese es público y cualquiera con la
-- URL lo leería para siempre. Bucket propio y privado, y el acceso se da por
-- signed URL con vencimiento, que es lo que permite mandárselo a un director
-- sin cuenta en la aplicación.

INSERT INTO storage.buckets (id, name, public)
VALUES ('board-reports', 'board-reports', false)
ON CONFLICT (id) DO NOTHING;

-- Solo admins suben/leen/borran por la vía autenticada. Quien recibe el link
-- NO pasa por estas policies: la signed URL la firma el servicio de storage.
CREATE POLICY "Admins can read board reports"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'board-reports' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can upload board reports"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'board-reports' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete board reports"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'board-reports' AND public.has_role(auth.uid(), 'admin'));

-- Registro de lo compartido. Sin esto no habría forma de saber qué links
-- existen ni de revocarlos: una signed URL, una vez emitida, no se puede
-- invalidar salvo borrando el objeto que apunta.
CREATE TABLE IF NOT EXISTS public.board_report_shares (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year          TEXT        NOT NULL,
  file_name     TEXT        NOT NULL,
  storage_path  TEXT        NOT NULL UNIQUE,
  contract_ids  UUID[]      NOT NULL DEFAULT '{}',
  contract_count INTEGER    NOT NULL DEFAULT 0,
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,
  created_by    UUID        REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS board_report_shares_created_at_idx
  ON public.board_report_shares (created_at DESC);

ALTER TABLE public.board_report_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage board report shares"
  ON public.board_report_shares FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

COMMENT ON TABLE public.board_report_shares IS
  'Links compartidos del Informe Directorio. `storage_path` apunta al .pptx en el bucket privado board-reports; revocar = borrar el objeto y marcar revoked_at.';
