import { supabase } from "@/integrations/supabase/client";
import { fetchCoOrders } from "@/hooks/useContractCoOrders";
import type { CoOrder } from "@/lib/coOrders";

/** Órdenes CO de un contrato, identificadas con el nombre del contrato al que pertenecen. */
export interface ContractCoGroup {
  contractId: string;
  contractName: string;
  orders: CoOrder[];
}

/**
 * Órdenes CO de los contratos de una solicitud, cada una asociada a SU contrato.
 * Se leen de las Órdenes CO vigentes del contrato (tabla contract_co_orders), así se ven también en
 * solicitudes creadas antes de que el contrato tuviera su Orden CO. Si falla la lectura devuelve [].
 */
export async function loadContractCoGroups(contractIds: string[]): Promise<ContractCoGroup[]> {
  const ids = [...new Set(contractIds.filter(Boolean))];
  if (ids.length === 0) return [];
  try {
    const [namesRes, ...orders] = await Promise.all([
      supabase.from("contracts").select("id, name").in("id", ids),
      ...ids.map((id) => fetchCoOrders(id)),
    ]);
    const names = new Map((namesRes.data || []).map((c) => [c.id, c.name as string]));
    return ids.map((id, i) => ({ contractId: id, contractName: names.get(id) || "Contrato", orders: orders[i] }));
  } catch (error) {
    console.error("No se pudieron leer las Órdenes CO de la solicitud:", error);
    return [];
  }
}

/**
 * Texto de las Órdenes CO de una solicitud.
 * - Un solo contrato: "CO-1, CO-2".
 * - Varios contratos: una línea por contrato, "Nombre del contrato: CO-1, CO-2" (o "sin Orden CO").
 * null si ningún contrato tiene Orden CO.
 */
export function formatCoGroups(groups: ContractCoGroup[]): string | null {
  const numbersOf = (g: ContractCoGroup) => g.orders.map((o) => o.co_number.trim()).filter(Boolean);
  if (!groups.some((g) => numbersOf(g).length > 0)) return null;
  if (groups.length === 1) return numbersOf(groups[0]).join(", ");
  return groups
    .map((g) => {
      const nums = numbersOf(g);
      return `${g.contractName}: ${nums.length > 0 ? nums.join(", ") : "sin Orden CO"}`;
    })
    .join("\n");
}
