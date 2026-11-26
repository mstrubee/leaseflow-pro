import { supabase } from "@/integrations/supabase/client";
import type { OCRequestPrefillDraft } from "@/components/budget/OCRequestCreateDialog";
import type { OCRequiredGroup } from "@/lib/ocRequiredGroups";
import { loadDistribution } from "@/lib/cebeDistributionStore";

type OCRequiredDraftSource = Pick<
  OCRequiredGroup,
  "quotationNumber" | "lines" | "amountClp" | "filePath" | "fileName" | "storagePath" | "supplierId" | "supplierName"
>;

/**
 * Arma el prellenado de "Nueva Solicitud de OC" a partir de un requerimiento:
 * líneas, monto, archivo, proveedor y plan de pagos (oc_payment_plans por
 * quotation_number). Lo usan la vista por contrato y la vista global.
 */
export async function buildPrefillDraftFromGroup(group: OCRequiredDraftSource): Promise<OCRequestPrefillDraft> {
  const { data: plans } = await supabase
    .from("oc_payment_plans")
    .select("description, amount_clp, due_date")
    .eq("quotation_number", group.quotationNumber)
    .order("payment_number");

  // Distribución por CEBE del requerimiento (local mixto). Si no hay (o falla la lectura) la
  // solicitud simplemente no hereda nada y se pedirá ingresarla.
  let cebeDistribution: Awaited<ReturnType<typeof loadDistribution>> = [];
  try {
    cebeDistribution = await loadDistribution({ kind: "requirement", contractId: "", id: group.quotationNumber });
  } catch (error) {
    console.error("No se pudo leer la distribución por CEBE del requerimiento:", error);
  }

  return {
    quotationNumber: group.quotationNumber,
    cebeDistribution,
    lines: group.lines.map((l) => ({ lineId: l.budgetLineId, lineName: l.lineName, amountUf: l.amountUf })),
    totalAmountClp: group.amountClp,
    fileUrl: group.filePath,
    fileName: group.fileName,
    storagePath: group.storagePath,
    supplierId: group.supplierId,
    supplierName: group.supplierName,
    paymentPlan: (plans || []).map((p: any) => ({
      description: p.description || "",
      amount: String(Math.round(p.amount_clp || 0)),
      due_date: p.due_date || "",
    })),
  };
}
