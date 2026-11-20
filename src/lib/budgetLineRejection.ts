import { supabase } from "@/integrations/supabase/client";

/**
 * Rechazo de una solicitud de autorización: la línea vuelve a "No Autorizado" y
 * queda marcada como "Observada" (rejected_at) con una observación opcional.
 * Lanza si la BD rechaza el update (p. ej. falta aplicar la migración de las
 * columnas rejected_*).
 *
 * La cotización adjunta NO debe perderse al rechazar. El cambio de `status`
 * dispara triggers en la BD (trg_budget_line_authorized) que pueden tocar otras
 * columnas de la línea, así que se guarda la cotización antes y, si después del
 * update quedó vacía o distinta, se restaura en un segundo update (mismo patrón
 * en dos pasos que SolicitaAutorizarDialog).
 */
export async function rejectAuthorizationRequest(lineId: string, note: string, userId: string | null) {
  const quotationCols = "quotation_file_url, quotation_file_name, quotation_storage_path";

  const { data: before, error: beforeError } = await supabase
    .from("budget_lines")
    .select(quotationCols)
    .eq("id", lineId)
    .maybeSingle();
  if (beforeError) throw beforeError;

  const payload = {
    status: "no_autorizado" as const,
    rejected_at: new Date().toISOString(),
    rejection_note: note.trim() || null,
    rejected_by: userId,
  };
  const { error } = await supabase.from("budget_lines").update(payload).eq("id", lineId);
  if (error) throw error;

  if (before?.quotation_file_url) {
    const { data: after } = await supabase.from("budget_lines").select(quotationCols).eq("id", lineId).maybeSingle();
    if (
      after?.quotation_file_url !== before.quotation_file_url ||
      after?.quotation_storage_path !== before.quotation_storage_path
    ) {
      console.warn("El rechazo alteró la cotización de la línea; se restaura.", lineId);
      const { error: restoreError } = await supabase
        .from("budget_lines")
        .update({
          quotation_file_url: before.quotation_file_url,
          quotation_file_name: before.quotation_file_name,
          quotation_storage_path: before.quotation_storage_path,
        })
        .eq("id", lineId);
      if (restoreError) {
        // La línea ya quedó rechazada; se avisa en consola y se deja seguir el flujo.
        console.error("No se pudo restaurar la cotización tras el rechazo:", restoreError.message);
      }
    }
  }
  return payload;
}

/**
 * Limpia la observación al volver a solicitar autorización o al autorizar.
 * "Best effort": solo toca filas que la tengan, y si falla (p. ej. columnas aún
 * no creadas) no corta el flujo principal -- por eso no lanza.
 */
export async function clearLineRejections(lineIds: string[]) {
  if (lineIds.length === 0) return;
  const { error } = await supabase
    .from("budget_lines")
    .update({ rejected_at: null, rejection_note: null, rejected_by: null })
    .in("id", lineIds)
    .not("rejected_at", "is", null);
  if (error) console.warn("No se pudo limpiar la observación de rechazo:", error.message);
}
