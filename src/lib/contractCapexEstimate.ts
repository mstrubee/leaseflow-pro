import { supabase } from "@/integrations/supabase/client";
import { loadBudgetTotals } from "@/lib/budgetTotals";

/**
 * CAPEX estimado (en UF) del Business Case Financiero de cada contrato: total
 * de inversión sin el inventario/capital de trabajo -- mismo cálculo que la
 * columna "Capex Est." de /contracts y que /capex usa para contratos sin
 * presupuesto CAPEX real. El Business Case viene en MM CLP, se pasa a UF con
 * `ufValue` (si es 0, no se puede convertir y no se devuelve nada).
 */
export async function loadBusinessCaseCapexUF(
  contractIds: string[],
  ufValue: number,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (contractIds.length === 0 || !(ufValue > 0)) return result;
  const { data, error } = await supabase
    .from("contract_business_cases")
    .select("contract_id, computed")
    .in("contract_id", contractIds);
  if (error) throw error;
  (data || []).forEach((row) => {
    const computed = row.computed as { inv?: { total?: number; rows?: { id: string; monto: number }[] } } | null;
    const total = computed?.inv?.total || 0;
    const inventario = computed?.inv?.rows?.find((r) => r.id === "inv")?.monto || 0;
    const capexEstMM = total - inventario;
    if (capexEstMM > 0) result.set(row.contract_id, (capexEstMM * 1_000_000) / ufValue);
  });
  return result;
}

/**
 * CAPEX (en UF) de cada contrato para el año `fromYear` en adelante (ej. año
 * en curso y siguientes): suma, por contrato, todos sus presupuestos CAPEX de
 * esos años -- cada uno con el monto de la tarjeta o, si está en 0, el total
 * de las líneas del Control Presupuestario (misma regla que /capex). Si el
 * contrato no tiene ninguno con monto, se usa el estimado del Business Case.
 */
export async function loadContractCapexUF(
  contractIds: string[],
  ufValue: number,
  fromYear: number,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (contractIds.length === 0) return result;

  const { data: budgets, error } = await supabase
    .from("contract_budgets")
    .select("id, contract_id, amount_uf")
    .eq("budget_type", "capex")
    .gte("year", fromYear)
    .in("contract_id", contractIds);
  if (error) throw error;

  const totals = await loadBudgetTotals((budgets || []).map((b) => b.id), ufValue || 0);
  (budgets || []).forEach((b) => {
    const fromLines = totals.get(b.id)?.grand || 0;
    const amount = fromLines > 0 ? fromLines : b.amount_uf || 0;
    result.set(b.contract_id, (result.get(b.contract_id) || 0) + amount);
  });

  const withoutCapex = contractIds.filter((id) => (result.get(id) || 0) <= 0);
  const estimated = await loadBusinessCaseCapexUF(withoutCapex, ufValue);
  estimated.forEach((uf, id) => result.set(id, uf));
  return result;
}
