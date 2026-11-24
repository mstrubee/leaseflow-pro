import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CoOrder, CoOrderDraft, parseCoAmount } from "@/lib/coOrders";

export const fetchCoOrders = async (contractId: string): Promise<CoOrder[]> => {
  const { data, error } = await supabase
    .from("contract_co_orders")
    .select("id, co_number, amount_uf")
    .eq("contract_id", contractId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id,
    co_number: r.co_number,
    amount_uf: r.amount_uf === null ? null : Number(r.amount_uf),
  }));
};

/**
 * Guarda las Órdenes CO de un contrato. SOLO admin (lo exige también la RLS de la
 * tabla). Filas vacías se ignoran; las que ya no están en `drafts` se borran.
 */
export const saveCoOrders = async (
  contractId: string,
  drafts: CoOrderDraft[],
  originalIds: string[],
  userId: string | null,
): Promise<void> => {
  const rows = drafts
    .filter((d) => d.co_number.trim().length > 0)
    .map((d, index) => ({
      id: d.id,
      co_number: d.co_number.trim(),
      amount_uf: parseCoAmount(d.amount),
      sort_order: index,
    }));

  const keptIds = new Set(rows.map((r) => r.id).filter(Boolean) as string[]);
  const removedIds = originalIds.filter((id) => !keptIds.has(id));

  if (removedIds.length > 0) {
    const { error } = await supabase.from("contract_co_orders").delete().in("id", removedIds);
    if (error) throw error;
  }

  const inserts = rows
    .filter((r) => !r.id)
    .map((r) => ({
      contract_id: contractId,
      co_number: r.co_number,
      amount_uf: r.amount_uf,
      sort_order: r.sort_order,
      created_by: userId,
    }));
  if (inserts.length > 0) {
    const { error } = await supabase.from("contract_co_orders").insert(inserts);
    if (error) throw error;
  }

  for (const r of rows.filter((x) => x.id)) {
    const { error } = await supabase
      .from("contract_co_orders")
      .update({ co_number: r.co_number, amount_uf: r.amount_uf, sort_order: r.sort_order })
      .eq("id", r.id as string);
    if (error) throw error;
  }
};

/** Carga (solo lectura) las Órdenes CO de un contrato. */
export const useContractCoOrders = (contractId: string | undefined) => {
  const [orders, setOrders] = useState<CoOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!contractId) {
      setOrders([]);
      setLoading(false);
      return;
    }
    try {
      setOrders(await fetchCoOrders(contractId));
    } catch (error) {
      // Si la tabla aún no existe (migración pendiente) no rompemos el módulo:
      // sin CO rige el monto congelado manual.
      console.error("Error loading CO orders:", error);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { orders, loading, reload };
};
