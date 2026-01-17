import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface BusinessCase {
  id: string;
  contract_id: string;
  name: string;
  spreadsheet_data: any[];
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export const useBusinessCase = (contractId: string) => {
  const [businessCases, setBusinessCases] = useState<BusinessCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchBusinessCases = useCallback(async () => {
    if (!contractId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("business_cases")
        .select("*")
        .eq("contract_id", contractId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Cast the data to handle JSONB type
      const typedData = (data || []).map(item => ({
        ...item,
        spreadsheet_data: item.spreadsheet_data as any[]
      }));
      
      setBusinessCases(typedData);
    } catch (error) {
      console.error("Error fetching business cases:", error);
      toast.error("Error al cargar los Business Cases");
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => {
    fetchBusinessCases();
  }, [fetchBusinessCases]);

  const createBusinessCase = async (name: string, spreadsheetData: any[]) => {
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from("business_cases")
        .insert({
          contract_id: contractId,
          name,
          spreadsheet_data: spreadsheetData as any,
          created_by: userData.user?.id || null
        })
        .select()
        .single();

      if (error) throw error;
      
      const typedData = {
        ...data,
        spreadsheet_data: data.spreadsheet_data as any[]
      };
      
      setBusinessCases(prev => [typedData, ...prev]);
      toast.success("Business Case creado exitosamente");
      return typedData;
    } catch (error) {
      console.error("Error creating business case:", error);
      toast.error("Error al crear el Business Case");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const updateBusinessCase = async (id: string, updates: Partial<Pick<BusinessCase, "name" | "spreadsheet_data">>) => {
    setSaving(true);
    try {
      const updateData: any = { ...updates };
      if (updates.spreadsheet_data) {
        updateData.spreadsheet_data = updates.spreadsheet_data as any;
      }
      
      const { data, error } = await supabase
        .from("business_cases")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      
      const typedData = {
        ...data,
        spreadsheet_data: data.spreadsheet_data as any[]
      };
      
      setBusinessCases(prev => prev.map(bc => bc.id === id ? typedData : bc));
      return typedData;
    } catch (error) {
      console.error("Error updating business case:", error);
      toast.error("Error al guardar el Business Case");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const deleteBusinessCase = async (id: string) => {
    try {
      const { error } = await supabase
        .from("business_cases")
        .delete()
        .eq("id", id);

      if (error) throw error;
      
      setBusinessCases(prev => prev.filter(bc => bc.id !== id));
      toast.success("Business Case eliminado");
      return true;
    } catch (error) {
      console.error("Error deleting business case:", error);
      toast.error("Error al eliminar el Business Case");
      return false;
    }
  };

  return {
    businessCases,
    loading,
    saving,
    fetchBusinessCases,
    createBusinessCase,
    updateBusinessCase,
    deleteBusinessCase
  };
};
