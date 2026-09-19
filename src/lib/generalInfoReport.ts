import ExcelJS from "exceljs";
import { format, addMonths, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

/**
 * "Información General Grupo Planet" -- reporte descargable/subible desde
 * /admin con la tipificación de todos los locales VIGENTES (status =
 * 'firmado'). Combina datos que ya existen en la plataforma (empresa,
 * dirección, coordenadas, superficies, estados de contrato) con datos que
 * no tenían dónde guardarse -- para esos se usa el mismo mecanismo de
 * "campos personalizados" que ya usa CEBE/Código
 * (contract_custom_fields/contract_custom_field_values), en vez de agregar
 * columnas nuevas a la base de datos.
 *
 * El archivo se puede volver a subir: sobrescribe en la DB los campos que
 * vinieron de custom fields y las coordenadas (lat/lng). Los datos
 * "estructurales" (nombre, empresa, dirección, superficies) NO se
 * actualizan desde acá -- se siguen editando en la ficha del contrato.
 */

// Nombre de los custom fields que no existían antes de este reporte.
// CEBE y Código ya existían (ver minimalContractUpload.ts) y se reutilizan.
const CUSTOM_FIELD_NAMES = {
  cebe: "CEBE",
  codigo: "Código",
  tenencia: "Tenencia",
  restriccionesArriendo: "Restricciones Arriendo",
  estadoRed: "Estado Red",
  tipologia: "Tipología",
  restriccionUso: "Restricción de Uso",
  detalleRestriccion: "Detalle Restricción",
  terrenoUtilizado: "Terreno Utilizado",
  capacidadOciosa: "Capacidad Ociosa",
  atiendePublico: "Atiende Público",
  horarioFuncionamiento: "Horario Funcionamiento",
} as const;

type FieldKey = keyof typeof CUSTOM_FIELD_NAMES;
// Campos que se crean si no existen todavía (CEBE/Código se asumen ya creados).
const FIELDS_TO_ENSURE: FieldKey[] = [
  "tenencia",
  "restriccionesArriendo",
  "estadoRed",
  "tipologia",
  "restriccionUso",
  "detalleRestriccion",
  "terrenoUtilizado",
  "capacidadOciosa",
  "atiendePublico",
  "horarioFuncionamiento",
];

async function ensureCustomFieldDefs(): Promise<Record<FieldKey, string>> {
  const { data: existing } = await supabase
    .from("contract_custom_fields")
    .select("id, field_name")
    .eq("is_active", true);

  const byName = new Map((existing || []).map((f: any) => [f.field_name.trim().toLowerCase(), f.id as string]));
  const idByKey = {} as Record<FieldKey, string>;

  const toCreate: FieldKey[] = [];
  (Object.keys(CUSTOM_FIELD_NAMES) as FieldKey[]).forEach((key) => {
    const name = CUSTOM_FIELD_NAMES[key];
    const id = byName.get(name.trim().toLowerCase());
    if (id) idByKey[key] = id;
    else if (FIELDS_TO_ENSURE.includes(key)) toCreate.push(key);
  });

  if (toCreate.length > 0) {
    const { data: created, error } = await supabase
      .from("contract_custom_fields")
      .insert(toCreate.map((key) => ({ field_name: CUSTOM_FIELD_NAMES[key] })))
      .select("id, field_name");
    if (error) throw error;
    (created || []).forEach((f: any) => {
      const key = (Object.keys(CUSTOM_FIELD_NAMES) as FieldKey[]).find(
        (k) => CUSTOM_FIELD_NAMES[k].trim().toLowerCase() === f.field_name.trim().toLowerCase()
      );
      if (key) idByKey[key] = f.id;
    });
  }

  return idByKey;
}

// Ofuscación reversible del Id de contrato -- no es un secreto criptográfico
// real (corre en el navegador), solo evita que alguien lea o edite el UUID a
// simple vista al abrir el Excel. La columna además queda oculta.
const ID_OBFUSCATION_KEY = "GPlanet-Locales-2026";

function obfuscateId(id: string): string {
  let out = "";
  for (let i = 0; i < id.length; i++) {
    out += String.fromCharCode(id.charCodeAt(i) ^ ID_OBFUSCATION_KEY.charCodeAt(i % ID_OBFUSCATION_KEY.length));
  }
  return btoa(out);
}

function deobfuscateId(token: string): string | null {
  try {
    const raw = atob(token.trim());
    let out = "";
    for (let i = 0; i < raw.length; i++) {
      out += String.fromCharCode(raw.charCodeAt(i) ^ ID_OBFUSCATION_KEY.charCodeAt(i % ID_OBFUSCATION_KEY.length));
    }
    return out;
  } catch {
    return null;
  }
}

interface ContractRow {
  id: string;
  name: string;
  status: string;
  operation_status: string | null;
  obra_status: string | null;
  superficie_edificada_local: number | null;
  superficie_terreno: number | null;
  signed_date: string | null;
  contract_companies?: Array<{ companies: { name: string } | null }>;
  contract_addresses?: Array<{
    street: string | null;
    number: string | null;
    commune: string | null;
    region: string | null;
    lat: number | null;
    lng: number | null;
  }>;
  contract_versions?: Array<{ effective_date: string | null; duration_months: number; is_current: boolean }>;
}

function calculateEndDate(contract: ContractRow): Date | null {
  const v = contract.contract_versions?.find((x) => x.is_current);
  if (!v) return null;
  const start = v.effective_date
    ? parseISO(v.effective_date)
    : contract.signed_date
      ? parseISO(contract.signed_date)
      : null;
  if (!start) return null;
  return addMonths(start, v.duration_months);
}

function defaultTipologia(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("garage")) return "Oficina";
  if (n.includes("egakat")) return "Centro de Distribución";
  return "Tienda";
}

