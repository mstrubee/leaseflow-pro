import { resolveCategoryId } from "@/lib/opexCategories";

// Cálculos del análisis y la propuesta de presupuesto OPEX del año siguiente.
// Regla de negocio: se trabaja con lo comprometido en OC (no lo facturado) y
// el promedio mensual a la fecha; la propuesta base es ese promedio x 12,
// indexado, más los montos que el ADMIN agrega a mano por categoría (globales).

export interface PlanningOrder {
  id: string;
  order_number: string | null;
  description: string | null;
  company_names: string[];
  amount_clp: number | null;
  amount_uf: number | null;
  order_date: string | null;
  opex_category_id: string | null;
  contract_name: string;
  supplier_name: string;
}

export interface PlanningCategory {
  id: string;
  name: string;
}

export interface PlanningItem {
  id: string;
  category_id: string;
  amount_clp: number;
  source_contract_id: string | null;
  notes: string | null;
  // Excluida de la propuesta (tarjada), no borrada: se puede reincorporar.
  excluded_at: string | null;
}

// Línea considerada en la propuesta: una OC OPEX del año base o un OPEX agregado por el ADMIN.
export interface PlanLine {
  key: string;
  kind: "oc" | "admin";
  id: string;
  date: string | null;
  reference: string;
  contractName: string | null;
  companyNames: string[];
  supplierName: string | null;
  categoryId: string | null;
  description: string | null;
  amountClp: number;
  excluded: boolean;
}

export interface CategoryPlanRow {
  categoryId: string | null;
  name: string;
  orderCount: number;
  realClp: number;
  avgMonthlyClp: number;
  annualizedClp: number;
  baseProposalClp: number;
  // OPEX agregado = parte general (sin contrato, editable en la tabla) + partes que vienen de contratos.
  adminClp: number;
  adminGeneralClp: number;
  adminContractClp: number;
  contractBreakdown: ContractBreakdownRow[];
  totalProposalClp: number;
  monthlyProposalClp: number;
}

export interface ContractBreakdownRow {
  contractId: string;
  amountClp: number;
}

export const UNCATEGORIZED_NAME = "Sin categoría";
const DAYS_PER_MONTH = 365.25 / 12;

// Meses transcurridos del año base hasta hoy (fraccionario, mínimo 1 para no
// inflar el promedio con pocos días). Años cerrados cuentan 12.
export const monthsElapsed = (baseYear: number, today: Date = new Date()): number => {
  const currentYear = today.getFullYear();
  if (baseYear < currentYear) return 12;
  if (baseYear > currentYear) return 1;
  const startOfYear = new Date(currentYear, 0, 1);
  const days = (today.getTime() - startOfYear.getTime()) / 86_400_000 + 1;
  return Math.min(12, Math.max(1, days / DAYS_PER_MONTH));
};

// Monto de la OC en CLP (se usa el monto de la OC, nunca el facturado).
export const orderAmountClp = (order: PlanningOrder, ufValue: number): number => {
  const clp = Math.abs(order.amount_clp ?? 0);
  if (clp > 0) return clp;
  return Math.abs(order.amount_uf ?? 0) * ufValue;
};

export const buildCategoryPlan = (params: {
  orders: PlanningOrder[];
  categories: PlanningCategory[];
  items: PlanningItem[];
  months: number;
  indexationPct: number;
  ufValue: number;
  // Cambios de categorías del año planificado (antigua -> nueva, null = retirada sin destino):
  // el gasto del año base y el OPEX agregado se suman en la categoría final.
  categoryIndex?: Map<string, string | null>;
}): CategoryPlanRow[] => {
  const { orders, categories, items, months, indexationPct, ufValue, categoryIndex } = params;
  const finalCategoryId = (id: string | null): string | null | undefined =>
    id === null || !categoryIndex ? id : resolveCategoryId(id, categoryIndex);
  const factor = 1 + indexationPct / 100;
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const acc = new Map<
    string,
    {
      categoryId: string | null;
      name: string;
      orderCount: number;
      realClp: number;
      adminGeneralClp: number;
      contractAmounts: Map<string, number>;
    }
  >();
  const slot = (categoryId: string | null) => {
    const key = categoryId ?? "__none__";
    let row = acc.get(key);
    if (!row) {
      row = {
        categoryId,
        name: categoryId ? names.get(categoryId) ?? UNCATEGORIZED_NAME : UNCATEGORIZED_NAME,
        orderCount: 0,
        realClp: 0,
        adminGeneralClp: 0,
        contractAmounts: new Map(),
      };
      acc.set(key, row);
    }
    return row;
  };

  // Todas las categorías vigentes aparecen (aunque estén en 0) para poder asignarles OPEX general.
  categories.forEach((c) => slot(c.id));
  orders.forEach((o) => {
    const categoryId = finalCategoryId(o.opex_category_id);
    // Categoría retirada sin destino: su gasto ya no se proyecta (ver droppedByRetirement).
    if (categoryId === null && o.opex_category_id !== null) return;
    const row = slot(categoryId ?? null);
    row.orderCount += 1;
    row.realClp += orderAmountClp(o, ufValue);
  });
  items.forEach((i) => {
    const row = slot(finalCategoryId(i.category_id) ?? i.category_id);
    if (i.source_contract_id) {
      row.contractAmounts.set(i.source_contract_id, (row.contractAmounts.get(i.source_contract_id) ?? 0) + i.amount_clp);
    } else {
      row.adminGeneralClp += i.amount_clp;
    }
  });

  return Array.from(acc.values())
    .map(({ contractAmounts, ...r }) => {
      const contractBreakdown = Array.from(contractAmounts, ([contractId, amountClp]) => ({ contractId, amountClp }));
      const adminContractClp = contractBreakdown.reduce((sum, c) => sum + c.amountClp, 0);
      const adminClp = r.adminGeneralClp + adminContractClp;
      const avgMonthlyClp = r.realClp / months;
      const annualizedClp = avgMonthlyClp * 12;
      const baseProposalClp = annualizedClp * factor;
      const totalProposalClp = baseProposalClp + adminClp;
      return {
        ...r,
        adminClp,
        adminContractClp,
        contractBreakdown,
        avgMonthlyClp,
        annualizedClp,
        baseProposalClp,
        totalProposalClp,
        monthlyProposalClp: totalProposalClp / 12,
      };
    })
    .sort((a, b) => b.totalProposalClp - a.totalProposalClp);
};

