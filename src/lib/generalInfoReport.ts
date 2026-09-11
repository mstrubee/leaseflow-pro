import * as XLSX from "xlsx";
import { format, addMonths, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

/**
 * "Información General Grupo Planet" -- reporte descargable/subible desde
 * /admin con la tipificación de todos los locales. Combina datos que ya
 * existen en la plataforma (empresa, dirección, coordenadas, superficies,
 * estados de contrato) con datos que no tenían dónde guardarse -- para esos
 * se usa el mismo mecanismo de "campos personalizados" que ya usa CEBE/
 * Código (contract_custom_fields/contract_custom_field_values), en vez de
 * agregar columnas nuevas a la base de datos.
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
  if (contract.status === "en_negociacion") return "En Proyecto";
  if (contract.obra_status === "construccion") return "En Construcción";
  if (contract.operation_status === "cerrado") return "En Cierre";
  return "Operativo";
}

export const HEADERS = [
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

  const rows = (contracts || []).map((c: any) => {
    const contract = c as ContractRow;
    const companies = (contract.contract_companies || []).map((cc) => cc.companies?.name).filter(Boolean).join(", ");
    const address = contract.contract_addresses?.[0];
    const endDate = calculateEndDate(contract);

    const terrenoUtilizadoRaw = getValue(contract.id, "terrenoUtilizado");
    const terrenoUtilizado = parseFloat(terrenoUtilizadoRaw.replace(",", "."));
    const superficieTerreno = contract.superficie_terreno || 0;
    const terrenoVacante =
      !isNaN(terrenoUtilizado) && superficieTerreno > 0 ? Math.max(0, superficieTerreno - terrenoUtilizado) : "";

    return [
      contract.id,
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
      terrenoUtilizadoRaw,
      terrenoVacante,
      getValue(contract.id, "capacidadOciosa"),
      getValue(contract.id, "atiendePublico") || "Sí",
      getValue(contract.id, "horarioFuncionamiento") || "9:15 a 19:30",
    ];
  });

  const wsData = [HEADERS as unknown as string[], ...rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws["!cols"] = HEADERS.map((h) => ({ wch: h === "Id" ? 38 : Math.max(14, Math.min(34, h.length + 4)) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Locales");
  XLSX.writeFile(wb, `informacion_general_locales_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
}

export interface GeneralInfoUploadResult {
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

export async function uploadGeneralInfoExcel(file: File): Promise<GeneralInfoUploadResult> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
  if (rows.length === 0) return { updated: 0, skipped: 0, errors: [] };

  const header = rows[0].map((h) => String(h).trim());
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

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const contractId = (row[idxId] || "").toString().trim();
    if (!contractId) {
      result.skipped++;
      continue;
    }

    // Coordenadas -- se actualizan directo en contract_addresses.
    if (idxLat !== -1 && idxLng !== -1) {
      const latRaw = (row[idxLat] || "").toString().trim();
      const lngRaw = (row[idxLng] || "").toString().trim();
      if (latRaw && lngRaw) {
        const lat = parseFloat(latRaw.replace(",", "."));
        const lng = parseFloat(lngRaw.replace(",", "."));
        if (!isNaN(lat) && !isNaN(lng)) {
          const { error } = await supabase
            .from("contract_addresses")
            .update({ lat, lng, geocode_source: "manual" })
            .eq("contract_id", contractId);
          if (error) {
            result.errors.push({ row: i + 1, message: `Coordenadas: ${error.message}` });
          }
        }
      }
    }

    for (const { key, label } of colFieldMap) {
      const idx = colIndex(label);
      if (idx === -1) continue;
      const value = (row[idx] || "").toString();
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
