import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SOURCE = "mindicador.cl";
const STALE_THRESHOLD_HOURS = 6; // Mark stale after 6 hours without update

async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    clearTimeout(timer);
    if (text.trim().startsWith("<")) {
      throw new Error("API returned HTML error page");
    }
    return JSON.parse(text);
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

interface IndicatorRecord {
  indicator: string;
  date: string; // YYYY-MM-DD
  value: number;
  source: string;
  last_updated: string;
  is_stale: boolean;
}

serve(async (req) => {
  // This function is called by cron - no CORS needed for browser access
  // But allow manual invocation for testing
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const results: Record<string, { success: boolean; count: number; error?: string }> = {};
  const now = new Date();
  const nowISO = now.toISOString();
  const currentYear = now.getFullYear();
  const lastYear = currentYear - 1;

  // --- Fetch UF ---
  try {
    const ufData = await fetchWithTimeout("https://mindicador.cl/api/uf");
    const records: IndicatorRecord[] = (ufData.serie || []).slice(0, 31).map((item: any) => ({
      indicator: "UF",
      date: new Date(item.fecha).toISOString().split("T")[0],
      value: item.valor,
      source: SOURCE,
      last_updated: nowISO,
      is_stale: false,
    }));

    if (records.length > 0) {
      const { error } = await supabase
        .from("economic_indicators_cache")
        .upsert(records, { onConflict: "indicator,date" });
      if (error) throw error;
    }

    results.uf = { success: true, count: records.length };
  } catch (e: any) {
    console.error("UF fetch/upsert failed:", e.message);
    results.uf = { success: false, count: 0, error: e.message };
    // Mark existing UF data as stale if old
    await markStaleIfOld(supabase, "UF", STALE_THRESHOLD_HOURS);
  }

  // --- Fetch Dollar (current year + last year for charts) ---
  for (const year of [currentYear, lastYear]) {
    const key = `dollar_${year}`;
    try {
      const dollarData = await fetchWithTimeout(`https://mindicador.cl/api/dolar/${year}`);
      const records: IndicatorRecord[] = (dollarData.serie || []).map((item: any) => ({
        indicator: "USD",
        date: new Date(item.fecha).toISOString().split("T")[0],
        value: item.valor,
        source: SOURCE,
        last_updated: nowISO,
        is_stale: false,
      }));

      if (records.length > 0) {
        // Upsert in batches of 500 to avoid payload limits
        for (let i = 0; i < records.length; i += 500) {
          const batch = records.slice(i, i + 500);
          const { error } = await supabase
            .from("economic_indicators_cache")
            .upsert(batch, { onConflict: "indicator,date" });
          if (error) throw error;
        }
      }

      results[key] = { success: true, count: records.length };
    } catch (e: any) {
      console.error(`Dollar ${year} fetch/upsert failed:`, e.message);
      results[key] = { success: false, count: 0, error: e.message };
    }
  }

  // Mark USD stale if both years failed
  if (!results[`dollar_${currentYear}`]?.success && !results[`dollar_${lastYear}`]?.success) {
    await markStaleIfOld(supabase, "USD", STALE_THRESHOLD_HOURS);
  }

  // --- Fetch UTM ---
  try {
    const utmData = await fetchWithTimeout("https://mindicador.cl/api/utm");
    const records: IndicatorRecord[] = (utmData.serie || []).slice(0, 12).map((item: any) => ({
      indicator: "UTM",
      date: new Date(item.fecha).toISOString().split("T")[0],
      value: item.valor,
      source: SOURCE,
      last_updated: nowISO,
      is_stale: false,
    }));

    if (records.length > 0) {
      const { error } = await supabase
        .from("economic_indicators_cache")
        .upsert(records, { onConflict: "indicator,date" });
      if (error) throw error;
    }

    results.utm = { success: true, count: records.length };
  } catch (e: any) {
    console.error("UTM fetch/upsert failed:", e.message);
    results.utm = { success: false, count: 0, error: e.message };
    await markStaleIfOld(supabase, "UTM", STALE_THRESHOLD_HOURS);
  }

  // --- Fetch IPC ---
  try {
    const ipcData = await fetchWithTimeout("https://mindicador.cl/api/ipc");
    const records: IndicatorRecord[] = (ipcData.serie || []).slice(0, 12).map((item: any) => ({
      indicator: "IPC",
      date: new Date(item.fecha).toISOString().split("T")[0],
      value: item.valor,
      source: SOURCE,
      last_updated: nowISO,
      is_stale: false,
    }));

    if (records.length > 0) {
      const { error } = await supabase
        .from("economic_indicators_cache")
        .upsert(records, { onConflict: "indicator,date" });
      if (error) throw error;
    }

    results.ipc = { success: true, count: records.length };
  } catch (e: any) {
    console.error("IPC fetch/upsert failed:", e.message);
    results.ipc = { success: false, count: 0, error: e.message };
    await markStaleIfOld(supabase, "IPC", STALE_THRESHOLD_HOURS);
  }

  return new Response(JSON.stringify({ ok: true, results, refreshedAt: nowISO }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});

async function markStaleIfOld(
  supabase: any,
  indicator: string,
  thresholdHours: number
) {
  try {
    const cutoff = new Date(Date.now() - thresholdHours * 60 * 60 * 1000).toISOString();
    await supabase
      .from("economic_indicators_cache")
      .update({ is_stale: true })
      .eq("indicator", indicator)
      .lt("last_updated", cutoff);
  } catch (e) {
    console.error(`Failed to mark ${indicator} as stale:`, e);
  }
}
