import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { withRetry } from "@/lib/supabaseRetry";

interface EconomicData {
  ufValue: number;
  dollarValue: number;
  loading: boolean;
}

// Cache for historical UF values to avoid repeated API calls
const historicalUFCache: Record<string, number> = {};

export const useEconomicIndicators = () => {
  const [data, setData] = useState<EconomicData>({
    ufValue: 0,
    dollarValue: 0,
    loading: true,
  });

  useEffect(() => {
    fetchIndicators();
  }, []);

  const fetchIndicators = async () => {
    try {
      const { data: response, error } = await supabase.functions.invoke('economic-indicators');
      if (error) throw error;
      setData({
        ufValue: response?.uf?.current || 0,
        dollarValue: response?.dollar?.current || 0,
        loading: false,
      });
    } catch (error) {
      console.error('Error fetching indicators:', error);
      setData(prev => ({ ...prev, loading: false }));
    }
  };

  const convertPesosToUF = (pesos: number): number => {
    if (!data.ufValue || data.ufValue === 0) return 0;
    return pesos / data.ufValue;
  };

  const convertUFToPesos = (uf: number): number => {
    if (!data.ufValue) return 0;
    return uf * data.ufValue;
  };

  // Fetch historical UF value for a specific date
  const getHistoricalUF = useCallback(async (date: string): Promise<number | null> => {
    // Check cache first
    const cacheKey = date.split('T')[0]; // Use date part only for caching
    if (historicalUFCache[cacheKey]) {
      console.log(`[getHistoricalUF] Using cached value for ${cacheKey}:`, historicalUFCache[cacheKey]);
      return historicalUFCache[cacheKey];
    }

    try {
      console.log(`[getHistoricalUF] Fetching historical UF for date: ${cacheKey}`);
      
      const projectUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      
      const fetchResponse = await fetch(
        `${projectUrl}/functions/v1/economic-indicators?date=${encodeURIComponent(cacheKey)}`,
        {
          headers: {
            'Authorization': `Bearer ${anonKey}`,
            'apikey': anonKey,
          },
        }
      );
      
      if (!fetchResponse.ok) {
        console.error('[getHistoricalUF] Failed to fetch historical UF, status:', fetchResponse.status);
        return null;
      }
      
      const result = await fetchResponse.json();
      console.log('[getHistoricalUF] API response:', result);
      
      const historicalValue = result?.uf?.historical;
      
      if (historicalValue) {
        historicalUFCache[cacheKey] = historicalValue;
        console.log(`[getHistoricalUF] Cached value for ${cacheKey}:`, historicalValue);
        return historicalValue;
      }
      
      console.warn('[getHistoricalUF] No historical value in response');
      return null;
    } catch (error) {
      console.error('[getHistoricalUF] Error:', error);
      return null;
    }
  }, []);

  return {
    ...data,
    convertPesosToUF,
    convertUFToPesos,
    getHistoricalUF,
  };
};
