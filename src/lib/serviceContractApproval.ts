import { supabase } from "@/integrations/supabase/client";

export type ApprovalStatus = "pendiente" | "aprobado" | "observado" | "rechazado";

export const APPROVAL_STATUS_MAP: Record<ApprovalStatus, { label: string; className: string }> = {
  pendiente: { label: "Pendiente", className: "bg-amber-100 text-amber-700 border border-amber-200" },
  aprobado:  { label: "Aprobado",  className: "bg-emerald-100 text-emerald-700 border border-emerald-200" },
  observado: { label: "Observado", className: "bg-orange-100 text-orange-700 border border-orange-200" },
  rechazado: { label: "Rechazado", className: "bg-red-100 text-red-700 border border-red-200" },
};

export type ApprovalAction = "aprobada" | "observada" | "rechazada";

/**
 * Resuelve el aprobador por jerarquía (jefe directo designado) y deja el
 * contrato "pendiente" de aprobación. Registra el evento "solicitada".
 */
export async function requestApproval(serviceContractId: string, creatorId: string) {
  const { data } = await supabase.rpc("resolve_sc_approver", { creator: creatorId });
  const resolved = Array.isArray(data) && data.length > 0 ? data[0] : null;

  await supabase
    .from("service_contracts")
    .update({
      approval_status: "pendiente",
      approver_id: resolved?.approver_profile ?? null,
      approver_org_member_id: resolved?.approver_org_member ?? null,
      approver_name: resolved?.approver_name ?? null,
      approval_comment: null,
      approved_at: null,
      approval_requested_at: new Date().toISOString(),
    })
    .eq("id", serviceContractId);

  await supabase.from("service_contract_approval_events").insert({
    service_contract_id: serviceContractId,
    action: "solicitada",
    actor_id: creatorId,
  });

  return resolved;
}

/**
 * Aplica una decisión de aprobación (aprobar / observar / rechazar) y
 * registra el evento correspondiente en el historial.
 */
export async function actOnApproval(
  serviceContractId: string,
  action: ApprovalAction,
  actorId: string,
  comment?: string,
) {
  const statusByAction: Record<ApprovalAction, ApprovalStatus> = {
    aprobada: "aprobado",
    observada: "observado",
    rechazada: "rechazado",
  };
  const cleanComment = comment?.trim() || null;

  const update: Record<string, unknown> = {
    approval_status: statusByAction[action],
    approval_comment: cleanComment,
  };
  if (action === "aprobada") update.approved_at = new Date().toISOString();

  const { error } = await supabase
    .from("service_contracts")
    .update(update)
    .eq("id", serviceContractId);
  if (error) return { error };

  await supabase.from("service_contract_approval_events").insert({
    service_contract_id: serviceContractId,
    action,
    actor_id: actorId,
    comment: cleanComment,
  });
  return { error: null };
}

/**
 * ¿El usuario actual puede aprobar este contrato?
 * - Solo cuando está "pendiente".
 * - Admin siempre puede.
 * - Si hay aprobador asignado, solo ese usuario.
 * - Si no se resolvió aprobador, cualquiera del pool puede.
 */
export function canApprove(
  sc: { approver_id: string | null; approval_status: string },
  opts: { userId: string | null; isAdmin: boolean; inPool: boolean },
) {
  if (sc.approval_status !== "pendiente") return false;
  if (opts.isAdmin) return true;
  if (!opts.userId) return false;
  if (sc.approver_id) return sc.approver_id === opts.userId;
  return opts.inPool;
}
