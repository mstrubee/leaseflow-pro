import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface EconomicData {
  ufValue: number;
  dollarValue: number;
  loading: boolean;
}

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

  return {
    ...data,
    convertPesosToUF,
    convertUFToPesos,
  };
};
