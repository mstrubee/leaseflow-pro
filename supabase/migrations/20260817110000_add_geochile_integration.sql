-- ================================================================
-- Migration: add_geochile_integration
-- Date: 2026-08-17
-- Purpose:
--   Integración con geochile-compass (proyecto Supabase separado) para
--   importar proyecciones de venta hacia el Business Case Financiero:
--   1. geochile_integration_settings — URL base + API key, configuradas
--      desde Admin > Integraciones.
--   2. contract_isochrone_links — isócrona de geochile-compass asignada
--      a un contrato desde el Informe Directorio, con snapshot de la
--      proyección al momento de asignar.
-- ================================================================

-- ── 1. geochile_integration_settings ──
-- Fila única administrada desde Admin. base_url/api_key no son secretos
-- de build (no van en .env): son configurables en runtime porque cada
-- despliegue puede apuntar a un proyecto geochile-compass distinto.
CREATE TABLE public.geochile_integration_settings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_url   text NOT NULL,
  api_key    text NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.geochile_integration_settings ENABLE ROW LEVEL SECURITY;

-- Cualquier usuario autenticado necesita leerla para poder llamar la API
-- de geochile-compass desde el navegador (mismo patrón que otros tokens
-- de terceros usados client-side en este proyecto, ej. Mapbox).
CREATE POLICY "Authenticated can view geochile settings"
  ON public.geochile_integration_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage geochile settings"
  ON public.geochile_integration_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ── 2. contract_isochrone_links ──
-- Relación 1:1 (contract_id como PK): la isócrona VIGENTE asignada a
-- ese contrato. Reasignar reemplaza la fila anterior (no se acumula
-- historial, no hay un caso de uso para eso hoy).
CREATE TABLE public.contract_isochrone_links (
  contract_id        uuid PRIMARY KEY REFERENCES public.contracts(id) ON DELETE CASCADE,
  saved_isochrone_id text NOT NULL,
  isochrone_name     text NOT NULL,
  folder_name        text,
  projection         jsonb NOT NULL,
  assigned_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contract_isochrone_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view isochrone links"
  ON public.contract_isochrone_links FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can create isochrone links"
  ON public.contract_isochrone_links FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update isochrone links"
  ON public.contract_isochrone_links FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can delete isochrone links"
  ON public.contract_isochrone_links FOR DELETE
  TO authenticated
  USING (true);
