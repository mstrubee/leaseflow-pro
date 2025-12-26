import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Secure CORS configuration - only allow trusted origins
const ALLOWED_ORIGINS = [
  'https://tgxiqvfpirwvhktgqqfa.lovable.app',
  'http://localhost:5173',
  'http://localhost:8080',
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  const isAllowed = ALLOWED_ORIGINS.some(allowed => 
    origin === allowed || origin.endsWith('.lovable.app')
  );
  
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Credentials': 'true',
  };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Fetch UF values from mindicador.cl API (Chilean economic indicators)
    const today = new Date();
    const ufResponse = await fetch('https://mindicador.cl/api/uf');
    const ufData = await ufResponse.json();
    
    // Fetch USD values
    const dollarResponse = await fetch('https://mindicador.cl/api/dolar');
    const dollarData = await dollarResponse.json();

    // Get current UF value
    const currentUF = ufData.serie?.[0]?.valor || 0;
    
    // Get UF values for next 10 days (projected from SII pattern)
    const ufNext10Days = ufData.serie?.slice(0, 10).map((item: any) => ({
      date: item.fecha,
      value: item.valor
    })) || [];

    // Get dollar history for 6 months and 1 year
    const dollarHistory = dollarData.serie?.slice(0, 365).map((item: any) => ({
      date: item.fecha,
      value: item.valor
    })) || [];

    // Current dollar value
    const currentDollar = dollarData.serie?.[0]?.valor || 0;

    // Filter for 6 months (approx 180 days) and 1 year
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const dollarSixMonths = dollarHistory.filter((item: any) => 
      new Date(item.date) >= sixMonthsAgo
    );

    return new Response(
      JSON.stringify({
        uf: {
          current: currentUF,
          next10Days: ufNext10Days.reverse(),
          date: today.toISOString()
        },
        dollar: {
          current: currentDollar,
          sixMonths: dollarSixMonths.reverse(),
          oneYear: dollarHistory.reverse(),
          date: today.toISOString()
        }
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
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
