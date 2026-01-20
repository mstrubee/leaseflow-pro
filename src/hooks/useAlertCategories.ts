import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AlertCategory {
  id: string;
  name: string;
  code: string;
  description: string | null;
  display_order: number;
  is_system: boolean;
  is_active: boolean;
}

export function useAlertCategories() {
  const [categories, setCategories] = useState<AlertCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCategories = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("alert_categories")
        .select("*")
        .eq("is_active", true)
        .order("display_order");

      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error("Error loading alert categories:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const getCategoryById = useCallback((id: string | null | undefined): AlertCategory | undefined => {
    if (!id) return undefined;
    return categories.find(c => c.id === id);
  }, [categories]);

  const getCategoryByCode = useCallback((code: string): AlertCategory | undefined => {
    return categories.find(c => c.code === code);
  }, [categories]);

  const getTrackingCategoryId = useCallback((): string | undefined => {
    return categories.find(c => c.code === 'tracking_alerts')?.id;
  }, [categories]);

  const getContractCategoryId = useCallback((): string | undefined => {
    return categories.find(c => c.code === 'contract_alerts')?.id;
  }, [categories]);

  return {
    categories,
    loading,
    loadCategories,
    getCategoryById,
    getCategoryByCode,
    getTrackingCategoryId,
    getContractCategoryId,
  };
}
