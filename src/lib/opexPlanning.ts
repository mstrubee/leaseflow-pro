// Cálculos del análisis y la propuesta de presupuesto OPEX del año siguiente.
// Regla de negocio: se trabaja con lo comprometido en OC (no lo facturado) y
// el promedio mensual a la fecha; la propuesta base es ese promedio x 12,
// indexado, más los montos que el ADMIN agrega a mano por categoría (globales).

export interface PlanningOrder {
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
  category_id: string;
  amount_clp: number;
}

export interface CategoryPlanRow {
  categoryId: string | null;
  name: string;
  orderCount: number;
  realClp: number;
  avgMonthlyClp: number;
  annualizedClp: number;
  baseProposalClp: number;
  adminClp: number;
  totalProposalClp: number;
  monthlyProposalClp: number;
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
}): CategoryPlanRow[] => {
  const { orders, categories, items, months, indexationPct, ufValue } = params;
  const factor = 1 + indexationPct / 100;
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const acc = new Map<string, { categoryId: string | null; name: string; orderCount: number; realClp: number; adminClp: number }>();
  const slot = (categoryId: string | null) => {
    const key = categoryId ?? "__none__";
    let row = acc.get(key);
    if (!row) {
      row = { categoryId, name: categoryId ? names.get(categoryId) ?? UNCATEGORIZED_NAME : UNCATEGORIZED_NAME, orderCount: 0, realClp: 0, adminClp: 0 };
      acc.set(key, row);
    }
    return row;
  };

  orders.forEach((o) => {
    const row = slot(o.opex_category_id);
    row.orderCount += 1;
    row.realClp += orderAmountClp(o, ufValue);
  });
  items.forEach((i) => {
    slot(i.category_id).adminClp += i.amount_clp;
  });

  return Array.from(acc.values())
    .map((r) => {
      const avgMonthlyClp = r.realClp / months;
      const annualizedClp = avgMonthlyClp * 12;
      const baseProposalClp = annualizedClp * factor;
      const totalProposalClp = baseProposalClp + r.adminClp;
      return {
        ...r,
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
  const acc = new Map<string, { orderCount: number; totalClp: number }>();
  let grandTotal = 0;
  orders.forEach((o) => {
    const key = keyOf(o).trim();
    const amount = orderAmountClp(o, ufValue);
    grandTotal += amount;
    const row = acc.get(key) ?? { orderCount: 0, totalClp: 0 };
    row.orderCount += 1;
    row.totalClp += amount;
    acc.set(key, row);
  });
  return Array.from(acc.entries())
    .map(([name, r]) => ({ name, ...r, percent: grandTotal > 0 ? (r.totalClp / grandTotal) * 100 : 0 }))
    .sort((a, b) => b.totalClp - a.totalClp)
    .slice(0, limit);
};