// Gasto con OC por mes calendario (índice 0 = enero).
export const sumByMonth = (orders: PlanningOrder[], ufValue: number): number[] => {
  const months = new Array(12).fill(0);
  orders.forEach((o) => {
    if (!o.order_date) return;
    const month = parseInt(o.order_date.slice(5, 7), 10) - 1;
    if (month >= 0 && month < 12) months[month] += orderAmountClp(o, ufValue);
  });
  return months;
};

export interface RankedRow {
  name: string;
  companyNames: string[];
  orderCount: number;
  totalClp: number;
  percent: number;
}

// Ranking por local o proveedor (los nombres vacíos se agrupan en "Sin ...").
export const rankBy = (
  orders: PlanningOrder[],
  keyOf: (order: PlanningOrder) => string,
  ufValue: number,
  limit = 10,
): RankedRow[] => {
  const acc = new Map<string, { orderCount: number; totalClp: number; companyNames: string[] }>();
  let grandTotal = 0;
  orders.forEach((o) => {
    const key = keyOf(o).trim();
    const amount = orderAmountClp(o, ufValue);
    grandTotal += amount;
    const row = acc.get(key) ?? { orderCount: 0, totalClp: 0, companyNames: o.company_names };
    row.orderCount += 1;
    row.totalClp += amount;
    acc.set(key, row);
  });
  return Array.from(acc.entries())
    .map(([name, r]) => ({ name, ...r, percent: grandTotal > 0 ? (r.totalClp / grandTotal) * 100 : 0 }))
    .sort((a, b) => b.totalClp - a.totalClp)
    .slice(0, limit);
};

// Une OC y OPEX agregado en una sola lista de líneas; marca cuáles están excluidas.
export const buildPlanLines = (params: {
  orders: PlanningOrder[];
  items: PlanningItem[];
  excludedOrderIds: Set<string>;
  contractCompanyNames: (contractId: string | null) => { name: string | null; companyNames: string[] };
  ufValue: number;
}): PlanLine[] => {
  const { orders, items, excludedOrderIds, contractCompanyNames, ufValue } = params;
  const ocLines: PlanLine[] = orders.map((o) => ({
    key: `oc-${o.id}`,
    kind: "oc",
    id: o.id,
    date: o.order_date,
    reference: o.order_number ? `OC ${o.order_number}` : "OC",
    contractName: o.contract_name,
    companyNames: o.company_names,
    supplierName: o.supplier_name,
    categoryId: o.opex_category_id,
    description: o.description,
    amountClp: orderAmountClp(o, ufValue),
    excluded: excludedOrderIds.has(o.id),
  }));
  const adminLines: PlanLine[] = items.map((i) => {
    const contract = contractCompanyNames(i.source_contract_id);
    return {
      key: `admin-${i.id}`,
      kind: "admin",
      id: i.id,
      date: null,
      reference: i.source_contract_id ? "OPEX agregado (contrato)" : "OPEX agregado (global)",
      contractName: contract.name,
      companyNames: contract.companyNames,
      supplierName: null,
      categoryId: i.category_id,
      description: i.notes,
      amountClp: i.amount_clp,
      excluded: i.excluded_at !== null,
    };
  });
  return [...adminLines, ...ocLines.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))];
};

// Texto de un monto en CLP escrito por el usuario ("1.500.000", "$ 1500000", vacío = 0).
// Devuelve null si no es un número válido o es negativo.
export const parseClpInput = (raw: string): number | null => {
  const text = raw.replace(/[$\s]/g, "");
  if (text === "") return 0;
  const value = Number(text.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(value) && value >= 0 ? value : null;
};

// Gasto del año base en categorías retiradas sin destino: queda fuera de la proyección del año planificado.
export const droppedByRetirement = (
  orders: PlanningOrder[],
  categoryIndex: Map<string, string | null>,
  ufValue: number,
): { total: number; byCategory: Map<string, number> } => {
  const byCategory = new Map<string, number>();
  let total = 0;
  orders.forEach((o) => {
    if (o.opex_category_id === null || resolveCategoryId(o.opex_category_id, categoryIndex) !== null) return;
    const amount = orderAmountClp(o, ufValue);
    total += amount;
    byCategory.set(o.opex_category_id, (byCategory.get(o.opex_category_id) ?? 0) + amount);
  });
  return { total, byCategory };
};
