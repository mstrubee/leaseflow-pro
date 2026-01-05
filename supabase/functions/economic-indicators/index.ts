import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
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

    // Get dollar history for the last year (API returns newest first)
    const dollarHistory = dollarData.serie?.slice(0, 365).map((item: any) => ({
      date: item.fecha,
      value: item.valor
    })) || [];

    // Current dollar value
    const currentDollar = dollarData.serie?.[0]?.valor || 0;

    // Filter for 6 months (approx 180 days)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const dollarSixMonths = dollarHistory.filter((item: any) => {
      const itemDate = new Date(item.date);
      return itemDate >= sixMonthsAgo;
    });

    // Filter for 1 year
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    const dollarOneYear = dollarHistory.filter((item: any) => {
      const itemDate = new Date(item.date);
      return itemDate >= oneYearAgo;
    });

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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
