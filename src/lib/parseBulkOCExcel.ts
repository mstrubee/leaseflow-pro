import * as XLSX from "xlsx";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OCLocation {
  contract_id: string;
  contract_name: string;
  centro_sap: string | null;
}

export interface OCSupplier {
  id: string;
  name: string;
}

export interface RawOCRow {
  centro: string;
  orderNumber: string;
  fechaRaw: unknown;
  description: string;
  amountRaw: unknown;
  proveedorRaw: string;
  rowIndex: number;
}

export type OCRowStatus = "ok" | "pending_supplier" | "pending_local" | "pending_both";

export interface ParsedOCRow extends RawOCRow {
  orderDate: string;
  amountClp: number;
  contractId: string | null;
  contractName: string | null;
  supplierId: string | null;
  supplierName: string;
  status: OCRowStatus;
}

export interface OCAllocation {
  contractId: string | null;
  contractName: string | null;
  amountClp: number;
  rawCentro: string;
  pendingLocal: boolean;
}

export type DuplicateResolution = "keep_existing" | "replace" | null;

export interface GroupedOC {
  orderNumber: string;
  orderDate: string;
  description: string;
  totalAmountClp: number;
  allocations: OCAllocation[];
  supplierId: string | null;
  supplierName: string;
  rawProveedor: string;
  isMultiContract: boolean;
  status: OCRowStatus;
  isDuplicate: boolean;
  existingId: string | null;
  duplicateResolution: DuplicateResolution;
  /** Monto de la OC ya existente, para comparar contra totalAmountClp. */
  existingAmountClp: number | null;
}

export interface ParseSheetResult {
  rows: RawOCRow[];
  missingColumns: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** "H0428P1290" → "0428"  |  handles no prefix/suffix variants */
export function extractCenterCode(cebe: string | null | undefined): string {
  if (!cebe) return "";
  return cebe.replace(/^H/i, "").replace(/P\d+$/i, "").trim();
}

function norm(s: string): string {
  return (s ?? "").toLowerCase().trim();
}

export function normalizeAmount(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Math.round(value);
  const str = String(value).trim().replace(/\./g, "").replace(/,/g, ".");
  const n = parseFloat(str);
  return isNaN(n) ? 0 : Math.round(n);
}

export function parseExcelDate(value: unknown): string {
  const fallback = new Date().toISOString().split("T")[0];
  if (!value && value !== 0) return fallback;

  if (typeof value === "number") {
    // Excel serial date number
    const d = XLSX.SSF.parse_date_code(value);
    if (d) {
      const m = String(d.m).padStart(2, "0");
      const day = String(d.d).padStart(2, "0");
      return `${d.y}-${m}-${day}`;
    }
  }

  if (value instanceof Date) {
    return value.toISOString().split("T")[0];
  }

  if (typeof value === "string") {
    const s = value.trim();
    // dd/MM/yyyy or dd-MM-yyyy
    const m1 = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (m1) {
      const [, d, mo, y] = m1;
      // If day > 12, it must be day-first
      if (parseInt(d) > 12 || parseInt(d) > parseInt(mo)) {
        return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
      }
      return `${y}-${d.padStart(2, "0")}-${mo.padStart(2, "0")}`;
    }
    // yyyy-MM-dd already
    const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m2) return s;
  }

  return fallback;
}

// ── Column matching ───────────────────────────────────────────────────────────

const COL_ALIASES: Record<string, string[]> = {
  centro:      ["centro"],
  orderNumber: ["documento compras", "documento de compras", "doc. compras", "n° oc", "noc", "oc", "n oc"],
  fecha:       ["fecha documento", "fecha doc.", "fecha doc", "fecha"],
  descripcion: ["texto breve", "descripción", "descripcion", "texto"],
  monto:       ["precio neto", "precio neto (mn)", "monto neto", "monto", "precio", "valor neto"],
  proveedor:   ["proveedor/centro suministrador", "proveedor / centro suministrador", "proveedor", "centro suministrador"],
};

function findCol(headers: string[], key: string): number {
  const aliases = COL_ALIASES[key] ?? [key];
  for (const alias of aliases) {
    const i = headers.findIndex(h => norm(h) === alias);
    if (i >= 0) return i;
  }
  for (const alias of aliases) {
    const i = headers.findIndex(h => norm(h).includes(alias));
    if (i >= 0) return i;
  }
  return -1;
}

// ── Parse sheet ───────────────────────────────────────────────────────────────

