import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import type { TemplateLine } from "./BudgetTemplateLineTree";

// ─────────────────────────────────────────────────────────────────────────
// Column contract
//
// Import reads ONLY columns A–H, strictly by position:
//   A = Nivel        (profundidad jerárquica: 1 = raíz, 2 = hijo, ...)
//   B = Nombre
//   C = Descripción
//   D = Monto UF
//   E = Cantidad
//   F = Unidad
//   G = Moneda
//   H = Proveedor
// Any column from I onwards is treated as a mere calculation (totals,
// percentages, numbering) and is IGNORED on import.
// ─────────────────────────────────────────────────────────────────────────

const INPUT_HEADERS = [
  "Nivel",       // A
  "Nombre",      // B
  "Descripción", // C
  "Monto UF",    // D
  "Cantidad",    // E
  "Unidad",      // F
  "Moneda",      // G
  "Proveedor",   // H
] as const;

// Helper (calculated) columns — ignored on import.
const CALC_HEADERS = [
  "N°",              // I  numeración jerárquica
  "Total UF",        // J  rollup en UF (fórmula)
  "% del total",     // K
  "Valor unit. CLP", // L  ENTRADA manual (precio unitario en pesos)
  "Total CLP",       // M  = L × E (cantidad), fórmula
] as const;

// Column letters used in formulas.
const COL = {
  MONTO_UF: "D",
  CANTIDAD: "E",
  TOTAL_UF: "J",
  VALOR_CLP: "L",
  TOTAL_CLP: "M",
  UF_BASE: "N", // hidden helper: UF amount stored in the template
} as const;

// Absolute reference to the cell holding the UF rate (CLP per UF).
const UF_RATE_CELL = "$P$1";

// Allowed unit options for column F (dropdown on export; only values imported).
const UNIT_OPTIONS = ["un", "m2", "mL"] as const;

export interface ParsedTemplateLine {
  parent_index: number | null; // index into the returned array
  name: string;
  description: string | null;
  default_amount_uf: number;
  quantity: number | null;
  unit_type: string | null;
  currency: string | null;
  supplier_name: string | null;
}

interface FlatRow {
  line: TemplateLine;
  level: number;
  row: number;            // 1-based Excel row number
  code: string;           // hierarchical code, e.g. "1.2.1"
  hasChildren: boolean;
  childRows: number[];    // Excel row numbers of DIRECT children
}

/**
 * Walk the tree depth-first, assigning Excel row numbers and hierarchical
 * codes. Returns the flat list plus the row numbers of the root lines.
 */
function buildFlat(lines: TemplateLine[]): { rows: FlatRow[]; rootRows: number[] } {
  const rows: FlatRow[] = [];
  let counter = 0; // 0-based data index; Excel row = counter + 2 (row 1 = header)

  const walk = (nodes: TemplateLine[], level: number, prefix: string): number[] => {
    const sorted = [...nodes].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    const siblingRows: number[] = [];
    sorted.forEach((line, i) => {
      const code = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
      const rowNumber = counter + 2;
      counter++;
      const hasChildren = !!(line.children && line.children.length > 0);
      const entry: FlatRow = { line, level, row: rowNumber, code, hasChildren, childRows: [] };
      rows.push(entry);
      siblingRows.push(rowNumber);
      if (hasChildren) {
        entry.childRows = walk(line.children!, level + 1, code);
      }
    });
    return siblingRows;
  };

  const rootRows = walk(lines, 1, "");
  return { rows, rootRows };
}

/**
 * Compute the rolled-up UF total for each node, mirroring the app: a leaf total
 * is cantidad × precio-unitario (0 if either is missing); a parent total is the
 * sum of its children. Used to seed formula cached results so re-import works
 * even if the file was never opened in Excel.
 */
function computeUfTotals(rows: FlatRow[]): Map<number, number> {
  const totals = new Map<number, number>();
  const byDepth = [...rows].sort((a, b) => b.level - a.level);
  for (const r of byDepth) {
    if (r.hasChildren && r.childRows.length > 0) {
      totals.set(r.row, r.childRows.reduce((s, rn) => s + (totals.get(rn) || 0), 0));
    } else {
      const unit = Number(r.line.default_amount_uf) || 0;
      const qty = Number(r.line.quantity) || 0;
      totals.set(r.row, qty > 0 && unit > 0 ? qty * unit : 0);
    }
  }
  return totals;
}

