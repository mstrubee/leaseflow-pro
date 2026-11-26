import { supabase } from "@/integrations/supabase/client";
import { buildShareLines, reconcileShareLines, OCRequestShareData, OCRequestShareLine } from "@/lib/ocRequestShare";
import { extractStoragePath } from "@/lib/storageUtils";
import { loadOCRequestLineAllocations } from "@/lib/ocRequestLines";
import { loadContractCebes, loadContractCebeEntriesFor } from "@/lib/contractCebe";
import { loadDistribution } from "@/lib/cebeDistributionStore";
import { enrichShareData } from "@/lib/shareDataEnrich";
import { isMixedLocal, toShareRows } from "@/lib/cebeDistribution";

interface StoredOCRequest {
  contract_id: string;
  budget_line_id: string | null;
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
  co_order_numbers: string | null;
  quotation_url: string | null;
  quotation_file_name: string | null;
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

  const [lineAssignments, allocationsRes, plansRes, supplierRes] = await Promise.all([
    // Líneas CAPEX con su contrato (1 línea: budget_line_id; 2+: oc_budget_lines).
    loadOCRequestLineAllocations({ id: requestId, budget_line_id: request.budget_line_id, amount_uf: request.amount_uf }),
    supabase.from("oc_request_contract_allocations").select("contract_id, amount_uf, amount_clp").eq("oc_request_id", requestId),
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

  // Contrato y CEBE de cada línea: la tabla de ítems del PDF los muestra por línea.
  const allocationRows = allocationsRes.data || [];
  const contractIds = [...new Set([
    request.contract_id,
    ...allocationRows.map((a) => a.contract_id),
    ...lineAssignments.map((l) => l.contractId),
  ].filter(Boolean))];
  const [contractsRes, cebes] = await Promise.all([
    supabase.from("contracts").select("id, name").in("id", contractIds),
    loadContractCebes(contractIds),
  ]);
  const contractNames = new Map((contractsRes.data || []).map((c) => [c.id, c.name]));
  const nameOf = (id: string) => contractNames.get(id) ?? null;
  const cebeOf = (id: string) => cebes.get(id) ?? null;

  // Una solicitud OPEX no tiene líneas CAPEX (oc_budget_lines referencia budget_lines).
  // Sin líneas, la "línea" es la categoría guardada en la propia solicitud: una fila por
  // contrato si es multi-contrato (con el monto de cada uno), o una sola si no.
  let lines: OCRequestShareLine[];
  if (lineAssignments.length > 0) {
    lines = buildShareLines(
      lineAssignments.map((l) => ({ lineId: l.lineId, lineName: l.lineName, amount: l.amountUf, contractName: nameOf(l.contractId), cebe: cebeOf(l.contractId) })),
      { totalAmountClp, amountsInClp: false, ufValue: effectiveUf }
    );
  } else if (allocationRows.length > 0) {
    lines = reconcileShareLines(
      allocationRows.map((a) => ({
        lineName: request.line_name || "Línea",
        amountClp: Math.round(a.amount_clp ?? (a.amount_uf ?? 0) * effectiveUf),
        contractName: nameOf(a.contract_id),
        cebe: cebeOf(a.contract_id),
      })),
      totalAmountClp
    );
  } else {
    lines = [{
      lineName: request.line_name || "Línea",
      amountClp: totalAmountClp,
      contractName: request.project_name || nameOf(request.contract_id),
      cebe: cebeOf(request.contract_id),
    }];
  }

  const allocationNames = allocationRows.map((a) => nameOf(a.contract_id) || "Sin nombre");
  const headerCebe = allocationRows.length > 0
    ? [...new Set(allocationRows.map((a) => cebeOf(a.contract_id)).filter((c): c is string => !!c))].join(", ") || null
    : opts.contractCebe ?? cebeOf(request.contract_id);

  // Cotización adjunta a la solicitud. oc_requests.quotation_url guarda una
  // referencia a Supabase Storage (solicitudes creadas desde "+ Solicitud OC") o
  // la URL de Drive (solicitudes creadas desde un Requerimiento / línea CAPEX).
  // Sin esto el diálogo de compartir recibía `quotation` vacío y, tras "Guardar
  // Cambios", ofrecía solo el PDF en vez del ZIP con la cotización.
  const quotationUrl = request.quotation_url;
  const quotationIsStorage = !!quotationUrl && !!extractStoragePath(quotationUrl);

  // Local mixto: distribución por CEBE de la solicitud, para mostrarla en el PDF.
  let cebeDistribution: OCRequestShareData["cebeDistribution"] = null;
  try {
    const stored = await loadDistribution({ kind: "request", contractId: request.contract_id, id: requestId });
    if (isMixedLocal(stored.length)) {
      const entries = await loadContractCebeEntriesFor(request.contract_id);
      cebeDistribution = toShareRows(
        stored.map((d) => ({ cebeId: d.cebeId, amount: d.amount })),
        (cebeId) => entries.find((e) => e.id === cebeId)?.cebe ?? "CEBE",
        totalAmountClp,
      );
    }
  } catch (distError) {
    console.error("No se pudo leer la distribución por CEBE para el PDF:", distError);
  }

  const shareData: OCRequestShareData = {
    requestDate: request.request_date,
    currency: "CLP",
    contractNames: allocationNames.length > 0 ? allocationNames : [request.project_name].filter((n): n is string => !!n),
    contractCebe: headerCebe,
    cebeDistribution,
    coOrderNumbers: request.co_order_numbers ?? null,
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
    quotation: quotationUrl
      ? {
          fileName: request.quotation_file_name,
          storagePath: quotationIsStorage ? quotationUrl : null,
          driveUrl: quotationIsStorage ? null : quotationUrl,
        }
      : null,
  };

  // Monto autorizado de cada línea (Control de Presupuesto) y CEBE por empresa.
  return enrichShareData(shareData, {
    ufValue: opts.ufValue,
    contractId: allocationRows.length > 0 ? null : request.contract_id,
  });
}
