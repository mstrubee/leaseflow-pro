import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { BudgetLine, buildBudgetTree } from "@/components/budget/BudgetLineTree";

const SELECT_COLS =
  "id, budget_id, parent_id, name, description, amount_uf, status, display_order, quantity, unit_type, currency, unit_price, template_line_id, supplier_id, supplier_name, category_id, calc_type, calc_source_line_id, calc_percentage, progress_status_id, is_surcharge, surcharge_parent_line_id, surcharge_reason, merged_into_line_id, original_amount_uf, is_ghost, moved_to_line_id, moved_at, moved_by";

export interface CapexExportContract {
  contract_id: string;
  contract_name: string;
  clasificacion: string | null;
  company_names: string[];
  superficie: number;
  year: number;
  budget_ids: string[];
  legacy_amount_uf?: number;
}

interface Row {
  values: (string | number | null)[];
  formulas: Record<number, string>; // col index -> formula
  style?: "contract" | "subtotal" | "grand" | "leaf" | "group";
}

// Column layout (0-indexed)
// 0 Contrato | 1 Empresa | 2 Clasif | 3 Año | 4 Nivel | 5 Categoría/Línea
// 6 Proveedor | 7 Cantidad | 8 Unidad | 9 Precio UF | 10 Monto UF
// 11 Monto CLP | 12 UF/m² | 13 m²
const HEADERS = [
  "Contrato",
  "Empresa",
  "Clasificación",
  "Año",
  "Nivel",
  "Categoría / Línea",
  "Proveedor",
  "Cantidad",
  "Unidad",
  "Precio Unit. (UF)",
  "Monto (UF)",
  "Monto (CLP)",
  "UF/m²",
  "m²",
];
const COL = {
  qty: 7,
  price: 9,
  uf: 10,
  clp: 11,
  ufm2: 12,
  m2: 13,
};

const colLetter = (idx: number) => XLSX.utils.encode_col(idx);
const cellRef = (row: number, col: number) => `${colLetter(col)}${row + 1}`; // row 0-indexed → 1-indexed Excel

async function loadLinesForBudgets(budgetIds: string[]) {
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

  const tplIds = [...new Set(all.map((l) => l.template_line_id).filter(Boolean) as string[])];
  const templatePricesMap: Record<string, number> = {};
  if (tplIds.length) {
    const { data: tpls } = await supabase
      .from("budget_template_lines")
      .select("id, default_amount_uf")
      .in("id", tplIds);
    const byId: Record<string, number> = {};
    (tpls || []).forEach((t: any) => (byId[t.id] = t.default_amount_uf || 0));
    all.forEach((l) => {
      if (l.template_line_id) templatePricesMap[l.id] = byId[l.template_line_id] ?? 0;
    });
  }

  const supIds = [...new Set(all.map((l) => l.supplier_id).filter(Boolean) as string[])];
  const internal = new Set<string>();
  if (supIds.length) {
    const { data: sups } = await supabase
      .from("suppliers")
      .select("id, is_internal_transfer")
      .in("id", supIds);
    (sups || []).forEach((s: any) => s.is_internal_transfer && internal.add(s.id));
  }

  return { all, templatePricesMap, internal };
}

function isExcluded(l: BudgetLine, internal: Set<string>) {
  if (l.is_ghost) return true;
  if (l.merged_into_line_id) return true;
  if (l.is_surcharge) return true;
  if (l.supplier_id && internal.has(l.supplier_id)) return true;
  return false;
}