/**
 * Export a template's line tree to a richly-formatted .xlsx and download it.
 *
 * Hierarchy: numbering (col I), indentation, bold parents, collapsible groups.
 * Amounts: enter the unit price in CLP in col L; col M = L × cantidad (E);
 * col D (Monto UF) and col J (Total UF) are computed — leaves convert CLP→UF
 * using the UF rate (or fall back to the stored UF amount when L is empty),
 * and parents roll up the sum of their children.
 */
export async function exportTemplateToExcel(
  templateName: string,
  budgetType: "capex" | "opex",
  lines: TemplateLine[],
  ufRate = 0,
) {
  const { rows, rootRows } = buildFlat(lines);
  const ufTotals = computeUfTotals(rows);
  const grandTotalUf = rootRows.reduce((s, rn) => s + (ufTotals.get(rn) || 0), 0);
  // Rate used in formulas; avoid division by zero (fallback keeps stored UF).
  const rate = ufRate && ufRate > 0 ? ufRate : 0;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(budgetType.toUpperCase().slice(0, 31), {
    properties: { outlineLevelRow: 0 },
    views: [{ state: "frozen", ySplit: 1 }],
  });
  (ws.properties as any).outlineProperties = { summaryBelow: false, summaryRight: false };

  const headers = [...INPUT_HEADERS, ...CALC_HEADERS];
  const headerRow = ws.getRow(1);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  // UF rate cell (referenced by formulas as $P$1).
  ws.getCell("O1").value = "Valor UF (CLP):";
  ws.getCell("O1").font = { bold: true };
  ws.getCell("O1").alignment = { horizontal: "right" };
  ws.getCell("P1").value = rate;
  ws.getCell("P1").numFmt = "#,##0.00";
  headerRow.height = 26;

  const totalRowNumber = rows.length + 2;

  for (const r of rows) {
    const excelRow = ws.getRow(r.row);
    const line = r.line;
    const unitUf = Number(line.default_amount_uf) || 0; // precio unitario UF
    const rollupUf = ufTotals.get(r.row) || 0;          // total UF (qty × unit, o suma)

    excelRow.getCell(1).value = r.level;                          // A Nivel
    const nameCell = excelRow.getCell(2);                         // B Nombre
    nameCell.value = line.name || "";
    nameCell.alignment = { indent: Math.max(0, r.level - 1) };
    if (r.hasChildren) nameCell.font = { bold: true };

    excelRow.getCell(3).value = line.description || "";           // C Descripción
    excelRow.getCell(5).value = line.quantity ?? null;            // E Cantidad
    // F Unidad — lista desplegable restringida (un, m2, mL)
    const unitCell = excelRow.getCell(6);
    unitCell.value = line.unit_type ?? null;
    unitCell.dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${UNIT_OPTIONS.join(",")}"`],
      showErrorMessage: true,
      errorStyle: "error",
      errorTitle: "Unidad inválida",
      error: `Selecciona una opción: ${UNIT_OPTIONS.join(", ")}`,
    };
    excelRow.getCell(7).value = line.currency ?? null;            // G Moneda
    excelRow.getCell(8).value = line.supplier_name ?? null;       // H Proveedor
    excelRow.getCell(9).value = r.code;                           // I N°
    excelRow.getCell(14).value = unitUf;                          // N UF base unit (hidden)

    // D Monto UF (unitario) — leaf = CLP unit ÷ valor UF, o UF base si L vacío.
    //   Parent = total roll-up (suma de los totales de las hijas) para que la
    //   madre muestre su monto y no quede en 0.
    const dCell = excelRow.getCell(4);
    if (r.hasChildren && r.childRows.length > 0) {
      const refs = r.childRows.map((rn) => `${COL.TOTAL_UF}${rn}`).join(",");
      dCell.value = { formula: `SUM(${refs})`, result: rollupUf } as any;
      dCell.font = { bold: true };
    } else {
      const rateExpr = rate > 0 ? `${COL.VALOR_CLP}${r.row}/${UF_RATE_CELL}` : `${COL.UF_BASE}${r.row}`;
      dCell.value = {
        formula: `IF(${COL.VALOR_CLP}${r.row}="",${COL.UF_BASE}${r.row},${rateExpr})`,
        result: unitUf,
      } as any;
    }
    dCell.numFmt = "#,##0.00";

    // J Total UF — leaf = precio unitario (D) × cantidad (E); parent = suma hijas.
    const jCell = excelRow.getCell(10);
    if (r.hasChildren && r.childRows.length > 0) {
      const refs = r.childRows.map((rn) => `${COL.TOTAL_UF}${rn}`).join(",");
      jCell.value = { formula: `SUM(${refs})`, result: rollupUf } as any;
      jCell.font = { bold: true };
    } else {
      jCell.value = {
        formula: `IF(${COL.CANTIDAD}${r.row}="",0,${COL.MONTO_UF}${r.row}*${COL.CANTIDAD}${r.row})`,
        result: rollupUf,
      } as any;
    }
    jCell.numFmt = "#,##0.00";

    // K % del total
    const kCell = excelRow.getCell(11);
    kCell.value = {
      formula: `IF($J$${totalRowNumber}=0,0,${COL.TOTAL_UF}${r.row}/$J$${totalRowNumber})`,
      result: grandTotalUf > 0 ? rollupUf / grandTotalUf : 0,
    } as any;
    kCell.numFmt = "0.0%";

    // L Valor unitario CLP — manual entry (blank on export).
    excelRow.getCell(12).numFmt = "#,##0";

    // M Total CLP — parent = SUM(children M); leaf = L × cantidad (E).
    const mCell = excelRow.getCell(13);
    if (r.hasChildren && r.childRows.length > 0) {
      const refs = r.childRows.map((rn) => `${COL.TOTAL_CLP}${rn}`).join(",");
      mCell.value = { formula: `SUM(${refs})` } as any;
      mCell.font = { bold: true };
    } else {
      mCell.value = {
        formula: `IF(OR(${COL.VALOR_CLP}${r.row}="",${COL.CANTIDAD}${r.row}=""),"",${COL.VALOR_CLP}${r.row}*${COL.CANTIDAD}${r.row})`,
      } as any;
    }
    mCell.numFmt = "#,##0";

    if (r.level > 1) excelRow.outlineLevel = r.level - 1;
  }

  // Grand total row (UF and CLP)
  const totalRow = ws.getRow(totalRowNumber);
  totalRow.getCell(2).value = "TOTAL";
  totalRow.getCell(2).font = { bold: true };
  const grandRefsUf = rootRows.map((rn) => `${COL.TOTAL_UF}${rn}`).join(",");
  const gUf = totalRow.getCell(10);
  gUf.value = grandRefsUf ? ({ formula: `SUM(${grandRefsUf})`, result: grandTotalUf } as any) : 0;
  gUf.numFmt = "#,##0.00";
  gUf.font = { bold: true };
  const grandRefsClp = rootRows.map((rn) => `${COL.TOTAL_CLP}${rn}`).join(",");
  const gClp = totalRow.getCell(13);
  gClp.value = grandRefsClp ? ({ formula: `SUM(${grandRefsClp})` } as any) : 0;
  gClp.numFmt = "#,##0";
  gClp.font = { bold: true };

  ws.columns = [
    { width: 6 },  // A Nivel
    { width: 42 }, // B Nombre
    { width: 34 }, // C Descripción
    { width: 13 }, // D Monto UF
    { width: 10 }, // E Cantidad
    { width: 10 }, // F Unidad
    { width: 9 },  // G Moneda
    { width: 24 }, // H Proveedor
    { width: 10 }, // I N°
    { width: 13 }, // J Total UF
    { width: 11 }, // K % del total
    { width: 15 }, // L Valor unit. CLP
    { width: 15 }, // M Total CLP
    { width: 12 }, // N UF base (hidden)
  ];
  ws.getColumn(14).hidden = true; // N UF base

  // Extend the unit dropdown to spare rows so new lines added by the user in
  // Excel also get the restricted list.
  for (let rn = totalRowNumber + 1; rn <= totalRowNumber + 50; rn++) {
    ws.getCell(`F${rn}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${UNIT_OPTIONS.join(",")}"`],
      showErrorMessage: true,
      errorStyle: "error",
      errorTitle: "Unidad inválida",
      error: `Selecciona una opción: ${UNIT_OPTIONS.join(", ")}`,
    };
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const safeName = templateName.replace(/[^\w\d-]+/g, "_").slice(0, 60);
  triggerDownload(blob, `Plantilla_${safeName || "presupuesto"}.xlsx`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.setAttribute("data-interception", "off");
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

/**
 * Generate an empty example Excel with the expected A–H columns.
 */
export function downloadExampleTemplateExcel() {
  const example: (string | number)[][] = [
    [...INPUT_HEADERS],
    [1, "Obras Civiles", "Trabajos de construcción", 0, "", "", "UF", ""],
    [2, "Fundaciones", "", 120, 1, "GL", "UF", ""],
    [2, "Estructura", "", 340, 1, "GL", "UF", ""],
    [1, "Instalaciones", "", 0, "", "", "UF", ""],
    [2, "Eléctrica", "", 90, 1, "GL", "UF", ""],
  ];
  const ws = XLSX.utils.aoa_to_sheet(example);
  ws["!cols"] = [
    { wch: 6 }, { wch: 40 }, { wch: 38 }, { wch: 13 },
    { wch: 10 }, { wch: 10 }, { wch: 9 }, { wch: 24 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ejemplo");
  XLSX.writeFile(wb, "Plantilla_ejemplo.xlsx");
}

/**
 * Parse an uploaded Excel into ordered lines with hierarchy resolved from the
 * "Nivel" column. Reads ONLY columns A–H (indices 0–7) by position; any extra
 * columns are ignored. Throws on invalid structure.
 */
export async function parseExcelToTemplateLines(file: File): Promise<ParsedTemplateLine[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const firstSheet = wb.SheetNames[0];
  if (!firstSheet) throw new Error("El archivo no contiene hojas.");
  const ws = wb.Sheets[firstSheet];

  const raw = XLSX.utils.sheet_to_json<any>(ws, { header: 1, blankrows: false });
  if (raw.length < 2) throw new Error("El archivo no contiene filas de datos.");

  // Fixed column positions (A–H).
  const COL_NIVEL = 0;
  const COL_NOMBRE = 1;
  const COL_DESC = 2;
  const COL_MONTO = 3;
  const COL_CANTIDAD = 4;
  const COL_UNIDAD = 5;
  const COL_MONEDA = 6;
  const COL_PROVEEDOR = 7;

  // Detect header row: the first row whose column B (index 1) reads "nombre".
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(raw.length, 5); i++) {
    const b = String(raw[i]?.[COL_NOMBRE] ?? "").trim().toLowerCase();
    if (b === "nombre") { headerRowIdx = i; break; }
  }
  if (headerRowIdx < 0) {
    throw new Error('No se encontró la fila de encabezados (columna B debe decir "Nombre").');
  }

  const dataRows = raw.slice(headerRowIdx + 1);
  const parsed: ParsedTemplateLine[] = [];
  const stackByLevel: (number | undefined)[] = [];

  const num = (v: any): number | null => {
    if (v === null || v === undefined || String(v).trim() === "") return null;
    const n = parseFloat(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };
  const str = (v: any): string | null => {
    const s = String(v ?? "").trim();
    return s === "" ? null : s;
  };

  for (const row of dataRows) {
    const name = String(row[COL_NOMBRE] ?? "").trim();
    if (!name || name.toUpperCase() === "TOTAL") continue; // skip totals / blanks

    let level = parseInt(String(row[COL_NIVEL] ?? "1"), 10);
    if (!Number.isFinite(level) || level < 1) level = 1;

    const monto = num(row[COL_MONTO]);

    const currentIndex = parsed.length;
    let parent_index: number | null = null;
    if (level > 1) {
      for (let l = level - 1; l >= 1; l--) {
        if (stackByLevel[l] !== undefined) { parent_index = stackByLevel[l]!; break; }
      }
    }

    parsed.push({
      parent_index,
      name,
      description: str(row[COL_DESC]),
      default_amount_uf: monto ?? 0,
      quantity: num(row[COL_CANTIDAD]),
      unit_type: str(row[COL_UNIDAD]),
      currency: str(row[COL_MONEDA]),
      supplier_name: str(row[COL_PROVEEDOR]),
    });

    stackByLevel[level] = currentIndex;
    for (let l = level + 1; l < stackByLevel.length; l++) stackByLevel[l] = undefined;
  }

  if (parsed.length === 0) throw new Error("No se encontraron líneas válidas en el archivo.");

  // Parent lines carry a rolled-up total in their Monto UF cell; the app derives
  // parent totals from children, so store 0 to match the template convention.
  const hasChildren = new Set<number>();
  parsed.forEach((p) => { if (p.parent_index !== null) hasChildren.add(p.parent_index); });
  parsed.forEach((p, i) => { if (hasChildren.has(i)) p.default_amount_uf = 0; });

  return parsed;
}
