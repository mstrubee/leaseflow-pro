import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const RECEIPTS_BUCKET = "expense-receipts";
const RETENTION_DAYS = 60;
const STORAGE_PREFIX = `storage://${RECEIPTS_BUCKET}/`;

// Invocado a diario por pg_cron (ver migración expense_receipts_purge). El
// gate de JWT de la plataforma se satisface con la anon key (pública); la
// autorización real es el header x-cron-secret contra CRON_SECRET, guardado
// también en Vault para que el job de cron lo envíe.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const cronSecret = Deno.env.get("CRON_SECRET");
    const providedSecret = req.headers.get("x-cron-secret");
    if (!cronSecret || providedSecret !== cronSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: items, error: fetchErr } = await admin
      .from("expense_items")
      .select("id, photo_path")
      .not("photo_path", "is", null)
      .lt("created_at", cutoff);

    if (fetchErr) throw fetchErr;

    let purged = 0;
    const errors: string[] = [];

    for (const item of items ?? []) {
      const path = item.photo_path?.startsWith(STORAGE_PREFIX)
        ? item.photo_path.slice(STORAGE_PREFIX.length)
        : null;
      if (!path) continue;

      const { error: removeErr } = await admin.storage.from(RECEIPTS_BUCKET).remove([path]);
      if (removeErr) {
        errors.push(`${item.id}: ${removeErr.message}`);
        continue;
      }

      const { error: updateErr } = await admin
        .from("expense_items")
        .update({ photo_path: null })
        .eq("id", item.id);
      if (updateErr) {
        errors.push(`${item.id}: ${updateErr.message}`);
        continue;
      }

      purged++;
    }

    return new Response(JSON.stringify({ success: true, purged, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
