import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

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
      return historicalUFCache[cacheKey];
    }

    try {
      const { data: response, error } = await supabase.functions.invoke('economic-indicators', {
        body: null,
        headers: {},
      });
      
      // For now, use a direct fetch to pass query params
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
        console.error('Failed to fetch historical UF');
        return null;
      }
      
      const result = await fetchResponse.json();
      const historicalValue = result?.uf?.historical;
      
      if (historicalValue) {
        historicalUFCache[cacheKey] = historicalValue;
        return historicalValue;
      }
      
      return null;
    } catch (error) {
      console.error('Error fetching historical UF:', error);
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
