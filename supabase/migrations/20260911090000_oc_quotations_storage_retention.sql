-- El archivo de un "Requerimiento de OC" se sigue guardando siempre en Drive
-- (oc_quotations.file_path, sin cambios), pero además queda disponible en
-- Supabase Storage (oc_quotations.storage_path) por 30 días o hasta que el
-- requerimiento se convierta en Solicitud de OC (lo que ocurra primero).
-- Pasado ese plazo, la Edge Function cleanup-oc-quotation-files borra la
-- copia de Storage (storage_path pasa a null) -- la eliminación de
-- storage.objects vía SQL directo está bloqueada, hay que pasar por la
-- Storage API, por eso el trabajo lo hace la función, invocada a diario por
-- pg_cron a través de pg_net (mismo patrón que purge-expense-receipts).
ALTER TABLE public.oc_quotations
  ADD COLUMN IF NOT EXISTS storage_path TEXT NULL;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-oc-quotation-files-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- La Authorization lleva la anon key (pública, ya embebida en el frontend)
-- solo para satisfacer el gate de JWT de la plataforma de Edge Functions;
-- la autorización real la hace x-cron-secret dentro de la función, contra el
-- mismo secreto compartido ya usado por purge-expense-receipts.
SELECT cron.schedule(
  'cleanup-oc-quotation-files-daily',
  '45 4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ilcumthwzhmtumaklgvo.supabase.co/functions/v1/cleanup-oc-quotation-files',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsY3VtdGh3emhtdHVtYWtsZ3ZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNjMxNjcsImV4cCI6MjA5NzYzOTE2N30.CfWXfprZk5YbsTAxJeJ9VQ1_r1KGEMIbzY69WGDkN8M',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'expense_receipts_purge_secret')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
