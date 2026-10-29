import { supabase } from "@/integrations/supabase/client";

export interface OCRequiredGroupLine {
  budgetLineId: string;
  lineName: string;
  amountUf: number;
  status: string;
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
