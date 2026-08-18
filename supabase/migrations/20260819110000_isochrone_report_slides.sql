-- ================================================================
-- Migration: isochrone_report_slides
-- Date: 2026-08-19
-- Purpose:
--   Stagear las 2 láminas PNG del "Informe directorio" que geochile-compass
--   expone vía export-report-slides (efímeras allá, ~48h), asociadas a un
--   contrato, hasta que se generen dentro del PPT del Informe Directorio.
--
--   Bucket privado (no repository-files, que es público): son imágenes con
--   datos comerciales/territoriales del análisis. Se guarda el PATH en la
--   tabla, no el binario — mismo patrón que board-reports.
-- ================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('isochrone-report-slides', 'isochrone-report-slides', false)
ON CONFLICT (id) DO NOTHING;

-- Cualquier autenticado (mismo alcance que contract_isochrone_links: no es
-- una función solo-admin, la usa cualquiera con acceso a Informe Directorio).
CREATE POLICY "Authenticated can read isochrone report slides"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'isochrone-report-slides');

CREATE POLICY "Authenticated can upload isochrone report slides"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'isochrone-report-slides');

CREATE POLICY "Authenticated can update isochrone report slides"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'isochrone-report-slides');

CREATE POLICY "Authenticated can delete isochrone report slides"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'isochrone-report-slides');

-- Relación 1:1 (contract_id como PK): el informe VIGENTE stageado para ese
-- contrato. Re-extraer reemplaza la fila anterior (y sus objetos en storage).
CREATE TABLE public.contract_isochrone_reports (
  contract_id        uuid PRIMARY KEY REFERENCES public.contracts(id) ON DELETE CASCADE,
  saved_isochrone_id text NOT NULL,
  isochrone_name     text NOT NULL,
  slide1_path        text NOT NULL,
  slide2_path        text,
  extracted_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  extracted_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contract_isochrone_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view isochrone reports"
  ON public.contract_isochrone_reports FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can create isochrone reports"
  ON public.contract_isochrone_reports FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update isochrone reports"
  ON public.contract_isochrone_reports FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can delete isochrone reports"
  ON public.contract_isochrone_reports FOR DELETE
  TO authenticated
  USING (true);