export async function exportCapexToExcel(
  contracts: CapexExportContract[],
  ufValue: number,
  yearLabel: string,
) {
  const allBudgetIds = contracts.flatMap((c) => c.budget_ids);
  const { all, templatePricesMap, internal } = allBudgetIds.length
    ? await loadLinesForBudgets(allBudgetIds)
    : { all: [], templatePricesMap: {}, internal: new Set<string>() };

  const rows: Row[] = [];
  // Row 0: UF value
  rows.push({
    values: ["Valor UF", ufValue, null, null, null, null, null, null, null, null, null, null, null, null],
    formulas: {},
    style: "group",
  });
  // Row 1: headers
  rows.push({ values: HEADERS as any, formulas: {}, style: "group" });

  const contractSubtotalRows: number[] = [];

  for (const c of contracts) {
    // Contract header row
    const contractHeaderRowIdx = rows.length;
    rows.push({
      values: [
        c.contract_name,
        c.company_names.join(", "),
        c.clasificacion || "",
        c.year,
        0,
        `▶ ${c.contract_name}`,
        null,
        null,
        null,
        null,
        null, // monto uf set later as SUM of root child rows
        null, // monto clp formula
        null, // UF/m² formula
        c.superficie || null,
      ],
      formulas: {},
      style: "contract",
    });

    // Build tree for this contract (combining all its budget_ids)
    const flat = all.filter((l) => c.budget_ids.includes(l.budget_id) && !isExcluded(l, internal));
    const tree = buildBudgetTree(flat);

    // Emit nodes recursively; return row index of this node and its monto col fills.
    const emitNode = (node: BudgetLine, depth: number): number => {
      const rowIdx = rows.length;
      const hasChildren = !!(node.children && node.children.length > 0);
      const unitPrice =
        node.template_line_id != null
          ? templatePricesMap[node.id] ?? 0
          : node.unit_price ?? null;
      const qty = node.quantity ?? null;

      const indent = "    ".repeat(depth);
      const row: Row = {
        values: [
          null,
          null,
          null,
          null,
          depth + 1,
          `${indent}${node.name}`,
          node.supplier_name || "",
          hasChildren ? null : qty,
          hasChildren ? null : node.unit_type || "",
          hasChildren ? null : unitPrice,
          null, // monto uf assigned after children
          null, // CLP
          null, // UF/m²
          null,
        ],
        formulas: {},
        style: hasChildren ? "group" : "leaf",
      };
      rows.push(row);

      if (hasChildren) {
        const childRowIdxs = node.children!.map((ch) => emitNode(ch, depth + 1));
        // Monto UF = sum of children's Monto UF cells
        const refs = childRowIdxs.map((r) => cellRef(r, COL.uf)).join(",");
        row.formulas[COL.uf] = `SUM(${refs})`;
      } else {
        // Leaf: if both qty and price present, use formula; else hardcoded amount_uf (editable)
        if (qty != null && unitPrice != null && qty !== 0) {
          row.formulas[COL.uf] = `${cellRef(rowIdx, COL.qty)}*${cellRef(rowIdx, COL.price)}`;
        } else {
          row.values[COL.uf] = node.amount_uf || 0;
        }
      }
      // Monto CLP = UF * UF_VALUE (cell B1)
      row.formulas[COL.clp] = `${cellRef(rowIdx, COL.uf)}*$B$1`;
      return rowIdx;
    };

    const rootRowIdxs = tree.map((n) => emitNode(n, 1));

    // Patch contract header subtotal formulas
    const header = rows[contractHeaderRowIdx];
    if (rootRowIdxs.length) {
      const refs = rootRowIdxs.map((r) => cellRef(r, COL.uf)).join(",");
      header.formulas[COL.uf] = `SUM(${refs})`;
    } else {
      header.values[COL.uf] = 0;
    }
    header.formulas[COL.clp] = `${cellRef(contractHeaderRowIdx, COL.uf)}*$B$1`;
    if (c.superficie && c.superficie > 0) {
      header.formulas[COL.ufm2] = `IFERROR(${cellRef(contractHeaderRowIdx, COL.uf)}/${cellRef(contractHeaderRowIdx, COL.m2)},0)`;
    }
    contractSubtotalRows.push(contractHeaderRowIdx);
  }

  // Grand total row
  const grandRowIdx = rows.length;
  const grandRow: Row = {
    values: ["TOTAL GENERAL", null, null, null, null, null, null, null, null, null, null, null, null, null],
    formulas: {},
    style: "grand",
  };
  if (contractSubtotalRows.length) {
    const refs = contractSubtotalRows.map((r) => cellRef(r, COL.uf)).join(",");
    grandRow.formulas[COL.uf] = `SUM(${refs})`;
    grandRow.formulas[COL.clp] = `${cellRef(grandRowIdx, COL.uf)}*$B$1`;
  } else {
    grandRow.values[COL.uf] = 0;
    grandRow.values[COL.clp] = 0;
  }
  rows.push(grandRow);

  // Build sheet
  const aoa = rows.map((r) => r.values);
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Inject formulas and number formats
  rows.forEach((r, rIdx) => {
    Object.entries(r.formulas).forEach(([cIdxStr, f]) => {
      const cIdx = Number(cIdxStr);
      const ref = XLSX.utils.encode_cell({ r: rIdx, c: cIdx });
      ws[ref] = { t: "n", f };
    });
    // Number formats
    [COL.qty, COL.price, COL.uf, COL.ufm2, COL.m2].forEach((c) => {
      const ref = XLSX.utils.encode_cell({ r: rIdx, c });
      if (ws[ref]) ws[ref].z = "#,##0.00;(#,##0.00);-";
    });
    const clpRef = XLSX.utils.encode_cell({ r: rIdx, c: COL.clp });
    if (ws[clpRef]) ws[clpRef].z = '"$"#,##0;("$"#,##0);-';
  });

  // Column widths
  ws["!cols"] = [
    { wch: 32 }, { wch: 18 }, { wch: 14 }, { wch: 8 }, { wch: 6 },
    { wch: 50 }, { wch: 22 }, { wch: 10 }, { wch: 10 }, { wch: 14 },
    { wch: 14 }, { wch: 16 }, { wch: 10 }, { wch: 10 },
  ];
  ws["!freeze"] = { xSplit: 0, ySplit: 2 } as any;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "CAPEX");

  const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  XLSX.writeFile(wb, `CAPEX_${yearLabel}_${ts}.xlsx`);
}
