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
    const today = new Date();
    const currentYear = today.getFullYear();
    const lastYear = currentYear - 1;

    // Fetch UF values from mindicador.cl API
    const ufResponse = await fetch('https://mindicador.cl/api/uf');
    const ufData = await ufResponse.json();
    
    // Fetch USD values for current year and last year to get full history
    const [dollarCurrentYearRes, dollarLastYearRes] = await Promise.all([
      fetch(`https://mindicador.cl/api/dolar/${currentYear}`),
      fetch(`https://mindicador.cl/api/dolar/${lastYear}`)
    ]);
    
    const dollarCurrentYear = await dollarCurrentYearRes.json();
    const dollarLastYear = await dollarLastYearRes.json();

    console.log(`Fetched ${dollarCurrentYear.serie?.length || 0} records for ${currentYear}`);
    console.log(`Fetched ${dollarLastYear.serie?.length || 0} records for ${lastYear}`);

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
