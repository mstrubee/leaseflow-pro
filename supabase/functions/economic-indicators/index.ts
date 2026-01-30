import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

// Secure CORS configuration - only allow explicit trusted origins
const ALLOWED_ORIGINS = [
  'https://tgxiqvfpirwvhktgqqfa.lovable.app',
  'https://id-preview--73a8d508-7010-4c00-aa8e-6eb117cc7286.lovable.app',
  'https://rental-flow-desk.lovable.app',
  'http://localhost:5173',
  'http://localhost:8080',
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  // Strict origin matching - no wildcard domain matching
  const isAllowed = ALLOWED_ORIGINS.includes(origin);
  
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Credentials': 'true',
  };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    // Check if a specific date is requested for historical UF
    const url = new URL(req.url);
    const historicalDateParam = url.searchParams.get('date');
    
    // If a historical date is requested, fetch UF for that specific date
    if (historicalDateParam) {
      const requestedDate = new Date(historicalDateParam);
      const year = requestedDate.getFullYear();
      const month = String(requestedDate.getMonth() + 1).padStart(2, '0');
      const day = String(requestedDate.getDate()).padStart(2, '0');
      
      try {
        const response = await fetch(`https://mindicador.cl/api/uf/${day}-${month}-${year}`);
        const text = await response.text();
        
        if (text.trim().startsWith('<')) {
          // API returned HTML error, try fetching the whole year and find closest date
          const yearResponse = await fetch(`https://mindicador.cl/api/uf/${year}`);
          const yearText = await yearResponse.text();
          
          if (!yearText.trim().startsWith('<')) {
            const yearData = JSON.parse(yearText);
            // Find the closest date's UF value
            const targetTime = requestedDate.getTime();
            let closestValue = null;
            let closestDiff = Infinity;
            
            for (const item of yearData.serie || []) {
              const itemDate = new Date(item.fecha);
              const diff = Math.abs(itemDate.getTime() - targetTime);
              if (diff < closestDiff) {
                closestDiff = diff;
                closestValue = item.valor;
              }
            }
            
            if (closestValue) {
              return new Response(
                JSON.stringify({ uf: { historical: closestValue, date: historicalDateParam } }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
              );
            }
          }
          
          // Fallback if we can't find the value
          return new Response(
            JSON.stringify({ uf: { historical: null, date: historicalDateParam, error: 'UF not found for date' } }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
          );
        }
        
        const data = JSON.parse(text);
        const ufValue = data.serie?.[0]?.valor || null;
        
        return new Response(
          JSON.stringify({ uf: { historical: ufValue, date: historicalDateParam } }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      } catch (e) {
        console.error('Error fetching historical UF:', e);
        return new Response(
          JSON.stringify({ uf: { historical: null, date: historicalDateParam, error: 'Failed to fetch historical UF' } }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }
    }
    
    const today = new Date();
    const currentYear = today.getFullYear();
    const lastYear = currentYear - 1;

    // Helper function to safely fetch and parse JSON with retry logic
    const safeFetch = async (url: string, retries = 3, delay = 1000): Promise<any> => {
      let lastError: Error | null = null;
      
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const response = await fetch(url);
          const text = await response.text();
          
          // Check if response is HTML (error page) instead of JSON
          if (text.trim().startsWith('<')) {
            console.error(`Attempt ${attempt}: API returned HTML for ${url}:`, text.substring(0, 100));
            throw new Error(`API returned HTML error page`);
          }
          
          return JSON.parse(text);
        } catch (e) {
          lastError = e as Error;
          console.warn(`Attempt ${attempt}/${retries} failed for ${url}: ${lastError.message}`);
          
          if (attempt < retries) {
            await new Promise(resolve => setTimeout(resolve, delay * attempt));
          }
        }
      }
      
      throw lastError || new Error(`Failed to fetch ${url} after ${retries} attempts`);
    };

    // Fallback values in case API is completely unavailable
    const FALLBACK_UF = 38500; // Approximate UF value as fallback
    const FALLBACK_DOLLAR = 980; // Approximate dollar value as fallback

    let ufData, dollarCurrentYear, dollarLastYear;
    let usedFallback = false;

    try {
      // Fetch UF values from mindicador.cl API
      ufData = await safeFetch('https://mindicador.cl/api/uf');
    } catch (e) {
      console.warn('UF fetch failed, using fallback values');
      usedFallback = true;
      ufData = { serie: [{ valor: FALLBACK_UF, fecha: today.toISOString() }] };
    }

    try {
      // Fetch USD values for current year and last year
      [dollarCurrentYear, dollarLastYear] = await Promise.all([
        safeFetch(`https://mindicador.cl/api/dolar/${currentYear}`),
        safeFetch(`https://mindicador.cl/api/dolar/${lastYear}`)
      ]);
    } catch (e) {
      console.warn('Dollar fetch failed, using fallback values');
      usedFallback = true;
      dollarCurrentYear = { serie: [{ valor: FALLBACK_DOLLAR, fecha: today.toISOString() }] };
      dollarLastYear = { serie: [] };
    }

    // Get current UF value
    const currentUF = ufData.serie?.[0]?.valor || 0;
    
    // Get UF values for last 10 days
    const ufNext10Days = ufData.serie?.slice(0, 10).map((item: any) => ({
      date: item.fecha,
      value: item.valor
    })) || [];

    // Combine dollar data from both years
    const allDollarData = [
      ...(dollarCurrentYear.serie || []),
      ...(dollarLastYear.serie || [])
    ].map((item: any) => ({
      date: item.fecha,
      value: item.valor
    }));

    // Current dollar value (most recent)
    const currentDollar = dollarCurrentYear.serie?.[0]?.valor || 0;

    // Calculate date limits
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    sixMonthsAgo.setHours(0, 0, 0, 0);
    
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    oneYearAgo.setHours(0, 0, 0, 0);

    console.log(`Six months ago: ${sixMonthsAgo.toISOString()}`);
    console.log(`One year ago: ${oneYearAgo.toISOString()}`);

    // Filter for 6 months
    const dollarSixMonths = allDollarData.filter((item: any) => {
      const itemDate = new Date(item.date);
      return itemDate >= sixMonthsAgo;
    });

    // Filter for 1 year
    const dollarOneYear = allDollarData.filter((item: any) => {
      const itemDate = new Date(item.date);
      return itemDate >= oneYearAgo;
    });

    console.log(`Six months data points: ${dollarSixMonths.length}`);
    console.log(`One year data points: ${dollarOneYear.length}`);

    // Sort chronologically (oldest to newest for chart display)
    const sortByDate = (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime();

    return new Response(
      JSON.stringify({
        uf: {
          current: currentUF,
          next10Days: [...ufNext10Days].sort(sortByDate),
          date: today.toISOString()
        },
        dollar: {
          current: currentDollar,
          sixMonths: [...dollarSixMonths].sort(sortByDate),
          oneYear: [...dollarOneYear].sort(sortByDate),
          date: today.toISOString()
        },
        usedFallback
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('Error fetching economic indicators:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch economic indicators' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
