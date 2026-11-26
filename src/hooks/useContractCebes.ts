import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CebeDraft, ContractCebe } from "@/lib/contractCebes";

export const fetchContractCebes = async (contractId: string): Promise<ContractCebe[]> => {
  const { data, error } = await supabase
    .from("contract_cebes")
    .select("id, company_id, cebe")
    .eq("contract_id", contractId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as ContractCebe[];
};

/**
 * Guarda los CEBE del contrato (filas vacías se ignoran; las que ya no están se borran).
 * Devuelve un mapa clave-de-borrador → id real, para poder enlazar Órdenes CO a CEBE
 * recién creados en el mismo guardado.
 */
export const saveContractCebes = async (
  contractId: string,
  drafts: CebeDraft[],
  originalIds: string[],
): Promise<Map<string, string>> => {
  const rows = drafts
    .filter((d) => d.cebe.trim().length > 0 && d.company_id)
    .map((d, index) => ({ key: d.key, id: d.id, company_id: d.company_id, cebe: d.cebe.trim(), sort_order: index }));

  const keptIds = new Set(rows.map((r) => r.id).filter(Boolean) as string[]);
  const removedIds = originalIds.filter((id) => !keptIds.has(id));
  const idByKey = new Map<string, string>();

  if (removedIds.length > 0) {
    const { error } = await supabase.from("contract_cebes").delete().in("id", removedIds);
    if (error) {
      // 23503: el CEBE ya tiene gasto distribuido en OC / pagos (FK RESTRICT) -- no se puede borrar.
      if (error.code === "23503") {
        throw new Error("No se puede eliminar un CEBE que ya tiene gasto distribuido en Órdenes de Compra o Solicitudes.");
      }
      throw error;
    }
  }

  // Actualizar primero (puede liberar un código que otra fila nueva quiere usar)
  for (const r of rows.filter((x) => x.id)) {
    const { error } = await supabase
      .from("contract_cebes")
      .update({ company_id: r.company_id, cebe: r.cebe, sort_order: r.sort_order })
      .eq("id", r.id as string);
    if (error) throw error;
    idByKey.set(r.key, r.id as string);
  }

  for (const r of rows.filter((x) => !x.id)) {
    const { data, error } = await supabase
      .from("contract_cebes")
      .insert({ contract_id: contractId, company_id: r.company_id, cebe: r.cebe, sort_order: r.sort_order })
      .select("id")
      .single();
    if (error) throw error;
    idByKey.set(r.key, data.id);
  }
  return idByKey;
};

/** Nombres de empresa por id (para mostrar "CEBE · Empresa"). */
export const useCompanyNames = (companyIds: string[]) => {
  const [names, setNames] = useState<Record<string, string>>({});
  const key = [...companyIds].sort().join(",");

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (ids.length === 0) return;
    let cancelled = false;
    supabase
      .from("companies")
      .select("id, name")
      .in("id", ids)
      .then(({ data }) => {
        if (cancelled) return;
        setNames(Object.fromEntries((data || []).map((c) => [c.id, c.name])));
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return names;
};
