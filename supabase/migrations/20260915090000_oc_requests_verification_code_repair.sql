-- Repara/re-asegura el código de verificación de Solicitudes de OC (ver
-- 20260914180000_oc_requests_verification_code.sql). Reporte: "decía que no
-- existe" al verificar -- típico de PostgREST con el schema cache
-- desactualizado, o de que la función/trigger no haya quedado creada del
-- todo la primera vez. Este script es idempotente: se puede correr las
-- veces que haga falta sin romper nada.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.oc_verification_secret (
  id BOOLEAN PRIMARY KEY DEFAULT true,
  secret TEXT NOT NULL,
  CONSTRAINT oc_verification_secret_single_row CHECK (id = true)
);

ALTER TABLE public.oc_verification_secret ENABLE ROW LEVEL SECURITY;

INSERT INTO public.oc_verification_secret (id, secret)
VALUES (true, encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.oc_requests ADD COLUMN IF NOT EXISTS verification_code TEXT;

CREATE OR REPLACE FUNCTION public.set_oc_request_verification_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret TEXT;
  v_payload TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.verification_code IS NOT NULL THEN
    NEW.verification_code := OLD.verification_code;
    RETURN NEW;
  END IF;

  SELECT secret INTO v_secret FROM public.oc_verification_secret WHERE id = true;
  v_payload := NEW.id::text || '|' || COALESCE(NEW.sequence_number::text, '') || '|' ||
               NEW.contract_id::text || '|' || COALESCE(NEW.amount_clp, 0)::text || '|' ||
               NEW.request_date::text;
  NEW.verification_code := upper(substr(encode(hmac(v_payload, v_secret, 'sha256'), 'hex'), 1, 12));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_oc_requests_verification_code ON public.oc_requests;
CREATE TRIGGER trg_oc_requests_verification_code
  BEFORE INSERT OR UPDATE ON public.oc_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_oc_request_verification_code();

CREATE OR REPLACE FUNCTION public.verify_oc_request(p_id UUID, p_code TEXT)
RETURNS TABLE (
  is_valid BOOLEAN,
  request_number TEXT,
  sequence_number INTEGER,
  request_date DATE,
  amount_clp NUMERIC,
  project_name TEXT,
  line_name TEXT,
  supplier_name TEXT,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.oc_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.oc_requests WHERE id = p_id;

  IF NOT FOUND OR v_row.verification_code IS NULL OR v_row.verification_code <> upper(trim(p_code)) THEN
    RETURN QUERY SELECT false, NULL::text, NULL::integer, NULL::date, NULL::numeric, NULL::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    true,
    v_row.request_number,
    v_row.sequence_number,
    v_row.request_date,
    v_row.amount_clp,
    v_row.project_name,
    v_row.line_name,
    v_row.supplier_name,
    v_row.status;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_oc_request(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_oc_request(UUID, TEXT) TO anon, authenticated;

-- Backfill: solicitudes ya creadas antes de que el trigger existiera (o
-- mientras algo falló) se quedaron sin código -- se les asigna uno ahora
-- disparando el mismo trigger vía un UPDATE inocuo.
UPDATE public.oc_requests
SET updated_at = updated_at
WHERE verification_code IS NULL;

-- Fuerza a PostgREST a recargar su caché de funciones/columnas -- si la
-- función ya existía pero la API todavía no la "veía", esto lo soluciona
-- sin tener que esperar a que se recargue sola.
NOTIFY pgrst, 'reload schema';
