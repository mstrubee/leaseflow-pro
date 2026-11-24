import { supabase } from "@/integrations/supabase/client";

/**
 * Mantiene el badge de estado de las líneas CAPEX sincronizado con sus OC
 * reales -- se llama después de crear, editar o eliminar una Orden de Compra
 * (o sus asociaciones en purchase_order_budget_lines).
 *
 * - Las líneas recién asociadas a una OC pasan a "Con OC".
 * - Las líneas que quedaron sin ninguna OC asociada (ni en
 *   purchase_order_budget_lines ni como purchase_orders.budget_line_id
 *   -- columna legacy de compatibilidad) vuelven a "Sin Cotización"
 *   (progress_status_id = null), salvo que sigan ligadas a otra orden vigente
 *   (una línea puede repartirse entre varias OC).
 */
export async function syncBudgetLineOcStatus(opts: {
  addedLineIds?: string[];
  removedLineIds?: string[];
}): Promise<void> {
  const added = [...new Set((opts.addedLineIds || []).filter(Boolean))];
  const removed = [...new Set((opts.removedLineIds || []).filter(Boolean))].filter((id) => !added.includes(id));

  if (added.length > 0) {
    const { data: statuses } = await supabase
      .from("budget_line_progress_statuses")
      .select("id, name")
      .eq("is_active", true);
    const conOcStatusId = (statuses || []).find((s: any) => s.name.trim().toLowerCase() === "con oc")?.id ?? null;
    if (conOcStatusId) {
      await supabase.from("budget_lines").update({ progress_status_id: conOcStatusId }).in("id", added);
    }
  }

  if (removed.length > 0) {
    const [{ data: stillLinked }, { data: stillPrimary }] = await Promise.all([
      supabase.from("purchase_order_budget_lines").select("budget_line_id").in("budget_line_id", removed),
      supabase.from("purchase_orders").select("budget_line_id").in("budget_line_id", removed).is("deleted_at", null),
    ]);
    const stillLinkedIds = new Set([
      ...((stillLinked || []).map((r: any) => r.budget_line_id)),
      ...((stillPrimary || []).map((r: any) => r.budget_line_id)),
    ]);
    const toReset = removed.filter((id) => !stillLinkedIds.has(id));
    if (toReset.length > 0) {
      await supabase.from("budget_lines").update({ progress_status_id: null }).in("id", toReset);
    }
  }
}
