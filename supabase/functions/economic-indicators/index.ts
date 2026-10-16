import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders, handleCorsPreflightRequest } from "../_shared/cors.ts";
import {
  canAttemptRefresh,
  selectUF,
  selectUSD,
  staleness,
  subtractDays,
  todayInSantiago,
  type CacheRow,
} from "../_shared/indicators.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SOURCE = "mindicador.cl";
const MINDICADOR_TIMEOUT_MS = 8000;
// Si mindicador.cl está caído, no reintentar en cada request (por isolate).
const MIN_REFRESH_RETRY_MS = 5 * 60 * 1000;
let lastRefreshAttemptAt = 0;

async function fetchMindicador(url: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MINDICADOR_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    if (text.trim().startsWith("<")) throw new Error("API returned HTML error page");
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

// Pide a mindicador.cl solo lo que falta en la caché (UF y/o dólar del año en
// curso) y lo guarda -- mismo formato que refresh-economic-indicators (que
// sigue siendo el que refresca todo por cron). Devuelve false si algo falló.
async function refreshFromMindicador(supabase: any, needs: { uf: boolean; usd: boolean }): Promise<boolean> {
  const nowISO = new Date().toISOString();
  const toRecords = (indicator: string, serie: any[]) =>
    (serie || []).map((item: any) => ({
      indicator,
      date: new Date(item.fecha).toISOString().split("T")[0],
      value: item.valor,
      source: SOURCE,
      last_updated: nowISO,
      is_stale: false,
    }));

  const tasks: Promise<void>[] = [];
  if (needs.uf) {
    tasks.push(
      (async () => {
        const data = await fetchMindicador("https://mindicador.cl/api/uf");
        const records = toRecords("UF", (data.serie || []).slice(0, 31));
        if (records.length === 0) throw new Error("mindicador returned no UF values");
        const { error } = await supabase.from("economic_indicators_cache").upsert(records, { onConflict: "indicator,date" });
        if (error) throw error;
      })()
    );
  }
  if (needs.usd) {
    tasks.push(
      (async () => {
        const data = await fetchMindicador(`https://mindicador.cl/api/dolar/${new Date().getFullYear()}`);
        const records = toRecords("USD", data.serie || []);
        if (records.length === 0) throw new Error("mindicador returned no USD values");
        for (let i = 0; i < records.length; i += 500) {
          const { error } = await supabase.from("economic_indicators_cache").upsert(records.slice(i, i + 500), { onConflict: "indicator,date" });
          if (error) throw error;
        }
      })()
    );
  }

  const results = await Promise.allSettled(tasks);
  results.forEach((r) => {
    if (r.status === "rejected") console.error("On-demand indicators refresh failed:", r.reason?.message ?? r.reason);
  });
  return results.every((r) => r.status === "fulfilled");
}

async function readCache(supabase: any, today: string, oneYearAgo: string): Promise<{ ufRows: CacheRow[]; usdRows: CacheRow[] }> {
  // UF: hasta hoy (la caché puede traer fechas futuras, ver selectUF).
  const { data: ufRows, error: ufError } = await supabase
    .from("economic_indicators_cache")
    .select("value, date, last_updated, is_stale")
    .eq("indicator", "UF")
    .lte("date", today)
    .order("date", { ascending: false })
    .limit(31);
  if (ufError) throw ufError;

  const { data: usdRows, error: usdError } = await supabase
    .from("economic_indicators_cache")
    .select("value, date, last_updated, is_stale")
    .eq("indicator", "USD")
    .gte("date", oneYearAgo)
    .order("date", { ascending: true });
  if (usdError) throw usdError;

  return { ufRows: ufRows || [], usdRows: usdRows || [] };
}

serve(async (req) => {
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  const corsHeaders = getCorsHeaders(req);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const url = new URL(req.url);
    const historicalDateParam = url.searchParams.get("date");

    // --- Historical UF request ---
    if (historicalDateParam) {
      return handleHistoricalUF(supabase, historicalDateParam, corsHeaders);
    }

    // --- Current indicators: caché, con refresco a demanda si está vacía o vieja ---
    const today = todayInSantiago();
    const oneYearAgo = subtractDays(today, 365);
    const sixMonthsAgo = subtractDays(today, 183);

    let { ufRows, usdRows } = await readCache(supabase, today, oneYearAgo);
    let source = "cache";
    let refreshFailed = false;

    // El cron (refresh-economic-indicators) es lo normal; esto cubre que no
    // esté corriendo o que mindicador haya fallado en su última ejecución.
    const needs = staleness(ufRows, usdRows, today);
    if ((needs.uf || needs.usd) && canAttemptRefresh(lastRefreshAttemptAt, Date.now(), MIN_REFRESH_RETRY_MS)) {
      lastRefreshAttemptAt = Date.now();
      const ok = await refreshFromMindicador(supabase, needs);
      refreshFailed = !ok;
      ({ ufRows, usdRows } = await readCache(supabase, today, oneYearAgo));
      source = ok ? "refreshed" : "cache";
    }

    const uf = selectUF(ufRows, today);
    const usd = selectUSD(usdRows, today);
    const stillMissing = staleness(ufRows, usdRows, today);

    return new Response(
      JSON.stringify({
        uf: {
          current: uf.current,
          // Últimos 10 valores hasta hoy (la UI los rotula "Últimos 10 días").
          next10Days: uf.last10,
          date: new Date().toISOString(),
        },
        dollar: {
          current: usd.current,
          sixMonths: usd.series.filter((d) => d.date >= sixMonthsAgo),
          oneYear: usd.series,
          date: new Date().toISOString(),
        },
        is_stale: uf.isStale || usd.isStale || stillMissing.uf || refreshFailed,
        last_updated: uf.lastUpdated,
        source,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    console.error("Error reading from cache:", error);
    return new Response(
      JSON.stringify({
        uf: { current: 0, next10Days: [], date: new Date().toISOString() },
        dollar: { current: 0, sixMonths: [], oneYear: [], date: new Date().toISOString() },
        is_stale: true,
        last_updated: null,
        source: "cache",
        error: "Cache read failed",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  }
});

async function handleHistoricalUF(
  supabase: any,
  dateParam: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const dateStr = dateParam.split("T")[0];

  // Try exact date
  const { data: exactRow } = await supabase
    .from("economic_indicators_cache")
    .select("value, date")
    .eq("indicator", "UF")
    .eq("date", dateStr)
    .maybeSingle();

  if (exactRow) {
    return new Response(
      JSON.stringify({ uf: { historical: exactRow.value, date: dateParam } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  }

  // Find closest date (before the requested date)
  const { data: closestRow } = await supabase
    .from("economic_indicators_cache")
    .select("value, date")
    .eq("indicator", "UF")
    .lte("date", dateStr)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (closestRow) {
    return new Response(
      JSON.stringify({ uf: { historical: closestRow.value, date: dateParam } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  }

  return new Response(
    JSON.stringify({ uf: { historical: null, date: dateParam, error: "UF not found for date" } }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
  );
}
