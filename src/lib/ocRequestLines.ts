import { supabase } from "@/integrations/supabase/client";

// Asignación de líneas de presupuesto de una solicitud de OC.
//
// El modelo tiene dos formas según cuántas líneas haya, y mezclarlas deja
// datos inconsistentes:
//   · 1 línea  → `oc_requests.budget_line_id` apunta a la línea y NO hay filas
//                en `oc_budget_lines`.
//   · 2 o más  → `oc_requests.budget_line_id` queda en null y cada línea vive
//                como fila de `oc_budget_lines`.
// En ambos casos `line_name` guarda el texto que se muestra en los listados.
//
// Esta lógica ya existía embebida en OCRequestViewDialog (edición manual de
// líneas); acá vive aparte para que la propagación desde una OC editada use
// exactamente las mismas reglas y no aparezca una segunda interpretación.

export interface OCRequestLineAssignment {
  lineId: string;
  lineName: string;
  /** UF asignadas a esta línea. La suma debe dar el total de la solicitud. */
  amountUf: number;
}

/**
 * Reescribe por completo la asignación de líneas de una solicitud de OC.
 *
 * Siempre limpia primero la tabla puente: si no, al pasar de múltiple a simple
 * quedan filas residuales que siguen contando en el disponible del presupuesto.
 */
export async function replaceOCRequestLines(
  requestId: string,
  lines: OCRequestLineAssignment[],
): Promise<void> {
  if (lines.length === 0) return;

  const { error: delError } = await supabase
    .from("oc_budget_lines")
    .delete()
    .eq("oc_request_id", requestId);
  if (delError) throw delError;

  if (lines.length === 1) {
    const { error } = await supabase
      .from("oc_requests")
      .update({ budget_line_id: lines[0].lineId, line_name: lines[0].lineName })
      .eq("id", requestId);
    if (error) throw error;
    return;
  }

  const { error: clearError } = await supabase
    .from("oc_requests")
    .update({ budget_line_id: null, line_name: lines.map((l) => l.lineName).join(" + ") })
    .eq("id", requestId);
  if (clearError) throw clearError;

  const { error: insertError } = await supabase.from("oc_budget_lines").insert(
    lines.map((l) => ({
      oc_request_id: requestId,
      budget_line_id: l.lineId,
      amount_uf: Math.round(l.amountUf * 10000) / 10000,
    })),
  );
  if (insertError) throw insertError;
}

/**
 * Reparte `total` entre `lines` en partes iguales, dejando el resto en la
 * última para que la suma dé exactamente `total`.
 *
 * Importa porque la edición manual de líneas valida que la suma coincida con
 * el monto de la solicitud (tolerancia 0,01): un reparto que arrastre
 * decimales dejaría la solicitud en un estado que su propio diálogo rechaza.
 */
function splitEvenly(total: number, lines: { id: string; name: string }[]): OCRequestLineAssignment[] {
  const round4 = (v: number) => Math.round(v * 10000) / 10000;
  const per = round4(total / lines.length);
  return lines.map((l, i) => ({
    lineId: l.id,
    lineName: l.name,
    amountUf: i === lines.length - 1 ? round4(total - per * (lines.length - 1)) : per,
  }));
}

/**
 * Propaga a la solicitud de OC de origen las líneas con las que quedó la OC
 * tras editarla.
 *
 * Sin esto, la solicitud sigue mostrando las líneas con las que se creó y el
 * consumo del presupuesto queda imputado donde ya no corresponde.
 *
 * Detalles deliberados:
 * - NO se filtra por estado: el pedido es que la solicitud se corrija aunque
 *   ya esté cerrada/convertida, porque es el registro histórico de a qué
 *   líneas se imputó el gasto.
 * - El monto que se reparte es el de la SOLICITUD, no el de la OC. Cambian las
 *   líneas, no lo que se pidió; además la edición manual valida contra ese
 *   total y un monto ajeno la dejaría en un estado inválido.
 * - Con `lines` vacío no hace nada (ej.: la OC pasó a OPEX y ya no tiene
 *   líneas CAPEX). Borrar la asignación dejaría a la solicitud sin líneas, que
 *   es un estado que el modelo no admite.
 *
 * @returns cuántas solicitudes se actualizaron.
 */
