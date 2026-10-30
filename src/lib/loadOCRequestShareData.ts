import { supabase } from "@/integrations/supabase/client";
import { buildShareLines, OCRequestShareData } from "@/lib/ocRequestShare";

interface StoredOCRequest {
  request_date: string;
  line_name: string | null;
  project_name: string | null;
  description: string | null;
  amount_uf: number | null;
  amount_clp: number | null;
  uf_value_at_entry: number | null;
  supplier_id: string | null;
  supplier_name: string | null;
  sequence_number: number | null;
  migo_choice: "con" | "sin" | null;
  verification_code: string | null;
}

/**
 * Reconstruye los datos del PDF "Solicitud de OC" de una solicitud YA guardada,
 * leyendo todo desde la base. Sirve para volver a descargar el PDF de una
 * solicitud existente y para regenerarlo tras editarla: así el documento
 * siempre refleja lo que hay guardado, no lo que había en pantalla.
 *
 * `ufValue` solo se usa de respaldo si la solicitud no guardó la UF con que
 * se creó (uf_value_at_entry).
 */
export async function loadOCRequestShareData(
  requestId: string,
  opts: { ufValue: number; contractCebe?: string | null }
): Promise<OCRequestShareData> {
  const { data: reqRow, error: reqError } = await supabase
    .from("oc_requests")
    .select("*")
    .eq("id", requestId)
    .single();
  if (reqError) throw reqError;
  const request = reqRow as unknown as StoredOCRequest;

  const [linesRes, allocationsRes, plansRes, supplierRes] = await Promise.all([
    supabase.from("oc_budget_lines").select("budget_line_id, amount_uf").eq("oc_request_id", requestId),
    supabase.from("oc_request_contract_allocations").select("contracts(name)").eq("oc_request_id", requestId),
    supabase
      .from("oc_payment_plans")
      .select("description, amount_uf, amount_clp, due_date")
      .eq("oc_request_id", requestId)
      .order("payment_number"),
    request.supplier_id
      ? supabase.from("suppliers").select("rut").eq("id", request.supplier_id).single()
      : Promise.resolve({ data: null }),
  ]);

  const effectiveUf = request.uf_value_at_entry || opts.ufValue;
  const totalAmountClp = request.amount_clp || Math.round((request.amount_uf ?? 0) * effectiveUf);

  // oc_budget_lines solo tiene filas de líneas CAPEX; una solicitud OPEX no
  // tiene ninguna (la tabla referencia budget_lines). Sin filas, la única
  // línea es la guardada en la propia solicitud.
  const lineRows = linesRes.data || [];
  const lineNames = new Map<string, string>();
  if (lineRows.length > 0) {
    const { data: namesData } = await supabase
      .from("budget_lines")
      .select("id, name")
      .in("id", lineRows.map((l) => l.budget_line_id));
    (namesData || []).forEach((l) => lineNames.set(l.id, l.name));
  }
  const lines = buildShareLines(
    lineRows.length > 0
      ? lineRows.map((l) => ({ lineName: lineNames.get(l.budget_line_id) || "Línea", amount: l.amount_uf }))
      : [{ lineName: request.line_name || "Línea", amount: 0 }],
    { totalAmountClp, amountsInClp: false, ufValue: effectiveUf }
  );

  const allocationNames = ((allocationsRes.data || []) as unknown as { contracts: { name: string } | null }[])
    .map((a) => a.contracts?.name || "Sin nombre");

  return {
    requestDate: request.request_date,
    currency: "CLP",
    contractNames: allocationNames.length > 0 ? allocationNames : [request.project_name].filter((n): n is string => !!n),
    contractCebe: opts.contractCebe ?? null,
    description: request.description || "",
    lines,
    totalAmountClp,
    payments: (plansRes.data || []).map((p) => ({
      description: p.description || "Pago",
      // Usa el monto en CLP guardado si existe (evita el redondeo de ida y vuelta por UF).
      amountClp: p.amount_clp ?? Math.round(p.amount_uf * effectiveUf),
      dueDate: p.due_date,
    })),
    supplierName: request.supplier_name,
    supplierRut: supplierRes.data?.rut ?? null,
    sequenceNumber: request.sequence_number,
    migoChoice: request.migo_choice,
    requestId,
    verificationCode: request.verification_code,
  };
}
