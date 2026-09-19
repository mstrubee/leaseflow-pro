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
