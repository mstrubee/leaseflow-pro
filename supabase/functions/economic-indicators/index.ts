import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders, handleCorsPreflightRequest } from "../_shared/cors.ts";
import {
  canAttemptRefresh,
  monthsToFetch,
  parseCmfSeries,
  redactSecrets,
  selectUF,
  selectUSD,
  staleness,
  subtractDays,
  todayInSantiago,
  type CacheRow,
  type DatedValue,
} from "../_shared/indicators.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Proveedores: CMF Chile (oficial, requiere API key gratuita en el secreto
// CMF_API_KEY) y mindicador.cl como respaldo. Desde Supabase mindicador.cl
// ha estado cortando las conexiones, por eso CMF va primero.
const CMF_API_KEY = Deno.env.get("CMF_API_KEY") ?? "";
const CMF_BASE = "https://api.cmfchile.cl/api-sbifv3/recursos_api";
const MINDICADOR_TIMEOUT_MS = 8000;
// Si los proveedores están caídos, no reintentar en cada request (por isolate).
const MIN_REFRESH_RETRY_MS = 5 * 60 * 1000;
let lastRefreshAttemptAt = 0;

async function fetchJson(url: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MINDICADOR_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    if (text.trim().startsWith("<")) throw new Error(`HTTP ${response.status}: respuesta HTML`);
    return JSON.parse(text);
  } catch (e: any) {
    // El mensaje de error de fetch incluye la URL completa (con el apikey).
    throw new Error(redactSecrets(String(e?.message ?? e), [CMF_API_KEY]));
  } finally {
    clearTimeout(timer);
  }
}

// CMF: un request por mes (actual y anterior). resource: "uf" | "dolar".
async function fromCmf(resource: "uf" | "dolar", today: string): Promise<DatedValue[]> {
  if (!CMF_API_KEY) throw new Error("CMF_API_KEY no configurada");
  const months = await Promise.all(
    monthsToFetch(today).map(({ year, month }) =>
      fetchJson(`${CMF_BASE}/${resource}/${year}/${String(month).padStart(2, "0")}?apikey=${encodeURIComponent(CMF_API_KEY)}&formato=json`).then(parseCmfSeries)
    )
  );
  const series = months.flat();
  if (series.length === 0) throw new Error("CMF no devolvió valores");
  return series;
}

async function fromMindicador(resource: "uf" | "dolar", today: string): Promise<DatedValue[]> {
  const url = resource === "uf" ? "https://mindicador.cl/api/uf" : `https://mindicador.cl/api/dolar/${today.slice(0, 4)}`;
  const data = await fetchJson(url);
  const series: DatedValue[] = (data.serie || [])
    .slice(0, resource === "uf" ? 31 : undefined)
    .map((item: any) => ({ date: new Date(item.fecha).toISOString().split("T")[0], value: item.valor }));
  if (series.length === 0) throw new Error("mindicador no devolvió valores");
  return series;
}

type RefreshDetail = Record<string, { provider?: string; count?: number; error?: string }>;

// Pide solo lo que falta (UF y/o dólar), primero a CMF y, si falla, a
// mindicador, y lo guarda en la caché. Devuelve el detalle por indicador
// (sin secretos) y si todo salió bien.
async function refreshCache(supabase: any, needs: { uf: boolean; usd: boolean }, today: string): Promise<{ ok: boolean; detail: RefreshDetail }> {
  const nowISO = new Date().toISOString();
  const detail: RefreshDetail = {};

  const run = async (key: "uf" | "usd", indicator: "UF" | "USD", resource: "uf" | "dolar") => {
    const errors: string[] = [];
    for (const [provider, fetcher] of [["cmf", fromCmf], ["mindicador", fromMindicador]] as const) {
      try {
        const series = await fetcher(resource, today);
        const records = series.map((r) => ({ indicator, date: r.date, value: r.value, source: provider === "cmf" ? "cmfchile.cl" : "mindicador.cl", last_updated: nowISO, is_stale: false }));
        for (let i = 0; i < records.length; i += 500) {
          const { error } = await supabase.from("economic_indicators_cache").upsert(records.slice(i, i + 500), { onConflict: "indicator,date" });
          if (error) throw error;
        }
        detail[key] = { provider, count: records.length };
        return;
      } catch (e: any) {
        errors.push(`${provider}: ${redactSecrets(String(e?.message ?? e), [CMF_API_KEY])}`);
      }
    }
    detail[key] = { error: errors.join(" | ") };
  };

  const tasks: Promise<void>[] = [];
  if (needs.uf) tasks.push(run("uf", "UF", "uf"));
  if (needs.usd) tasks.push(run("usd", "USD", "dolar"));
  await Promise.all(tasks);
  Object.entries(detail).forEach(([k, v]) => v.error && console.error(`Refresh ${k} failed:`, v.error));
  return { ok: Object.values(detail).every((d) => !d.error), detail };
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

    // El cron (refresh-economic-indicators) es lo normal; esto cubre que no
    // esté corriendo o que mindicador haya fallado en su última ejecución.
    // El refresco va en SEGUNDO PLANO: la respuesta nunca espera a
    // mindicador.cl (si está caído tardaría ~10 s en cada carga del
    // dashboard y de toda pantalla que use la UF); el próximo request ya ve
    // los datos nuevos.
    let needs = staleness(ufRows, usdRows, today);
    let refreshing = false;
    let refreshDetail: RefreshDetail | undefined;
    // ?refresh=1: verificación manual -- espera el resultado y lo devuelve
    // (sin secretos). Sigue sujeto al tope de reintentos.
    const awaitRefresh = url.searchParams.get("refresh") === "1";
    if ((needs.uf || needs.usd) && canAttemptRefresh(lastRefreshAttemptAt, Date.now(), MIN_REFRESH_RETRY_MS)) {
      lastRefreshAttemptAt = Date.now();
      refreshing = true;
      const task = refreshCache(supabase, needs, today).then((r) => { refreshDetail = r.detail; }).catch((e: any) => console.error("Background refresh crashed:", redactSecrets(String(e?.message ?? e), [CMF_API_KEY])));
      if (awaitRefresh) {
        await task;
        ({ ufRows, usdRows } = await readCache(supabase, today, oneYearAgo));
        needs = staleness(ufRows, usdRows, today);
      } else {
        // EdgeRuntime.waitUntil mantiene viva la tarea tras responder.
        const runtime = (globalThis as any).EdgeRuntime;
        if (runtime?.waitUntil) runtime.waitUntil(task);
      }
    }

    const uf = selectUF(ufRows, today);
    const usd = selectUSD(usdRows, today);

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
        is_stale: uf.isStale || usd.isStale || needs.uf,
        last_updated: uf.lastUpdated,
        source: "cache",
        refreshing,
        ...(awaitRefresh ? { refresh: refreshDetail ?? "no necesario o en espera de reintento" } : {}),
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