export function parseOCExcelSheet(workbook: XLSX.WorkBook): ParseSheetResult {
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];

  if (raw.length < 2) return { rows: [], missingColumns: [] };

  const headerRow = (raw[0] as unknown[]).map(h => String(h ?? "").trim());

  const colCentro = findCol(headerRow, "centro");
  const colOrder  = findCol(headerRow, "orderNumber");
  const colFecha  = findCol(headerRow, "fecha");
  const colDesc   = findCol(headerRow, "descripcion");
  const colMonto  = findCol(headerRow, "monto");
  const colProv   = findCol(headerRow, "proveedor");

  const missing: string[] = [];
  if (colCentro < 0) missing.push("Centro");
  if (colOrder  < 0) missing.push("Documento compras");
  if (colFecha  < 0) missing.push("Fecha Documento");
  if (colDesc   < 0) missing.push("Texto Breve");
  if (colMonto  < 0) missing.push("Precio Neto");
  if (colProv   < 0) missing.push("Proveedor/Centro suministrador");

  const rows: RawOCRow[] = [];
  for (let i = 1; i < raw.length; i++) {
    const r = raw[i] as unknown[];
    const centro      = String(r[colCentro] ?? "").trim();
    const orderNumber = String(r[colOrder]  ?? "").trim();
    if (!centro && !orderNumber) continue;

    rows.push({
      centro,
      orderNumber,
      fechaRaw:    r[colFecha],
      description: String(r[colDesc] ?? "").trim(),
      amountRaw:   r[colMonto],
      proveedorRaw: String(r[colProv] ?? "").trim().replace(/^\d+\s*/, ""),
      rowIndex: i + 1,
    });
  }

  return { rows, missingColumns: missing };
}

// ── Resolve ───────────────────────────────────────────────────────────────────

function stripLeadingZeros(s: string): string {
  return s.replace(/^0+/, "") || "0";
}

export function resolveRows(
  rawRows: RawOCRow[],
  locations: OCLocation[],
  suppliers: OCSupplier[],
): ParsedOCRow[] {
  // Build CEBE → location map (index by extracted code, with/without leading zeros)
  const cebeMap = new Map<string, OCLocation>();
  for (const loc of locations) {
    const code = extractCenterCode(loc.centro_sap);
    if (!code) continue;
    cebeMap.set(code, loc);
    cebeMap.set(stripLeadingZeros(code), loc);
  }

  // Build supplier name → supplier map
  const supplierMap = new Map<string, OCSupplier>();
  for (const s of suppliers) {
    supplierMap.set(norm(s.name), s);
  }

  return rawRows.map(row => {
    const centroExact = row.centro.trim();
    const centroStripped = stripLeadingZeros(centroExact);

    const loc =
      cebeMap.get(centroExact) ??
      cebeMap.get(centroStripped) ??
      [...cebeMap.entries()].find(([k]) =>
        stripLeadingZeros(k) === centroStripped
      )?.[1] ??
      null;

    const provNorm = norm(row.proveedorRaw);
    const supplier =
      supplierMap.get(provNorm) ??
      [...supplierMap.entries()].find(([k]) =>
        k.includes(provNorm) || (provNorm.length > 4 && provNorm.includes(k))
      )?.[1] ??
      null;

    const pendingLocal     = !loc;
    const pendingSupplier  = !supplier;

    let status: OCRowStatus = "ok";
    if (pendingLocal && pendingSupplier) status = "pending_both";
    else if (pendingLocal)              status = "pending_local";
    else if (pendingSupplier)           status = "pending_supplier";

    return {
      ...row,
      orderDate:    parseExcelDate(row.fechaRaw),
      amountClp:    normalizeAmount(row.amountRaw),
      contractId:   loc?.contract_id   ?? null,
      contractName: loc?.contract_name ?? null,
      supplierId:   supplier?.id       ?? null,
      supplierName: supplier?.name     ?? row.proveedorRaw,
      status,
    };
  });
}

// ── Group by order number ─────────────────────────────────────────────────────

function mergeStatus(a: OCRowStatus, b: OCRowStatus): OCRowStatus {
  const rank: Record<OCRowStatus, number> = {
    ok: 0, pending_supplier: 1, pending_local: 1, pending_both: 2,
  };
  if (rank[a] > rank[b]) return a;
  if (rank[b] > rank[a]) return b;
  if ((a === "pending_supplier" && b === "pending_local") ||
      (a === "pending_local" && b === "pending_supplier")) return "pending_both";
  return a;
}

export function groupByOrderNumber(parsedRows: ParsedOCRow[]): GroupedOC[] {
  const map = new Map<string, GroupedOC>();

  for (const row of parsedRows) {
    const existing = map.get(row.orderNumber);
    if (existing) {
      existing.allocations.push({
        contractId:   row.contractId,
        contractName: row.contractName,
        amountClp:    row.amountClp,
        rawCentro:    row.centro,
        pendingLocal: !row.contractId,
      });
      existing.totalAmountClp += row.amountClp;
      existing.isMultiContract = true;
      existing.status = mergeStatus(existing.status, row.status);
    } else {
      map.set(row.orderNumber, {
        orderNumber:    row.orderNumber,
        orderDate:      row.orderDate,
        description:    row.description,
        totalAmountClp: row.amountClp,
        allocations: [{
          contractId:   row.contractId,
          contractName: row.contractName,
          amountClp:    row.amountClp,
          rawCentro:    row.centro,
          pendingLocal: !row.contractId,
        }],
        supplierId:          row.supplierId,
        supplierName:        row.supplierName,
        rawProveedor:        row.proveedorRaw,
        isMultiContract:     false,
        status:              row.status,
        isDuplicate:         false,
        existingId:          null,
        duplicateResolution: null,
        existingAmountClp:   null,
      });
    }
  }

  return [...map.values()];
}
