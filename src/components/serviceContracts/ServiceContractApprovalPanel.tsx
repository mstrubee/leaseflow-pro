import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ShieldCheck, Clock, RotateCcw, MessageSquareWarning } from "lucide-react";
import {
  APPROVAL_STATUS_MAP, ApprovalStatus, canApprove, requestApproval,
} from "@/lib/serviceContractApproval";
import { ApprovalActionDialog, ApprovalDialogContract } from "@/components/serviceContracts/ApprovalActionDialog";

interface ApprovalContract {
  id: string;
  name: string;
  service_type: string;
  supplierName: string | null;
  amountLabel: string | null;
  periodLabel: string | null;
  notes: string | null;
  approval_status: ApprovalStatus;
  approver_id: string | null;
  approver_name: string | null;
  approval_comment: string | null;
  approved_at: string | null;
  created_by: string | null;
}

interface EventRow {
  id: string;
  action: string;
  actor_id: string | null;
  comment: string | null;
  created_at: string;
  actor_name?: string | null;
}

const ACTION_LABELS: Record<string, string> = {
  solicitada: "Solicitó aprobación",
  aprobada: "Aprobó",
  observada: "Observó",
  rechazada: "Rechazó",
  reenviada: "Reenvió a aprobación",
};

function formatDateTime(d: string) {
  return new Date(d).toLocaleString("es-CL", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function ServiceContractApprovalPanel({
  contract,
  onChanged,
}: {
  contract: ApprovalContract;
  onChanged: () => void;
}) {
  const { user, isAdmin } = useAuth();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [inPool, setInPool] = useState(false);
  const [creatorName, setCreatorName] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resubmitting, setResubmitting] = useState(false);

  const loadMeta = useCallback(async () => {
    const [{ data: eventData }, { data: profileData }, { data: poolData }] = await Promise.all([
      supabase
        .from("service_contract_approval_events")
        .select("id, action, actor_id, comment, created_at")
        .eq("service_contract_id", contract.id)
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, email"),
      supabase.from("service_contract_approvers").select("profile_id").not("profile_id", "is", null),
    ]);

    const nameById: Record<string, string> = {};
    for (const p of ((profileData as { id: string; full_name: string | null; email: string }[]) ?? [])) {
      nameById[p.id] = p.full_name || p.email;
    }
    setCreatorName(contract.created_by ? (nameById[contract.created_by] ?? null) : null);
    setEvents(((eventData as EventRow[]) ?? []).map(e => ({
      ...e,
      actor_name: e.actor_id ? (nameById[e.actor_id] ?? null) : null,
    })));
    const poolIds = new Set(((poolData as { profile_id: string }[]) ?? []).map(a => a.profile_id));
    setInPool(!!user && poolIds.has(user.id));
  }, [contract.id, contract.created_by, user]);

  useEffect(() => { loadMeta(); }, [loadMeta]);

  const badge = APPROVAL_STATUS_MAP[contract.approval_status] ?? APPROVAL_STATUS_MAP.pendiente;
  const actionable = canApprove(contract, { userId: user?.id ?? null, isAdmin, inPool });
  const isCreator = !!user && contract.created_by === user.id;
  const canResubmit = isCreator && (contract.approval_status === "observado" || contract.approval_status === "rechazado");

  const dialogContract: ApprovalDialogContract = {
    id: contract.id,
    name: contract.name,
    supplierName: contract.supplierName,
    serviceType: contract.service_type,
    amountLabel: contract.amountLabel,
    periodLabel: contract.periodLabel,
    notes: contract.notes,
  };

  const handleResubmit = async () => {
    if (!user?.id) return;
    setResubmitting(true);
    await requestApproval(contract.id, user.id);
    // registrar como "reenviada"
    await supabase.from("service_contract_approval_events").insert({
      service_contract_id: contract.id,
      action: "reenviada",
      actor_id: user.id,
    });
    setResubmitting(false);
    toast.success("Reenviado a aprobación");
    onChanged();
    loadMeta();
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-violet-600" />
            <span className="font-semibold">Aprobación</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.className}`}>
              {badge.label}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {canResubmit && (
              <Button size="sm" variant="outline" onClick={handleResubmit} disabled={resubmitting}>
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                {resubmitting ? "Reenviando..." : "Reenviar a aprobación"}
              </Button>
            )}
            {actionable && (
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                Revisar y decidir
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Creador</p>
            <p className="font-medium">{creatorName ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Aprobador</p>
            <p className="font-medium">{contract.approver_name ?? "Sin resolver"}</p>
          </div>
          {contract.approved_at && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Aprobado</p>
              <p className="font-medium">{formatDateTime(contract.approved_at)}</p>
            </div>
          )}
        </div>

        {contract.approval_comment && (contract.approval_status === "observado" || contract.approval_status === "rechazado") && (
          <div className={`rounded-md p-3 text-sm flex gap-2 ${
            contract.approval_status === "observado" ? "bg-orange-50 text-orange-800" : "bg-red-50 text-red-800"
          }`}>
            <MessageSquareWarning className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">{contract.approval_status === "observado" ? "Observación" : "Motivo del rechazo"}</p>
              <p className="whitespace-pre-line">{contract.approval_comment}</p>
            </div>
          </div>
        )}

        {contract.approver_name === null && contract.approval_status === "pendiente" && (
          <p className="text-xs text-amber-600">
            No se pudo resolver un aprobador desde el organigrama. Un administrador o un aprobador designado puede revisarlo.
          </p>
        )}

        {events.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <Clock className="h-3 w-3" /> Historial
            </p>
            <div className="space-y-1.5">
              {events.map(e => (
                <div key={e.id} className="text-xs flex gap-2">
                  <span className="text-muted-foreground shrink-0 tabular-nums">{formatDateTime(e.created_at)}</span>
                  <span>
                    <span className="font-medium">{e.actor_name ?? "—"}</span>{" "}
                    {ACTION_LABELS[e.action] ?? e.action}
                    {e.comment && <span className="text-muted-foreground">: {e.comment}</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      <ApprovalActionDialog
        contract={dialogContract}
        actorId={user?.id ?? null}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onDone={() => { onChanged(); loadMeta(); }}
      />
    </Card>
  );
}