export async function syncOCRequestLinesFromPurchaseOrder(
  purchaseOrderId: string,
  lines: { id: string; name: string }[],
): Promise<number> {
  if (lines.length === 0) return 0;

  const { data: requests, error } = await supabase
    .from("oc_requests")
    .select("id, amount_uf")
    .eq("purchase_order_id", purchaseOrderId);
  if (error) throw error;
  if (!requests?.length) return 0;

  for (const req of requests) {
    await replaceOCRequestLines(req.id, splitEvenly(req.amount_uf ?? 0, lines));
  }
  return requests.length;
}

/** Una línea CAPEX de una solicitud, con el contrato al que pertenece su presupuesto. */
export interface OCRequestLineAllocation {
  lineId: string;
  lineName: string;
  /** UF imputadas a la línea en la solicitud. */
  amountUf: number;
  budgetId: string;
  contractId: string;
}

/**
 * Líneas CAPEX con las que quedó imputada una solicitud, según el modelo de
 * arriba: filas de `oc_budget_lines` (2+ líneas) o `oc_requests.budget_line_id`
 * (1 línea, con el monto total de la solicitud). Cada línea trae su contrato
 * (el de su presupuesto), necesario en solicitudes multi-contrato para saber
 * qué líneas corresponden a cada OC. Devuelve [] si es OPEX o no tiene líneas.
 */
export async function loadOCRequestLineAllocations(request: {
  id: string;
  budget_line_id?: string | null;
  amount_uf?: number | null;
}): Promise<OCRequestLineAllocation[]> {
  const { data: bridgeRows, error } = await supabase
    .from("oc_budget_lines")
    .select("budget_line_id, amount_uf")
    .eq("oc_request_id", request.id);
  if (error) throw error;

  const assigned: { lineId: string; amountUf: number }[] = (bridgeRows || []).length > 0
    ? (bridgeRows || []).map((r) => ({ lineId: r.budget_line_id, amountUf: r.amount_uf ?? 0 }))
    : request.budget_line_id
      ? [{ lineId: request.budget_line_id, amountUf: request.amount_uf ?? 0 }]
      : [];
  if (assigned.length === 0) return [];

  const { data: lineRows, error: linesError } = await supabase
    .from("budget_lines")
    .select("id, name, budget_id, contract_budgets(contract_id)")
    .in("id", assigned.map((a) => a.lineId));
  if (linesError) throw linesError;

  const byId = new Map(
    ((lineRows || []) as unknown as { id: string; name: string; budget_id: string; contract_budgets: { contract_id: string } | null }[])
      .map((l) => [l.id, l]),
  );

  return assigned.flatMap((a) => {
    const line = byId.get(a.lineId);
    // Una línea eliminada o sin presupuesto no se puede imputar a ninguna OC.
    if (!line || !line.contract_budgets) return [];
    return [{
      lineId: a.lineId,
      lineName: line.name,
      amountUf: a.amountUf,
      budgetId: line.budget_id,
      contractId: line.contract_budgets.contract_id,
    }];
  });
}

/**
 * Reparte `targetUf` entre las líneas en proporción a lo que cada una tenía en
 * la solicitud (partes iguales si todas están en 0). El resto del redondeo va a
 * la última para que la suma dé exactamente `targetUf`.
 */
export function scaleLineAmounts(lines: { amountUf: number }[], targetUf: number): number[] {
  if (lines.length === 0) return [];
  const round4 = (v: number) => Math.round(v * 10000) / 10000;
  const weightSum = lines.reduce((s, l) => s + (l.amountUf || 0), 0);
  const amounts: number[] = [];
  let assigned = 0;
  lines.forEach((l, i) => {
    const share = i === lines.length - 1
      ? round4(targetUf - assigned)
      : round4(weightSum > 0 ? targetUf * ((l.amountUf || 0) / weightSum) : targetUf / lines.length);
    assigned += share;
    amounts.push(share);
  });
  return amounts;
}

/**
 * Inserta en `purchase_order_budget_lines` las líneas de una OC creada desde una
 * solicitud, con los montos ya repartidos (ver scaleLineAmounts). Lanza si
 * falla: una OC CAPEX sin sus líneas no descuenta del presupuesto.
 */
export async function insertPurchaseOrderLines(
  purchaseOrderId: string,
  lines: { lineId: string }[],
  amountsUf: number[],
): Promise<void> {
  if (lines.length === 0) return;
  const { error } = await supabase.from("purchase_order_budget_lines").insert(
    lines.map((l, i) => ({
      purchase_order_id: purchaseOrderId,
      budget_line_id: l.lineId,
      amount_uf: amountsUf[i] ?? 0,
    })),
  );
  if (error) throw error;
}
