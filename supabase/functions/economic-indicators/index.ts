import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders, handleCorsPreflightRequest } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

    // --- Current indicators (read from cache only) ---
    const today = new Date();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    // Fetch latest UF values (last 31 days for the grid)
    const { data: ufRows, error: ufError } = await supabase
      .from("economic_indicators_cache")
      .select("value, date, last_updated, is_stale")
      .eq("indicator", "UF")
      .order("date", { ascending: false })
      .limit(31);

    if (ufError) throw ufError;

    // Fetch USD data for charts (last year)
    const { data: usdRows, error: usdError } = await supabase
      .from("economic_indicators_cache")
      .select("value, date, last_updated, is_stale")
      .eq("indicator", "USD")
      .gte("date", oneYearAgo.toISOString().split("T")[0])
      .order("date", { ascending: true });

    if (usdError) throw usdError;

    // Build response
    const currentUF = ufRows?.[0]?.value || 0;
    const ufNext10Days = (ufRows || []).slice(0, 10).map((r: any) => ({
      date: r.date,
      value: r.value,
    }));

    const allDollarData = (usdRows || []).map((r: any) => ({
      date: r.date,
      value: r.value,
    }));

    const currentDollar = allDollarData.length > 0
      ? allDollarData[allDollarData.length - 1].value
      : 0;

    const sixMonthsAgoStr = sixMonthsAgo.toISOString().split("T")[0];
    const dollarSixMonths = allDollarData.filter((d: any) => d.date >= sixMonthsAgoStr);
    const dollarOneYear = allDollarData;

    // Determine staleness from the most recent records
    const isStale = ufRows?.[0]?.is_stale || usdRows?.[usdRows.length - 1]?.is_stale || false;
    const lastUpdated = ufRows?.[0]?.last_updated || null;

    return new Response(
      JSON.stringify({
        uf: {
          current: currentUF,
          next10Days: ufNext10Days.sort((a: any, b: any) => a.date.localeCompare(b.date)),
          date: today.toISOString(),
        },
        dollar: {
          current: currentDollar,
          sixMonths: dollarSixMonths,
          oneYear: dollarOneYear,
          date: today.toISOString(),
        },
        is_stale: isStale,
        last_updated: lastUpdated,
        source: "cache",
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
