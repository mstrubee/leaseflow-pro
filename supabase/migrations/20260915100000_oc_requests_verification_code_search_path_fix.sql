-- Fix: hmac() (de pgcrypto) vive en el schema "extensions" en Supabase, no
-- en "public" -- la función set_oc_request_verification_code() tenía
-- `SET search_path = public`, así que no la encontraba
-- ("function hmac(text, text, unknown) does not exist"). Se agrega
-- "extensions" al search_path de la función.

CREATE OR REPLACE FUNCTION public.set_oc_request_verification_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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

-- Backfill: solicitudes creadas mientras el trigger fallaba se quedaron sin
-- código -- se les asigna uno ahora que la función ya funciona.
UPDATE public.oc_requests
SET updated_at = updated_at
WHERE verification_code IS NULL;

NOTIFY pgrst, 'reload schema';