function defaultEstadoRed(contract: ContractRow): string {
  if (contract.obra_status === "construccion") return "En Construcción";
  if (contract.operation_status === "cerrado") return "En Cierre";
  return "Operativo";
}

// Columna A (Id) va oculta y cifrada -- el resto queda visible.
const HEADERS = [
  "Id",
  "CEBE",
  "Código",
  "Empresa",
  "Nombre del punto",
  "Dirección",
  "Comuna",
  "Región",
  "Latitud",
  "Longitud",
  "Tenencia",
  "Vencimiento (informativo, no editable)",
  "Restricciones de Arriendo",
  "Estado Red",
  "Tipología",
  "Restricción de Uso Conocida",
  "Detalle Restricción",
  "Superficie Edificada (m2)",
  "Superficie Terreno (m2)",
  "Terreno Utilizado (m2)",
  "Terreno Vacante (m2, informativo)",
  "Capacidad Ociosa",
  "Atiende Público",
  "Horario de Funcionamiento",
] as const;

const COL_WIDTHS: Record<number, number> = {
  2: 12, // CEBE
  3: 12, // Código
  4: 22, // Empresa
  5: 30, // Nombre del punto
  6: 30, // Dirección
  7: 16, // Comuna
  8: 16, // Región
  9: 13, // Latitud
  10: 13, // Longitud
  11: 14, // Tenencia
  12: 16, // Vencimiento
  13: 26, // Restricciones de Arriendo
  14: 16, // Estado Red
  15: 16, // Tipología
  16: 18, // Restricción de Uso
  17: 26, // Detalle Restricción
  18: 16, // Superficie Edificada
  19: 16, // Superficie Terreno
  20: 16, // Terreno Utilizado
  21: 18, // Terreno Vacante
  22: 18, // Capacidad Ociosa
  23: 14, // Atiende Público
  24: 20, // Horario de Funcionamiento
};

const COL = {
  superficieTerreno: "S",
  terrenoUtilizado: "T",
  terrenoVacante: "U",
} as const;

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

