import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const BUCKET = "repository-files";
const RETENTION_DAYS = 30;
const STORAGE_PREFIX = `storage://${BUCKET}/`;

interface QuotationRow {
  id: string;
  quotation_number: string;
  storage_path: string | null;
  quotation_date: string | null;
}

// Invocado a diario por pg_cron (ver migración oc_quotations_storage_retention).
// El gate de JWT de la plataforma se satisface con la anon key (pública); la
// autorización real es el header x-cron-secret contra CRON_SECRET (mismo
// secreto compartido usado por purge-expense-receipts).
//
// El archivo de un "Requerimiento de OC" sigue guardándose siempre en Drive
// (oc_quotations.file_path, no se toca acá). Esta función solo limpia la
// copia en Supabase Storage (oc_quotations.storage_path) una vez que deja de
// hacer falta: a los 30 días de subida, o antes si el requerimiento ya se
// convirtió en Solicitud de OC (oc_requests.source_quotation_number).
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

    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const { data: rows, error: fetchErr } = await admin
      .from("oc_quotations")
      .select("id, quotation_number, storage_path, quotation_date")
      .not("storage_path", "is", null);
    if (fetchErr) throw fetchErr;

    const quotations = (rows ?? []) as QuotationRow[];
    if (quotations.length === 0) {
      return new Response(JSON.stringify({ success: true, purged: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const quotationNumbers = [...new Set(quotations.map((r) => r.quotation_number))];
    const { data: converted, error: convErr } = await admin
      .from("oc_requests")
      .select("source_quotation_number")
      .in("source_quotation_number", quotationNumbers);
    if (convErr) throw convErr;
    const convertedSet = new Set(
      (converted ?? []).map((r) => r.source_quotation_number).filter(Boolean) as string[],
    );

    // Todas las filas de un mismo quotation_number comparten el mismo archivo.
    const byGroup = new Map<string, QuotationRow[]>();
    for (const row of quotations) {
      const list = byGroup.get(row.quotation_number) ?? [];
      list.push(row);
      byGroup.set(row.quotation_number, list);
    }

    let purged = 0;
    const errors: string[] = [];

    for (const [quotationNumber, group] of byGroup) {
      const isConverted = convertedSet.has(quotationNumber);
      const isExpired = !!group[0].quotation_date && group[0].quotation_date < cutoff;
      if (!isConverted && !isExpired) continue;

      const storagePath = group[0].storage_path;
      const path = storagePath?.startsWith(STORAGE_PREFIX)
        ? storagePath.slice(STORAGE_PREFIX.length)
        : null;

      if (path) {
        const { error: removeErr } = await admin.storage.from(BUCKET).remove([path]);
        if (removeErr) {
          errors.push(`${quotationNumber}: ${removeErr.message}`);
          continue;
        }
      }

      const ids = group.map((r) => r.id);
      const { error: updateErr } = await admin
        .from("oc_quotations")
        .update({ storage_path: null })
        .in("id", ids);
      if (updateErr) {
        errors.push(`${quotationNumber}: ${updateErr.message}`);
        continue;
      }

      purged += ids.length;
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
