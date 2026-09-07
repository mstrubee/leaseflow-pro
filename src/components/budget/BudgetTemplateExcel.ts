import * as XLSX from "xlsx";
import type { TemplateLine } from "./BudgetTemplateLineTree";

// Column headers for the template Excel — human-friendly, in Spanish (UI language).
// "Nivel" encodes the hierarchy depth (1 = raíz, 2 = hijo, 3 = nieto, ...).
const HEADERS = [
  "Nivel",
  "Nombre",
  "Descripción",
  "Monto UF",
  "Cantidad",
  "Unidad",
  "Moneda",
  "Proveedor",
] as const;

export interface ParsedTemplateLine {
  parent_index: number | null; // index into the returned array, resolved by depth
  name: string;
  description: string | null;
  default_amount_uf: number;
  quantity: number | null;
  unit_type: string | null;
  currency: string | null;
  supplier_name: string | null;
}

/**
 * Flatten a tree into rows ordered depth-first, carrying the depth level.
 */
function flattenTree(lines: TemplateLine[], level = 1): { line: TemplateLine; level: number }[] {
  const out: { line: TemplateLine; level: number }[] = [];
  const sorted = [...lines].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  for (const line of sorted) {
    out.push({ line, level });
    if (line.children && line.children.length > 0) {
      out.push(...flattenTree(line.children, level + 1));
    }
  }
  return out;
}

/**
 * Export a template's line tree to an .xlsx file and trigger the download.
 */
export function exportTemplateToExcel(
  templateName: string,
  budgetType: "capex" | "opex",
  lines: TemplateLine[],
) {
  const flat = flattenTree(lines);

  const rows = flat.map(({ line, level }) => [
    level,
    line.name || "",
    line.description || "",
    Number(line.default_amount_uf) || 0,
    line.quantity ?? "",
    line.unit_type ?? "",
    line.currency ?? "",
    line.supplier_name ?? "",
  ]);

  const wsData = [[...HEADERS], ...rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  ws["!cols"] = [
    { wch: 6 },  // Nivel
    { wch: 40 }, // Nombre
    { wch: 40 }, // Descripción
    { wch: 12 }, // Monto UF
    { wch: 10 }, // Cantidad
    { wch: 10 }, // Unidad
    { wch: 10 }, // Moneda
    { wch: 25 }, // Proveedor
  ];

  const wb = XLSX.utils.book_new();
  const sheetName = budgetType.toUpperCase().slice(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const safeName = templateName.replace(/[^\w\d-]+/g, "_").slice(0, 60);
  XLSX.writeFile(wb, `Plantilla_${safeName || "presupuesto"}.xlsx`);
}

/**
 * Generate an empty example Excel file so users have a starting point.
 */
export function downloadExampleTemplateExcel() {
  const example: (string | number)[][] = [
    [...HEADERS],
    [1, "Obras Civiles", "Trabajos de construcción", 0, "", "", "UF", ""],
    [2, "Fundaciones", "", 120, 1, "GL", "UF", ""],
    [2, "Estructura", "", 340, 1, "GL", "UF", ""],
    [1, "Instalaciones", "", 0, "", "", "UF", ""],
    [2, "Eléctrica", "", 90, 1, "GL", "UF", ""],
  ];
  const ws = XLSX.utils.aoa_to_sheet(example);
  ws["!cols"] = [
    { wch: 6 }, { wch: 40 }, { wch: 40 }, { wch: 12 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 25 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ejemplo");
  XLSX.writeFile(wb, "Plantilla_ejemplo.xlsx");
}

/**
 * Parse an uploaded Excel file into an ordered list of lines with hierarchy
 * resolved via the "Nivel" column. Throws on invalid structure.
 */
export async function parseExcelToTemplateLines(file: File): Promise<ParsedTemplateLine[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const firstSheet = wb.SheetNames[0];
  if (!firstSheet) throw new Error("El archivo no contiene hojas.");
  const ws = wb.Sheets[firstSheet];

  const raw = XLSX.utils.sheet_to_json<any>(ws, { header: 1, blankrows: false });
  if (raw.length < 2) throw new Error("El archivo no contiene filas de datos.");

  // Detect header row: find the row that contains "Nombre"
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(raw.length, 5); i++) {
    const row = raw[i].map((c: any) => String(c || "").trim().toLowerCase());
    if (row.includes("nombre")) {
      headerRowIdx = i;
      break;
    }
  }

  const header = raw[headerRowIdx].map((c: any) => String(c || "").trim().toLowerCase());
  const col = (name: string) => header.indexOf(name.toLowerCase());
  const idxNivel = col("nivel");
  const idxNombre = col("nombre");
  const idxDesc = col("descripción") >= 0 ? col("descripción") : col("descripcion");
  const idxMonto = col("monto uf") >= 0 ? col("monto uf") : col("monto");
  const idxCantidad = col("cantidad");
  const idxUnidad = col("unidad");
  const idxMoneda = col("moneda");
  const idxProveedor = col("proveedor");

  if (idxNombre < 0) {
    throw new Error('El archivo debe tener una columna "Nombre".');
  }

  const dataRows = raw.slice(headerRowIdx + 1);
  const parsed: ParsedTemplateLine[] = [];
  // Stack maps depth level -> index in `parsed` of the last line at that level
  const stackByLevel: number[] = [];

  for (const row of dataRows) {
    const name = String(row[idxNombre] ?? "").trim();
    if (!name) continue; // skip blank / total rows without a name

    let level = idxNivel >= 0 ? parseInt(String(row[idxNivel] ?? "1"), 10) : 1;
    if (!Number.isFinite(level) || level < 1) level = 1;

    const montoRaw = idxMonto >= 0 ? row[idxMonto] : 0;
    const monto = parseFloat(String(montoRaw ?? "0").toString().replace(",", "."));
    const cantidadRaw = idxCantidad >= 0 ? row[idxCantidad] : "";
    const cantidad = String(cantidadRaw ?? "").trim() === ""
      ? null
      : parseFloat(String(cantidadRaw).replace(",", "."));

    const currentIndex = parsed.length;
    // Parent is the most recent line at level - 1
    let parent_index: number | null = null;
    if (level > 1) {
      for (let l = level - 1; l >= 1; l--) {
        if (stackByLevel[l] !== undefined) {
          parent_index = stackByLevel[l];
          break;
        }
      }
    }

    parsed.push({
      parent_index,
      name,
      description: idxDesc >= 0 && String(row[idxDesc] ?? "").trim() !== "" ? String(row[idxDesc]).trim() : null,
      default_amount_uf: Number.isFinite(monto) ? monto : 0,
      quantity: cantidad !== null && Number.isFinite(cantidad) ? cantidad : null,
      unit_type: idxUnidad >= 0 && String(row[idxUnidad] ?? "").trim() !== "" ? String(row[idxUnidad]).trim() : null,
      currency: idxMoneda >= 0 && String(row[idxMoneda] ?? "").trim() !== "" ? String(row[idxMoneda]).trim() : null,
      supplier_name: idxProveedor >= 0 && String(row[idxProveedor] ?? "").trim() !== "" ? String(row[idxProveedor]).trim() : null,
    });

    stackByLevel[level] = currentIndex;
    // Clear deeper levels so stale children don't attach
    for (let l = level + 1; l < stackByLevel.length; l++) {
      stackByLevel[l] = undefined as any;
    }
  }

  if (parsed.length === 0) {
    throw new Error("No se encontraron líneas válidas en el archivo.");
  }

  return parsed;
}
