import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const ALLOWED_ORIGINS = [
  'https://tgxiqvfpirwvhktgqqfa.lovable.app',
  'https://id-preview--73a8d508-7010-4c00-aa8e-6eb117cc7286.lovable.app',
  'https://rental-flow-desk.lovable.app',
  'http://localhost:5173',
  'http://localhost:8080',
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  const isAllowed = ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Credentials': 'true',
  };
}

// Fetch with a hard timeout to avoid edge function timeouts
async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    clearTimeout(timer);
    if (text.trim().startsWith('<')) {
      throw new Error('API returned HTML error page');
    }
    return JSON.parse(text);
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// Fallback values
const FALLBACK_UF = 38500;
const FALLBACK_DOLLAR = 980;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const historicalDateParam = url.searchParams.get('date');

    // --- Historical UF request ---
    if (historicalDateParam) {
      return await handleHistoricalUF(historicalDateParam, corsHeaders);
    }

    // --- Current indicators ---
    const today = new Date();
    const currentYear = today.getFullYear();
    const lastYear = currentYear - 1;

    let ufData: any, dollarCurrentYear: any, dollarLastYear: any;
    let usedFallback = false;

    // Fetch all three in parallel with individual fallbacks
    const [ufResult, dollarCurrent, dollarLast] = await Promise.allSettled([
      fetchWithTimeout('https://mindicador.cl/api/uf'),
      fetchWithTimeout(`https://mindicador.cl/api/dolar/${currentYear}`),
      fetchWithTimeout(`https://mindicador.cl/api/dolar/${lastYear}`),
    ]);

    if (ufResult.status === 'fulfilled') {
      ufData = ufResult.value;
    } else {
      console.warn('UF fetch failed:', ufResult.reason?.message);
      usedFallback = true;
      ufData = { serie: [{ valor: FALLBACK_UF, fecha: today.toISOString() }] };
    }

    if (dollarCurrent.status === 'fulfilled') {
      dollarCurrentYear = dollarCurrent.value;
    } else {
      console.warn('Dollar current year fetch failed:', dollarCurrent.reason?.message);
      usedFallback = true;
      dollarCurrentYear = { serie: [{ valor: FALLBACK_DOLLAR, fecha: today.toISOString() }] };
    }

    if (dollarLast.status === 'fulfilled') {
      dollarLastYear = dollarLast.value;
    } else {
      console.warn('Dollar last year fetch failed');
      dollarLastYear = { serie: [] };
    }

    const currentUF = ufData.serie?.[0]?.valor || FALLBACK_UF;
    const ufNext10Days = (ufData.serie?.slice(0, 10) || []).map((item: any) => ({
      date: item.fecha,
      value: item.valor,
    }));

    const allDollarData = [
      ...(dollarCurrentYear.serie || []),
      ...(dollarLastYear.serie || []),
    ].map((item: any) => ({ date: item.fecha, value: item.valor }));

    const currentDollar = dollarCurrentYear.serie?.[0]?.valor || FALLBACK_DOLLAR;

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    oneYearAgo.setHours(0, 0, 0, 0);

    const dollarSixMonths = allDollarData.filter((item: any) => new Date(item.date) >= sixMonthsAgo);
    const dollarOneYear = allDollarData.filter((item: any) => new Date(item.date) >= oneYearAgo);

    const sortByDate = (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime();

    return new Response(
      JSON.stringify({
        uf: { current: currentUF, next10Days: [...ufNext10Days].sort(sortByDate), date: today.toISOString() },
        dollar: {
          current: currentDollar,
          sixMonths: [...dollarSixMonths].sort(sortByDate),
          oneYear: [...dollarOneYear].sort(sortByDate),
          date: today.toISOString(),
        },
        usedFallback,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Error:', error);
    // Return fallback data instead of error
    return new Response(
      JSON.stringify({
        uf: { current: FALLBACK_UF, next10Days: [], date: new Date().toISOString() },
        dollar: { current: FALLBACK_DOLLAR, sixMonths: [], oneYear: [], date: new Date().toISOString() },
        usedFallback: true,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }
});

async function handleHistoricalUF(dateParam: string, corsHeaders: Record<string, string>): Promise<Response> {
  const requestedDate = new Date(dateParam);
  const year = requestedDate.getFullYear();
  const month = String(requestedDate.getMonth() + 1).padStart(2, '0');
  const day = String(requestedDate.getDate()).padStart(2, '0');

  try {
    const data = await fetchWithTimeout(`https://mindicador.cl/api/uf/${day}-${month}-${year}`, 6000);
    const ufValue = data.serie?.[0]?.valor || null;

    if (ufValue) {
      return new Response(
        JSON.stringify({ uf: { historical: ufValue, date: dateParam } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }
  } catch {
    // Try year fallback
  }

  // Fallback: fetch full year and find closest
  try {
    const yearData = await fetchWithTimeout(`https://mindicador.cl/api/uf/${year}`, 6000);
    const targetTime = requestedDate.getTime();
    let closestValue: number | null = null;
    let closestDiff = Infinity;

    for (const item of yearData.serie || []) {
      const diff = Math.abs(new Date(item.fecha).getTime() - targetTime);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestValue = item.valor;
      }
    }

    if (closestValue) {
      return new Response(
        JSON.stringify({ uf: { historical: closestValue, date: dateParam } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }
  } catch (e) {
    console.error('Historical UF fallback failed:', e);
  }

  return new Response(
    JSON.stringify({ uf: { historical: null, date: dateParam, error: 'UF not found for date' } }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
  );
}
