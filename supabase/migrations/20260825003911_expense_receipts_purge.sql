-- Purga automática de fotos de comprobantes de Rendición de Gastos: los
-- registros de expense_items se conservan, pero la foto (photo_path) se
-- elimina del storage 60 días después de subida (created_at). La
-- eliminación de storage.objects vía SQL directo está bloqueada
-- (storage.protect_objects_delete) — hay que pasar por la Storage API, por
-- eso el trabajo lo hace la Edge Function purge-expense-receipts, invocada
-- a diario por pg_cron a través de pg_net.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Secreto compartido: pg_cron lo envía en el header x-cron-secret y la Edge
-- Function lo valida contra su propio secret CRON_SECRET (mismo valor,
-- configurado por separado vía 'supabase secrets set'). Guardado en Vault
-- en vez de en texto plano en esta migración.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'expense_receipts_purge_secret') THEN
    PERFORM vault.create_secret(
      '9c4fa3802c286ba6b146d62101c06183a38ee925f29c87d1ba9a6ddfc5ac5dc4',
      'expense_receipts_purge_secret',
      'Header x-cron-secret que valida purge-expense-receipts (Rendición de Gastos)'
    );
  END IF;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('purge-expense-receipts-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- La Authorization lleva la anon key (pública, ya embebida en el frontend)
-- solo para satisfacer el gate de JWT de la plataforma de Edge Functions;
-- la autorización real la hace x-cron-secret dentro de la función.
SELECT cron.schedule(
  'purge-expense-receipts-daily',
  '15 4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ilcumthwzhmtumaklgvo.supabase.co/functions/v1/purge-expense-receipts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsY3VtdGh3emhtdHVtYWtsZ3ZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNjMxNjcsImV4cCI6MjA5NzYzOTE2N30.CfWXfprZk5YbsTAxJeJ9VQ1_r1KGEMIbzY69WGDkN8M',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'expense_receipts_purge_secret')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
