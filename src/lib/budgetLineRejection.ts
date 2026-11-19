import { supabase } from "@/integrations/supabase/client";

/**
 * Rechazo de una solicitud de autorización: la línea vuelve a "No Autorizado" y
 * queda marcada como "Observada" (rejected_at) con una observación opcional.
 * Lanza si la BD rechaza el update (p. ej. falta aplicar la migración de las
 * columnas rejected_*).
 */
export async function rejectAuthorizationRequest(lineId: string, note: string, userId: string | null) {
  const payload = {
    status: "no_autorizado" as const,
    rejected_at: new Date().toISOString(),
    rejection_note: note.trim() || null,
    rejected_by: userId,
  };
  const { error } = await supabase.from("budget_lines").update(payload).eq("id", lineId);
  if (error) throw error;
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