export async function downloadGeneralInfoExcel(): Promise<void> {
  const fieldIds = await ensureCustomFieldDefs();

  const { data: contracts, error } = await supabase
    .from("contracts")
    .select(
      `id, name, status, operation_status, obra_status, superficie_edificada_local, superficie_terreno, signed_date,
       contract_companies(companies(name)),
       contract_addresses(street, number, commune, region, lat, lng),
       contract_versions(effective_date, duration_months, is_current)`
    )
    .is("deleted_at", null)
    .eq("status", "firmado") // Solo contratos Vigentes
    .order("name");
  if (error) throw error;

  const contractIds = (contracts || []).map((c: any) => c.id);
  const fieldIdList = Object.values(fieldIds);
  const { data: values } = await supabase
    .from("contract_custom_field_values")
    .select("contract_id, field_id, field_value")
    .in("contract_id", contractIds)
    .in("field_id", fieldIdList);

  const valueByContractAndField = new Map<string, string>();
  (values || []).forEach((v: any) => {
    valueByContractAndField.set(`${v.contract_id}:${v.field_id}`, v.field_value ?? "");
  });
  const getValue = (contractId: string, key: FieldKey): string => {
    const fieldId = fieldIds[key];
    if (!fieldId) return "";
    return valueByContractAndField.get(`${contractId}:${fieldId}`) ?? "";
  };

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Locales", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const headerRow = ws.getRow(1);
  HEADERS.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FFCBD5E1" } },
      bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
      left: { style: "thin", color: { argb: "FFCBD5E1" } },
      right: { style: "thin", color: { argb: "FFCBD5E1" } },
    };
  });
  headerRow.height = 32;

  ws.columns = HEADERS.map((_, i) => ({ width: COL_WIDTHS[i + 1] || 16 }));
  ws.getColumn(1).hidden = true; // Id -- oculta y cifrada

  const dataRows = (contracts || []).map((c: any) => {
    const contract = c as ContractRow;
    const companies = (contract.contract_companies || []).map((cc) => cc.companies?.name).filter(Boolean).join(", ");
    const address = contract.contract_addresses?.[0];
    const endDate = calculateEndDate(contract);

    return {
      contract,
      values: [
        obfuscateId(contract.id),
        getValue(contract.id, "cebe"),
        getValue(contract.id, "codigo"),
        companies,
        contract.name,
        address ? `${address.street || ""} ${address.number || ""}`.trim() : "",
        address?.commune || "",
        address?.region || "",
        address?.lat ?? "",
        address?.lng ?? "",
        getValue(contract.id, "tenencia") || "Arrendado",
        endDate ? format(endDate, "dd/MM/yyyy") : "",
        getValue(contract.id, "restriccionesArriendo"),
        getValue(contract.id, "estadoRed") || defaultEstadoRed(contract),
        getValue(contract.id, "tipologia") || defaultTipologia(contract.name),
        getValue(contract.id, "restriccionUso") || "Sin información",
        getValue(contract.id, "detalleRestriccion"),
        contract.superficie_edificada_local || "",
        contract.superficie_terreno || "",
        getValue(contract.id, "terrenoUtilizado"),
        null, // Terreno Vacante -- fórmula, se llena abajo
        getValue(contract.id, "capacidadOciosa"),
        getValue(contract.id, "atiendePublico") || "Sí",
        getValue(contract.id, "horarioFuncionamiento") || "9:15 a 19:30",
      ],
    };
  });

  dataRows.forEach(({ values }, idx) => {
    const rowNumber = idx + 2;
    const row = ws.getRow(rowNumber);
    values.forEach((v, colIdx) => {
      row.getCell(colIdx + 1).value = v as any;
    });

    // Terreno Vacante = Superficie Terreno - Terreno Utilizado (en blanco si
    // no hay Terreno Utilizado cargado). Fórmula real: se recalcula sola en
    // Excel si se edita cualquiera de las dos columnas.
    const vacanteCell = row.getCell(21);
    vacanteCell.value = {
      formula: `IF(${COL.terrenoUtilizado}${rowNumber}="","",MAX(0,${COL.superficieTerreno}${rowNumber}-${COL.terrenoUtilizado}${rowNumber}))`,
    } as any;

    row.getCell(9).numFmt = "0.0000000";
    row.getCell(10).numFmt = "0.0000000";
    row.getCell(18).numFmt = "#,##0";
    row.getCell(19).numFmt = "#,##0";
    row.getCell(20).numFmt = "#,##0";
    row.getCell(21).numFmt = "#,##0";

    if (idx % 2 === 1) {
      for (let c = 2; c <= HEADERS.length; c++) {
        row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
      }
    }
  });

  ws.autoFilter = {
    from: { row: 1, column: 2 },
    to: { row: 1, column: HEADERS.length },
  };

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  triggerDownload(blob, `informacion_general_locales_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
}

export interface GeneralInfoUploadResult {
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

export async function uploadGeneralInfoExcel(file: File): Promise<GeneralInfoUploadResult> {
  const buffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return { updated: 0, skipped: 0, errors: [] };

  const headerRow = ws.getRow(1);
  const header: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    header[colNumber] = String(cell.value ?? "").trim();
  });
  const colIndex = (label: string) => header.indexOf(label);
  const idxId = colIndex("Id");
  if (idxId === -1) {
    throw new Error('No se encontró la columna "Id" -- usa el archivo generado por "Descargar Excel", no lo reordenes.');
  }

  const fieldIds = await ensureCustomFieldDefs();

  const colFieldMap: Array<{ key: FieldKey; label: string }> = [
    { key: "tenencia", label: "Tenencia" },
    { key: "restriccionesArriendo", label: "Restricciones de Arriendo" },
    { key: "estadoRed", label: "Estado Red" },
    { key: "tipologia", label: "Tipología" },
    { key: "restriccionUso", label: "Restricción de Uso Conocida" },
    { key: "detalleRestriccion", label: "Detalle Restricción" },
    { key: "terrenoUtilizado", label: "Terreno Utilizado (m2)" },
    { key: "capacidadOciosa", label: "Capacidad Ociosa" },
    { key: "atiendePublico", label: "Atiende Público" },
    { key: "horarioFuncionamiento", label: "Horario de Funcionamiento" },
  ];

  const idxLat = colIndex("Latitud");
  const idxLng = colIndex("Longitud");

  const result: GeneralInfoUploadResult = { updated: 0, skipped: 0, errors: [] };
  const fieldValueUpserts: { contract_id: string; field_id: string; field_value: string }[] = [];

  const cellText = (row: ExcelJS.Row, idx: number): string => {
    if (idx === -1) return "";
    const v = row.getCell(idx).value;
    if (v === null || v === undefined) return "";
    if (typeof v === "object" && "result" in (v as any)) return String((v as any).result ?? "");
    return String(v).trim();
  };

  for (let rowNumber = 2; rowNumber <= ws.rowCount; rowNumber++) {
    const row = ws.getRow(rowNumber);
    const idToken = cellText(row, idxId);
    const contractId = idToken ? deobfuscateId(idToken) : null;
    if (!contractId) {
      result.skipped++;
      continue;
    }

    if (idxLat !== -1 && idxLng !== -1) {
      const latRaw = cellText(row, idxLat).replace(",", ".");
      const lngRaw = cellText(row, idxLng).replace(",", ".");
      if (latRaw && lngRaw) {
        const lat = parseFloat(latRaw);
        const lng = parseFloat(lngRaw);
        if (!isNaN(lat) && !isNaN(lng)) {
          const { error } = await supabase
            .from("contract_addresses")
            .update({ lat, lng, geocode_source: "manual" })
            .eq("contract_id", contractId);
          if (error) {
            result.errors.push({ row: rowNumber, message: `Coordenadas: ${error.message}` });
          }
        }
      }
    }

    for (const { key, label } of colFieldMap) {
      const idx = colIndex(label);
      if (idx === -1) continue;
      const value = cellText(row, idx);
      const fieldId = fieldIds[key];
      if (!fieldId) continue;
      fieldValueUpserts.push({ contract_id: contractId, field_id: fieldId, field_value: value });
    }

    result.updated++;
  }

  if (fieldValueUpserts.length > 0) {
    const { error } = await supabase
      .from("contract_custom_field_values")
      .upsert(fieldValueUpserts, { onConflict: "contract_id,field_id" });
    if (error) throw error;
  }

  return result;
}
