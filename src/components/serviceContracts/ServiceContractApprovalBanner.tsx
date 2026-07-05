import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ChevronRight } from "lucide-react";
import { ApprovalActionDialog, ApprovalDialogContract } from "@/components/serviceContracts/ApprovalActionDialog";

interface PendingRow {
  id: string;
  name: string;
  service_type: string;
  start_date: string;
  end_date: string | null;
  amount_uf: number;
  amount_clp: number | null;
  display_currency: string;
  frequency: string;
  notes: string | null;
  approver_id: string | null;
  supplier: { name: string } | null;
}

const FREQ: Record<string, string> = {
  mensual: "mensual", trimestral: "trimestral", semestral: "semestral", anual: "anual", otro: "otro",
};

function formatCLP(n: number) { return "$ " + new Intl.NumberFormat("es-CL").format(Math.round(n)); }
function formatUF(n: number) { return "UF " + n.toFixed(2); }
function formatDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}

export function ServiceContractApprovalBanner() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [target, setTarget] = useState<ApprovalDialogContract | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user) { setPending([]); return; }

    // ¿El usuario está en el pool de aprobadores?
    const { data: poolData } = await supabase
      .from("service_contract_approvers")
      .select("profile_id")
      .eq("profile_id", user.id);
    const inPool = !!(poolData && poolData.length > 0);

    const sel = "id, name, service_type, start_date, end_date, amount_uf, amount_clp, display_currency, frequency, notes, approver_id, supplier:suppliers(name)";

    // Asignadas directamente a mí
    const { data: mine } = await supabase
      .from("service_contracts")
      .select(sel)
      .eq("approval_status", "pendiente")
      .eq("approver_id", user.id);

    let rows = (mine as unknown as PendingRow[]) ?? [];

    // Sin aprobador resuelto: admin o miembros del pool pueden tomarlas
    if (isAdmin || inPool) {
      const { data: unassigned } = await supabase
        .from("service_contracts")
        .select(sel)
        .eq("approval_status", "pendiente")
        .is("approver_id", null);
      const extra = (unassigned as unknown as PendingRow[]) ?? [];
      const seen = new Set(rows.map(r => r.id));
      rows = [...rows, ...extra.filter(r => !seen.has(r.id))];
    }

    setPending(rows);
  }, [user, isAdmin]);

  useEffect(() => { load(); }, [load]);

  if (pending.length === 0) return null;

  const openReview = (row: PendingRow) => {
    const primaryAmt = row.display_currency === "CLP"
      ? (row.amount_clp != null ? formatCLP(row.amount_clp) : formatUF(row.amount_uf))
      : formatUF(row.amount_uf);
    setTarget({
      id: row.id,
      name: row.name,
      supplierName: row.supplier?.name ?? null,
      serviceType: row.service_type,
      amountLabel: `${primaryAmt} / ${FREQ[row.frequency] ?? row.frequency}`,
      periodLabel: `${formatDate(row.start_date)}${row.end_date ? ` — ${formatDate(row.end_date)}` : ""}`,
      notes: row.notes,
    });
    setDialogOpen(true);
  };

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-4">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="h-5 w-5 text-violet-600" />
        <p className="font-semibold text-violet-900">
          {pending.length} contrato{pending.length !== 1 ? "s" : ""} de servicio pendiente{pending.length !== 1 ? "s" : ""} de tu aprobación
        </p>
      </div>
      <div className="space-y-2">
        {pending.map(row => (
          <div key={row.id} className="flex items-center gap-3 bg-card rounded-md border px-3 py-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{row.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {row.supplier?.name ?? "—"} · {row.service_type}
              </p>
            </div>
            <Button size="sm" variant="outline" className="shrink-0" onClick={() => openReview(row)}>
              Revisar
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => navigate(`/service-contracts/${row.id}`)} title="Ver detalle">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <ApprovalActionDialog
        contract={target}
        actorId={user?.id ?? null}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onDone={load}
      />
    </div>
  );
}
