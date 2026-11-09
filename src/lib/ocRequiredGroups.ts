import { supabase } from "@/integrations/supabase/client";

export interface OCRequiredGroupLine {
  budgetLineId: string;
  lineName: string;
  amountUf: number;
  status: string;
}

/** Solicitud de OC creada a partir de un requerimiento (oc_requests.source_quotation_number)
 *  con las líneas de presupuesto a las que quedó imputada (oc_budget_lines). */
export interface OCRequiredGroupSolicitud {
  requestId: string;
  requestNumber: string;
  lines: { budgetLineId: string; lineName: string; amountUf: number }[];
}

export interface OCRequiredGroup {
  quotationNumber: string;
  quotationDate: string;
  amountClp: number;
  amountUf: number;
  filePath: string | null;
  fileName: string | null;
  /** Referencia storage:// del archivo en Supabase Storage -- se limpia (queda
   *  null) a los 30 días o al convertirse en Solicitud de OC; el archivo sigue
   *  disponible siempre en Drive vía filePath. */
  storagePath: string | null;
  projectName: string;
  ufValue: number;
  supplierId: string | null;
  supplierName: string | null;
  lines: OCRequiredGroupLine[];
  converted: boolean;
  /** Solicitudes de OC originadas en este requerimiento. Solo se carga en las
   *  vistas de lista (ver loadSolicitudesByQuotation); es opcional. */
  solicitudes?: OCRequiredGroupSolicitud[];
}

/**
 * Carga el grupo "OC Requerida" (una fila por cada línea CAPEX asociada a la
 * misma cotización) al que pertenece una línea de presupuesto puntual --
 * misma construcción que OCRequiredList.loadData(), pero acotada a UN
 * quotation_number (el de la cotización más reciente de esa línea) para
 * poder editar un requerimiento directamente desde el árbol de presupuesto
 * sin tener que ir a la pestaña "Órdenes de Compra".
 * Devuelve null si la línea no tiene ninguna cotización "OC Requerida" asociada.
 */
export async function loadOCRequiredGroupForLine(
  contractId: string,
  budgetLineId: string,
  ufValue: number
): Promise<OCRequiredGroup | null> {
  const { data: ownRow, error: ownRowError } = await supabase
    .from("oc_quotations")
    .select("quotation_number")
    .eq("budget_line_id", budgetLineId)
    .eq("contract_id", contractId)
    .order("quotation_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ownRowError) throw ownRowError;
  if (!ownRow?.quotation_number) return null;

  const { data: rows, error: rowsError } = await supabase
    .from("oc_quotations")
    .select("*")
    .eq("quotation_number", ownRow.quotation_number);
  if (rowsError) throw rowsError;
  if (!rows || rows.length === 0) return null;

  const lineIds = [...new Set(rows.map((r: any) => r.budget_line_id))];
  const { data: lines, error: linesError } = await supabase
    .from("budget_lines")
    .select("id, status")
    .in("id", lineIds);
  if (linesError) throw linesError;
  const statusByLine = new Map((lines || []).map((l: any) => [l.id, l.status as string]));

  const { data: convertedReqs, error: convertedError } = await supabase
    .from("oc_requests")
    .select("id")
    .eq("source_quotation_number", ownRow.quotation_number)
    .limit(1);
  if (convertedError) throw convertedError;

  const first = rows[0] as any;
  return {
    quotationNumber: first.quotation_number,
    quotationDate: first.quotation_date,
    amountClp: first.amount_clp || 0,
    amountUf: first.amount_uf || 0,
    filePath: first.file_path,
    fileName: first.file_name,
    storagePath: first.storage_path ?? null,
    projectName: first.project_name,
    ufValue,
    supplierId: first.supplier_id ?? null,
    supplierName: first.supplier_name ?? null,
    lines: rows.map((r: any) => ({
      budgetLineId: r.budget_line_id,
      lineName: r.line_name,
      amountUf: Number(r.amount_uf) || 0,
      status: statusByLine.get(r.budget_line_id) || "no_autorizado",
    })),
    converted: !!(convertedReqs && convertedReqs.length > 0),
  };
}

/**
 * Solicitudes de OC originadas en cada requerimiento, con las líneas a las que
 * quedaron imputadas. Es lo que se muestra en el detalle de un requerimiento
 * "Convertida" (puede diferir de las líneas del requerimiento original).
 */
export async function loadSolicitudesByQuotation(
  quotationNumbers: string[]
): Promise<Map<string, OCRequiredGroupSolicitud[]>> {
  const result = new Map<string, OCRequiredGroupSolicitud[]>();
  if (quotationNumbers.length === 0) return result;

  const { data: requests, error: requestsError } = await supabase
    .from("oc_requests")
    .select("id, request_number, source_quotation_number")
    .in("source_quotation_number", quotationNumbers);
  if (requestsError) throw requestsError;
  if (!requests || requests.length === 0) return result;

  const requestIds = requests.map((r: any) => r.id as string);
  const { data: budgetLines, error: linesError } = await supabase
    .from("oc_budget_lines")
    .select("oc_request_id, budget_line_id, amount_uf, budget_lines(name)")
    .in("oc_request_id", requestIds);
  if (linesError) throw linesError;

  const linesByRequest = new Map<string, OCRequiredGroupSolicitud["lines"]>();
  for (const l of (budgetLines || []) as any[]) {
    const list = linesByRequest.get(l.oc_request_id) ?? [];
    list.push({
      budgetLineId: l.budget_line_id,
      lineName: l.budget_lines?.name ?? "Línea",
      amountUf: Number(l.amount_uf) || 0,
    });
    linesByRequest.set(l.oc_request_id, list);
  }

  for (const r of requests as any[]) {
    const list = result.get(r.source_quotation_number) ?? [];
    list.push({
      requestId: r.id,
      requestNumber: r.request_number,
      lines: linesByRequest.get(r.id) ?? [],
    });
    result.set(r.source_quotation_number, list);
  }
  return result;
}

/** CEBE del contrato (campo personalizado "cebe"), usado en el PDF de la Solicitud de OC. */
export async function loadContractCebe(contractId: string): Promise<string | null> {
  const { data: field } = await supabase
    .from("contract_custom_fields")
    .select("id")
    .ilike("field_name", "cebe")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!field) return null;
  const { data: value } = await supabase
    .from("contract_custom_field_values")
    .select("field_value")
    .eq("contract_id", contractId)
    .eq("field_id", field.id)
    .maybeSingle();
  return value?.field_value ?? null;
}
