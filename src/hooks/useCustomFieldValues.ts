import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface CustomFieldValue {
  id: string;
  field_id: string;
  field_value: string | null;
}

export function useCustomFieldValues(contractId?: string) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [originalValues, setOriginalValues] = useState<CustomFieldValue[]>([]);

  useEffect(() => {
    if (contractId) {
      loadValues();
    } else {
      setLoading(false);
    }
  }, [contractId]);

  const loadValues = async () => {
    if (!contractId) return;

    try {
      const { data, error } = await supabase
        .from("contract_custom_field_values")
        .select("*")
        .eq("contract_id", contractId);

      if (error) throw error;

      const valuesMap: Record<string, string> = {};
      (data || []).forEach((v) => {
        valuesMap[v.field_id] = v.field_value || "";
      });
      
      setValues(valuesMap);
      setOriginalValues(data || []);
    } catch (error) {
      console.error("Error loading custom field values:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateValue = useCallback((fieldId: string, value: string) => {
    setValues((prev) => ({
      ...prev,
      [fieldId]: value,
    }));
  }, []);

  const saveValues = async (contractIdToSave: string) => {
    for (const [fieldId, value] of Object.entries(values)) {
      const existing = originalValues.find((v) => v.field_id === fieldId);
      
      if (existing) {
        // Update existing value
        if (existing.field_value !== value) {
          await supabase
            .from("contract_custom_field_values")
            .update({ field_value: value })
            .eq("id", existing.id);
        }
      } else if (value) {
        // Insert new value
        await supabase
          .from("contract_custom_field_values")
          .insert({
            contract_id: contractIdToSave,
            field_id: fieldId,
            field_value: value,
          });
      }
    }
  };

  return {
    values,
    loading,
    updateValue,
    saveValues,
  };
}
