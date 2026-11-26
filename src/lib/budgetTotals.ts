import { supabase } from "@/integrations/supabase/client";
import {
  BudgetLine,
  buildBudgetTree,
  calculateLineLiveAmount,
  calculateGrandTotal,
  calculateAuthorizedTotal,
  calculateUnauthorizedTotal,
} from "@/components/budget/BudgetLineTree";

export interface BudgetTotal {
  grand: number;
  authorized: number;
  unauthorized: number;
}

const SELECT_COLS =
  "id, budget_id, parent_id, name, description, amount_uf, status, display_order, quantity, unit_type, currency, unit_price, template_line_id, supplier_id, supplier_name, category_id, calc_type, calc_source_line_id, calc_percentage, is_surcharge, surcharge_parent_line_id, surcharge_reason, merged_into_line_id, original_amount_uf, is_ghost, moved_to_line_id, moved_at, moved_by";

/**
 * Todas las líneas de los presupuestos dados (paginadas) y los precios de plantilla de las que
 * están ligadas a una plantilla (misma forma que usa BudgetModule: por id de línea).
 */
async function loadBudgetLinesWithTemplatePrices(
  budgetIds: string[],
): Promise<{ all: BudgetLine[]; templatePricesMap: Record<string, number> }> {
  // Líneas (paginadas)
  const PAGE = 1000;
  let all: BudgetLine[] = [];
  let from = 0;
  let more = true;
  while (more) {
    const { data, error } = await supabase
      .from("budget_lines")
      .select(SELECT_COLS)
      .in("budget_id", budgetIds)
      .is("deleted_at", null)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    all = all.concat((data || []) as unknown as BudgetLine[]);
    more = (data?.length || 0) === PAGE;
    from += PAGE;
  }

  // Precios de plantilla (same shape BudgetModule uses: keyed by line.id)
  const linesWithTpl = all.filter((l) => l.template_line_id);
  const templatePricesMap: Record<string, number> = {};
  if (linesWithTpl.length > 0) {
    const uniqueTplIds = [
      ...new Set(linesWithTpl.map((l) => l.template_line_id!)),
    ];
    const { data: tpls, error: tplErr } = await supabase
      .from("budget_template_lines")
      .select("id, default_amount_uf")
      .in("id", uniqueTplIds);
    if (tplErr) throw tplErr;
    const byTplId: Record<string, number> = {};
    (tpls || []).forEach((t: { id: string; default_amount_uf: number | null }) => {
      byTplId[t.id] = t.default_amount_uf || 0;
    });
    linesWithTpl.forEach((l) => {
      templatePricesMap[l.id] = byTplId[l.template_line_id!] ?? 0;
    });
  }

  return { all, templatePricesMap };
}

/**
 * Load CAPEX/OPEX totals for a set of budget IDs using the *same* aggregation
 * pipeline as the "Control de Presupuesto" tree (BudgetLineTree).
 *
 * Returns a Map<budgetId, { grand, authorized, unauthorized }> in UF.
 */
export async function loadBudgetTotals(
  budgetIds: string[],
  ufValue: number,
): Promise<Map<string, BudgetTotal>> {
  const result = new Map<string, BudgetTotal>();
  if (!budgetIds.length) return result;

  // 1) y 2) Líneas de estos presupuestos (paginadas) y precios de plantilla
  const { all, templatePricesMap } = await loadBudgetLinesWithTemplatePrices(budgetIds);

  // 3) Internal-transfer supplier set (excluded from totals just like BudgetModule)
  const supplierIds = [
    ...new Set(all.map((l) => l.supplier_id).filter(Boolean) as string[]),
  ];
  const internalSet = new Set<string>();
  if (supplierIds.length > 0) {
    const { data: sups } = await supabase
      .from("suppliers")
      .select("id, is_internal_transfer")
      .in("id", supplierIds);
    (sups || []).forEach((s: { id: string; is_internal_transfer: boolean | null }) => {
      if (s.is_internal_transfer) internalSet.add(s.id);
    });
  }

  // 4) Aggregate per budget
  budgetIds.forEach((budgetId) => {
    const flat = all.filter((l) => l.budget_id === budgetId);
    const tree = buildBudgetTree(flat);
    result.set(budgetId, {
      grand: calculateGrandTotal(tree, templatePricesMap, ufValue, internalSet),
      authorized: calculateAuthorizedTotal(
        tree,
        templatePricesMap,
        ufValue,
        internalSet,
      ),
      unauthorized: calculateUnauthorizedTotal(
        tree,
        templatePricesMap,
        ufValue,
        internalSet,
      ),
    });
  });

  return result;
}

/**
 * Monto de cada línea de presupuesto tal como lo muestra el "Control de Presupuesto" (monto en vivo:
 * suma de sus hijos, precios de plantilla, recargos %), en PESOS al valor UF dado. Es el monto
 * autorizado/asignado de la línea, no lo imputado a una solicitud.
 *
 * Mismos parámetros que usa BudgetModule para el monto de una línea (calculateLineLiveAmount sin
 * exclusión de transferencias internas), para que el PDF y la pantalla coincidan.
 */
export async function loadBudgetLineAmountsClp(lineIds: string[], ufValue: number): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const ids = [...new Set(lineIds.filter(Boolean))];
  if (ids.length === 0 || !(ufValue > 0)) return out;

  const { data: rows, error } = await supabase.from("budget_lines").select("id, budget_id").in("id", ids);
  if (error) throw error;
  const budgetIds = [...new Set((rows || []).map((r) => r.budget_id).filter(Boolean) as string[])];
  if (budgetIds.length === 0) return out;

  const { all, templatePricesMap } = await loadBudgetLinesWithTemplatePrices(budgetIds);

  // Árbol -> mapa id -> nodo (con hijos), igual que flattenLines en BudgetModule
  const byId = new Map<string, BudgetLine>();
  const walk = (nodes: BudgetLine[]) =>
    nodes.forEach((n) => {
      byId.set(n.id, n);
      if (n.children?.length) walk(n.children);
    });
  walk(buildBudgetTree(all));

  ids.forEach((id) => {
    const node = byId.get(id);
    if (!node) return;
    out.set(id, Math.round(calculateLineLiveAmount(node, byId, templatePricesMap, ufValue) * ufValue));
  });
  return out;
}
