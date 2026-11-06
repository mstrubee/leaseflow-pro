-- Código de verificación anti-falsificación para "Solicitudes de OC".
--
-- Objetivo: si alguien imprime/edita una copia falsa de una Solicitud de OC
-- (cambia el monto, el proveedor, etc.), un tercero SIN acceso a la
-- plataforma (ej. el proveedor que la recibe) debe poder detectarlo
-- escaneando un QR / entrando a un link público, sin login.
--
-- Diseño:
--   1. oc_verification_secret: una sola fila con un secreto aleatorio.
--      Tiene RLS habilitado y CERO policies -- ni anon ni authenticated
--      pueden leerlo/escribirlo vía la API REST/RPC. Solo lo puede leer una
--      función SECURITY DEFINER (corre con privilegios de owner, no del rol
--      que la invoca).
--   2. oc_requests.verification_code: se calcula con un trigger BEFORE
--      INSERT (HMAC-SHA256 sobre id/correlativo/contrato + el secreto,
--      truncado a 12 hex). El mismo trigger, en UPDATE, preserva el código
--      ya asignado (no se puede pisar ni recalcular después de creada la
--      solicitud) -- "inalterable".
--   3. verify_oc_request(p_id, p_code): función pública (SECURITY DEFINER,
--      EXECUTE otorgado a anon) que compara el código recibido contra el
--      guardado y, si calza, devuelve los datos reales de la solicitud tal
--      como están HOY en la base -- así una copia falsificada con montos
--      alterados queda expuesta apenas se compara contra lo que muestra la
--      verificación.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.oc_verification_secret (
  id BOOLEAN PRIMARY KEY DEFAULT true,
  secret TEXT NOT NULL,
  CONSTRAINT oc_verification_secret_single_row CHECK (id = true)
);

ALTER TABLE public.oc_verification_secret ENABLE ROW LEVEL SECURITY;
-- A propósito, sin ninguna policy: bloquea todo acceso vía API (anon y
-- authenticated incluidos). Solo una función SECURITY DEFINER puede leerla.

INSERT INTO public.oc_verification_secret (id, secret)
VALUES (true, encode(gen_random_bytes(32), 'hex'));

ALTER TABLE public.oc_requests ADD COLUMN verification_code TEXT;

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
    -- Inalterable: una vez fijado en la creación, ningún UPDATE posterior
    -- (de la app o de cualquier otro origen) puede cambiarlo.
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

-- Nombre elegido a propósito para que ordene DESPUÉS de
-- trg_oc_requests_sequence_number alfabéticamente ("s" < "v"): los
-- triggers BEFORE INSERT de una misma tabla en Postgres se ejecutan en
-- orden alfabético por nombre, y este necesita que sequence_number ya esté
-- asignado (se incluye en el payload del HMAC).
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
