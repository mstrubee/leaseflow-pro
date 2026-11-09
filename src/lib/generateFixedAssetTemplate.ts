import * as XLSX from 'xlsx';
import { validateExcelFile, withParseTimeout } from '@/lib/excelFileValidation';

export const generateFixedAssetTemplate = () => {
  const workbook = XLSX.utils.book_new();

  const headers = [
    "Nombre *", "SKU", "Categoría", "Unidad", "Cantidad *",
    "Valor Adquisición", "Fecha Adquisición (AAAA-MM-DD)", "Ubicación", "Notas",
  ];
  const example = [
    "Extintor 6kg", "EXT-006", "Seguridad", "unidad", 10,
    45000, "2026-01-15", "Bodega Central", "",
  ];

  const sheet = XLSX.utils.aoa_to_sheet([headers, example]);
  sheet['!cols'] = headers.map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(workbook, sheet, "Activos Fijos");

  const instructions = [
    ["Instrucciones para completar la plantilla de Activos Fijos"],
    [""],
    ["Columnas:"],
    ["1. Nombre *: Nombre del activo (OBLIGATORIO)"],
    ["2. SKU: Código o número de parte del activo"],
    ["3. Categoría: Categoría o rubro del activo"],
    ["4. Unidad: Unidad de medida (unidad, caja, set, etc.)"],
    ["5. Cantidad *: Cantidad total en stock (OBLIGATORIO, número entero)"],
    ["6. Valor Adquisición: Valor unitario o total de compra"],
    ["7. Fecha Adquisición: Formato AAAA-MM-DD"],
    ["8. Ubicación: Bodega o ubicación física"],
    ["9. Notas: Observaciones adicionales"],
    [""],
    ["Notas importantes:"],
    ["- Los campos marcados con * son obligatorios"],
    ["- También puedes subir un inventario existente con columnas similares"],
    ["  (por ejemplo: Descripción/Part #/Unidad/Qty Recibida) — el sistema"],
    ["  intenta reconocer automáticamente columnas equivalentes"],
    ["- Los activos duplicados (mismo nombre o SKU) serán ignorados"],
  ];
  const instructionsSheet = XLSX.utils.aoa_to_sheet(instructions);
  instructionsSheet['!cols'] = [{ wch: 80 }];
  XLSX.utils.book_append_sheet(workbook, instructionsSheet, "Instrucciones");

  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = 'plantilla_activos_fijos.xlsx';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export interface ParsedFixedAsset {
  name: string;
  sku: string;
  category: string;
  unit: string;
  total_quantity: number;
  acquisition_value: number | null;
  acquisition_date: string;
  location: string;
  notes: string;
}

const normalize = (value: unknown): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

const findColumn = (headers: string[], patterns: string[]): number => {
  for (const pattern of patterns) {
    const idx = headers.findIndex((h) => h.includes(pattern));
    if (idx !== -1) return idx;
  }
  return -1;
};

const NAME_PATTERNS = ["nombre", "descripcion", "producto", "item", "activo", "name"];
const SKU_PATTERNS = ["sku", "part", "codigo", "cod."];
const QUANTITY_PATTERNS = ["recibida", "disponible", "stock", "cantidad total", "cantidad", "qty", "total"];
const CATEGORY_PATTERNS = ["categoria", "rubro"];
const UNIT_PATTERNS = ["unidad", "unit"];
const VALUE_PATTERNS = ["valor", "precio"];
const DATE_PATTERNS = ["fecha"];
const LOCATION_PATTERNS = ["ubicacion", "bodega", "location"];
const NOTES_PATTERNS = ["notas", "observacion", "nota"];

const MAX_HEADER_SCAN_ROWS = 20;

const parseNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const parseDate = (value: unknown): string => {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const str = String(value).trim();
  // dd/mm/yyyy -> yyyy-mm-dd
  const dmy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  return "";
};

export const parseFixedAssetExcel = async (
  file: File
): Promise<{ assets: ParsedFixedAsset[]; errors: string[] }> => {
  const validation = validateExcelFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const parsePromise = new Promise<{ assets: ParsedFixedAsset[]; errors: string[] }>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });

        for (const sheetName of workbook.SheetNames) {
          const worksheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as unknown[][];

          for (let headerRow = 0; headerRow < Math.min(MAX_HEADER_SCAN_ROWS, rows.length); headerRow++) {
            const headers = (rows[headerRow] || []).map(normalize);
            const nameCol = findColumn(headers, NAME_PATTERNS);
            const qtyCol = findColumn(headers, QUANTITY_PATTERNS);
            if (nameCol === -1 || qtyCol === -1) continue;

            const skuCol = findColumn(headers, SKU_PATTERNS);
            const categoryCol = findColumn(headers, CATEGORY_PATTERNS);
            const unitCol = findColumn(headers, UNIT_PATTERNS);
            const valueCol = findColumn(headers, VALUE_PATTERNS);
            const dateCol = findColumn(headers, DATE_PATTERNS);
            const locationCol = findColumn(headers, LOCATION_PATTERNS);
            const notesCol = findColumn(headers, NOTES_PATTERNS);

            const assets: ParsedFixedAsset[] = [];
            const errors: string[] = [];

            for (let r = headerRow + 1; r < rows.length; r++) {
              const row = rows[r] || [];
              const name = String(row[nameCol] ?? "").trim();
              if (!name) continue;

              const quantity = parseNumber(row[qtyCol]);
              if (quantity === null || quantity < 0) {
                errors.push(`Fila ${r + 1}: cantidad inválida para "${name}", se omitió`);
                continue;
              }

              assets.push({
                name,
                sku: skuCol !== -1 ? String(row[skuCol] ?? "").trim() : "",
                category: categoryCol !== -1 ? String(row[categoryCol] ?? "").trim() : "",
                unit: unitCol !== -1 ? String(row[unitCol] ?? "").trim() || "unidad" : "unidad",
                total_quantity: Math.round(quantity),
                acquisition_value: valueCol !== -1 ? parseNumber(row[valueCol]) : null,
                acquisition_date: dateCol !== -1 ? parseDate(row[dateCol]) : "",
                location: locationCol !== -1 ? String(row[locationCol] ?? "").trim() : "",
                notes: notesCol !== -1 ? String(row[notesCol] ?? "").trim() : "",
              });
            }

            if (assets.length > 0 || errors.length > 0) {
              resolve({ assets, errors });
              return;
            }
          }
        }

        resolve({ assets: [], errors: ["No se encontró una tabla reconocible (se requiere una columna de nombre/descripción y una de cantidad)"] });
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error("Error reading file"));
    reader.readAsArrayBuffer(file);
  });

  return withParseTimeout(parsePromise, 30000);
};
