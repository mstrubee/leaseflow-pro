import { supabase } from "@/integrations/supabase/client";
import {
  DistRow,
  PaymentSubline,
  buildPaymentSublines,
  isMixedLocal,
  rescaleRows,
  withPercents,
} from "@/lib/cebeDistribution";

/**
 * Persistencia de la distribución por CEBE de un documento (Requerimiento, Solicitud u OC)
 * y de las sublíneas por CEBE de su plan de pagos. Ver migración 20261127120000.
 *
 * Un documento se identifica igual que en oc_payment_plans:
 *   requirement -> oc_quotations.quotation_number
 *   request     -> oc_requests.id
 *   order       -> purchase_orders.id
 */
export interface DocRef {
  kind: "requirement" | "request" | "order";
  /** Solo se usa al GUARDAR (contract_id de la fila); para leer/borrar basta `id`. */
  contractId: string;
  /** quotation_number (requirement) o id del documento (request/order). */
  id: string;
}

export interface StoredAllocation {
  cebeId: string;
  amount: number;
  percent: number;
}

const docColumns = (ref: DocRef) =>
  ref.kind === "request"
    ? { oc_request_id: ref.id }
    : ref.kind === "order"
      ? { purchase_order_id: ref.id }
      : { quotation_number: ref.id };

export async function loadDistribution(ref: DocRef): Promise<StoredAllocation[]> {
  const base = supabase
    .from("oc_cebe_distributions")
    .select("cebe_id, amount_clp, percent, created_at")
    .order("created_at", { ascending: true });
  // quotation_number es único en la práctica (COT-<timestamp>), igual que para oc_payment_plans.
  const { data, error } =
    ref.kind === "request"
      ? await base.eq("oc_request_id", ref.id)
      : ref.kind === "order"
        ? await base.eq("purchase_order_id", ref.id)
        : await base.eq("quotation_number", ref.id);
  if (error) throw error;
  return (data || []).map((r) => ({ cebeId: r.cebe_id, amount: Number(r.amount_clp), percent: Number(r.percent) }));
}

export async function deleteDistribution(ref: DocRef): Promise<void> {
  const base = supabase.from("oc_cebe_distributions").delete();
  const { error } =
    ref.kind === "request"
      ? await base.eq("oc_request_id", ref.id)
      : ref.kind === "order"
        ? await base.eq("purchase_order_id", ref.id)
        : await base.eq("quotation_number", ref.id);
  if (error) throw error;
}

/** Reemplaza la distribución del documento por `rows` (que deben sumar `total`). */
export async function saveDistribution(ref: DocRef, rows: DistRow[], total: number): Promise<void> {
  await deleteDistribution(ref);
  if (rows.length === 0) return;
  const pcts = withPercents(rows, total, 4);
  const { error } = await supabase.from("oc_cebe_distributions").insert(
    pcts.map((r) => ({
      contract_id: ref.contractId,
      ...docColumns(ref),
      cebe_id: r.cebeId,
      percent: r.percent,
      amount_clp: r.amount,
    })),
  );
  if (error) throw error;
}

/** Convierte lo guardado a filas editables. */
export const allocationsToRows = (allocs: StoredAllocation[]): DistRow[] =>
  allocs.map((a) => ({ cebeId: a.cebeId, amount: a.amount, source: "manual" as const }));

/**
 * Copia la distribución de un documento al siguiente del flujo (Requerimiento → Solicitud →
 * OC), ajustada al total del nuevo documento. No hace nada si el origen no tiene distribución
 * (local con un solo CEBE o documento anterior a esta función).
 * Devuelve true si copió algo.
 */
export async function copyDistribution(from: DocRef, to: DocRef, newTotal: number): Promise<boolean> {
  const stored = await loadDistribution(from);
  if (!isMixedLocal(stored.length)) return false;
  const rows = rescaleRows(allocationsToRows(stored), newTotal);
  await saveDistribution(to, rows, newTotal);
  return true;
}

/**
 * Re-ajusta la distribución guardada de un documento a un nuevo total (cuando se edita el
 * monto del documento) y regenera las sublíneas de su plan de pagos.
 */
export async function rescaleStoredDistribution(ref: DocRef, newTotal: number): Promise<void> {
  const stored = await loadDistribution(ref);
  if (!isMixedLocal(stored.length)) return;
  const rows = rescaleRows(allocationsToRows(stored), newTotal);
  await saveDistribution(ref, rows, newTotal);
  await syncPaymentSublines(ref);
}

/**
 * Regenera las sublíneas por CEBE de TODOS los pagos del documento, a partir de la
 * distribución guardada (la distribución de la OC es la fuente de verdad). Llamar después
 * de cualquier cambio al plan de pagos. Si el documento no tiene distribución, borra las
 * sublíneas que hubiera. `ufValue` solo se usa para pagos sin monto en pesos guardado.
 */
export async function syncPaymentSublines(ref: DocRef, opts: { ufValue?: number } = {}): Promise<void> {
  const planBase = supabase.from("oc_payment_plans").select("id, amount_clp, amount_uf, payment_number").order("payment_number");
  const [distribution, plansRes] = await Promise.all([
    loadDistribution(ref),
    ref.kind === "request"
      ? planBase.eq("oc_request_id", ref.id)
      : ref.kind === "order"
        ? planBase.eq("purchase_order_id", ref.id)
        : planBase.eq("quotation_number", ref.id),
  ]);
  if (plansRes.error) throw plansRes.error;
  const plans = plansRes.data || [];
  if (plans.length === 0) return;
  const planIds = plans.map((p) => p.id);

  const del = await supabase.from("oc_payment_plan_cebes").delete().in("payment_plan_id", planIds);
  if (del.error) throw del.error;

  if (!isMixedLocal(distribution.length)) return;

  const payable = plans
    .map((p) => ({
      id: p.id,
      amount:
        p.amount_clp != null
          ? Math.round(Number(p.amount_clp))
          : opts.ufValue && opts.ufValue > 0
            ? Math.round(Number(p.amount_uf || 0) * opts.ufValue)
            : null,
    }))
    .filter((p): p is { id: string; amount: number } => p.amount !== null);
  if (payable.length === 0) return;

  const sublines = buildPaymentSublines(
    payable.map((p) => p.amount),
    distribution.map((d) => ({ cebeId: d.cebeId, amount: d.amount })),
  );
  const rows = payable.flatMap((p, i) =>
    sublines[i].map((s) => ({ payment_plan_id: p.id, cebe_id: s.cebeId, percent: s.percent, amount_clp: s.amount })),
  );
  const { error } = await supabase.from("oc_payment_plan_cebes").insert(rows);
  if (error) throw error;
}

export async function loadPaymentSublines(planIds: string[]): Promise<Map<string, PaymentSubline[]>> {
  const out = new Map<string, PaymentSubline[]>();
  if (planIds.length === 0) return out;
  const { data, error } = await supabase
    .from("oc_payment_plan_cebes")
    .select("payment_plan_id, cebe_id, percent, amount_clp, created_at")
    .in("payment_plan_id", planIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  (data || []).forEach((r) => {
    const list = out.get(r.payment_plan_id) ?? [];
    list.push({ cebeId: r.cebe_id, amount: Number(r.amount_clp), percent: Number(r.percent) });
    out.set(r.payment_plan_id, list);
  });
  return out;
}
