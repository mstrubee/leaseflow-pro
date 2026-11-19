import { supabase } from "@/integrations/supabase/client";

/** Páginas de 1000: PostgREST devuelve como máximo 1000 filas por consulta. */
const PAGE_SIZE = 1000;
async function fetchAllPages(
  build: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>
): Promise<{ data: any[]; error: any }> {
  const all: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) return { data: all, error };
    all.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return { data: all, error: null };
}

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/**
 * Líneas CAPEX de "Aprobadas" (Solicita Autorización). Una línea está ahí si:
 *  1. está "Autorizado" y PROVIENE de una aprobación desde Pendientes: budget_lines_audit
 *     registra el paso solicita_autorizar -> autorizado (no importa hace cuánto);
 *  2. es una línea hoja real: no madre (su `status` es vestigial), ni marca de traslado,
 *     ni recargo;
 *  3. todavía no tiene Requerimiento de OC DEFINITIVO: su estado de avance no es "OC
 *     Requerida". "Guardar temporalmente" deja la línea en "Cotizado" (con la cotización
 *     guardada en oc_quotations) y eso NO cuenta como requerimiento;
 *  4. no tiene OC asociada (directa o por tabla puente, sin contar las eliminadas) ni
 *     Solicitud de OC: ese flujo ya pasó.
 * Si se borra un requerimiento, la línea vuelve a cumplir (3) y reaparece.
 */
export async function loadApprovedCapexLines(): Promise<any[]> {
  // 1. Ids de líneas aprobadas desde Pendientes.
  const { data: auditRows, error: auditError } = await fetchAllPages((from, to) =>
    supabase
      .from("budget_lines_audit")
      .select("budget_line_id")
      .eq("action", "update")
      .eq("old_values->>status", "solicita_autorizar")
      .eq("new_values->>status", "autorizado")
      .order("id")
      .range(from, to)
  );
  if (auditError) console.error("Error loading approval history:", auditError);
  const approvedFromPendingIds = [...new Set(auditRows.map((r) => r.budget_line_id as string))];
  if (approvedFromPendingIds.length === 0) return [];

  // Estado "OC Requerida" (requerimiento definitivo).
  const { data: statusRows } = await (supabase as any).from("budget_line_progress_statuses").select("id, name");
  const ocRequeridaId: string | null =
    ((statusRows || []) as { id: string; name: string }[]).find((st) => st.name.trim().toLowerCase() === "oc requerida")?.id ?? null;

  // 2. Esas líneas, si siguen autorizadas y son hojas reales de un presupuesto CAPEX.
  const lineChunks = await Promise.all(
    chunkArray(approvedFromPendingIds, 100).map((ids) =>
      supabase
        .from("budget_lines")
        .select("id, name, amount_uf, status, authorized_at, rejected_at, rejection_note, quotation_file_url, quotation_file_name, quotation_storage_path, currency, supplier_id, supplier_name, budget_id, progress_status_id, contract_budgets!inner(contract_id, year, budget_type)")
        .in("id", ids)
        .is("deleted_at", null)
        .eq("status", "autorizado")
        .eq("is_ghost", false)
        .eq("is_surcharge", false)
        .is("merged_into_line_id", null)
        .eq("contract_budgets.budget_type", "capex")
    )
  );
  let candidates: any[] = [];
  lineChunks.forEach(({ data, error }) => {
    if (error) console.error("Error loading approved CAPEX lines:", error);
    candidates.push(...(data || []));
  });

  // 3. Sin Requerimiento de OC definitivo.
  if (ocRequeridaId) candidates = candidates.filter((r) => r.progress_status_id !== ocRequeridaId);
  if (candidates.length === 0) return [];

  // 2b. Sin hijas (una línea madre no admite requerimiento).
  // 4. Sin OC ni Solicitud de OC asociada.
  const withOcOrChildren = new Set<string>();
  const parentIds = new Set<string>();
  await Promise.all(
    chunkArray(candidates.map((r) => r.id as string), 100).map(async (ids) => {
      const [children, poDirect, poJunction, requestDirect, requestJunction] = await Promise.all([
        fetchAllPages((from, to) =>
          supabase.from("budget_lines").select("id, parent_id").in("parent_id", ids).is("deleted_at", null).order("id").range(from, to)
        ),
        supabase.from("purchase_orders").select("budget_line_id").in("budget_line_id", ids).is("deleted_at", null),
        supabase
          .from("purchase_order_budget_lines")
          .select("budget_line_id, purchase_orders!inner(deleted_at)")
          .in("budget_line_id", ids)
          .is("purchase_orders.deleted_at", null),
        supabase.from("oc_requests").select("budget_line_id").in("budget_line_id", ids),
        supabase.from("oc_budget_lines").select("budget_line_id").in("budget_line_id", ids),
      ]);
      if (children.error) console.error("Error loading child lines:", children.error);
      children.data.forEach((c) => c.parent_id && parentIds.add(c.parent_id));
      [poDirect, poJunction, requestDirect, requestJunction].forEach(({ data, error }) => {
        if (error) console.error("Error loading OC links:", error);
        (data || []).forEach((r: any) => r.budget_line_id && withOcOrChildren.add(r.budget_line_id));
      });
    })
  );
  return candidates.filter((r) => !parentIds.has(r.id) && !withOcOrChildren.has(r.id));
}
