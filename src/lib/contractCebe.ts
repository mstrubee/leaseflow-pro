import { supabase } from "@/integrations/supabase/client";

/**
 * CEBE de varios contratos de una vez. El CEBE es un campo personalizado del contrato
 * (contract_custom_fields con nombre "cebe") — misma fuente que usa CentralizedOrderCreator.
 * Devuelve solo los contratos que lo tienen cargado.
 */
export async function loadContractCebes(contractIds: string[]): Promise<Map<string, string>> {
  const cebes = new Map<string, string>();
  const ids = [...new Set(contractIds.filter(Boolean))];
  if (ids.length === 0) return cebes;

  const { data: field } = await supabase
    .from("contract_custom_fields")
    .select("id")
    .ilike("field_name", "cebe")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!field) return cebes;

  const { data: values } = await supabase
    .from("contract_custom_field_values")
    .select("contract_id, field_value")
    .eq("field_id", field.id)
    .in("contract_id", ids);
  (values || []).forEach((v) => {
    if (v.field_value) cebes.set(v.contract_id, v.field_value);
  });
  return cebes;
}
