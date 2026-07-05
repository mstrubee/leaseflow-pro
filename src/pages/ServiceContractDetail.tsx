import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { GanttModule } from "@/components/gantt/GanttModule";
import { ServiceBudgetSection } from "@/components/budget/ServiceBudgetSection";
import { ServiceContractAlertsSection } from "@/components/alerts/ServiceContractAlertsSection";
import { ServiceContractApprovalPanel } from "@/components/serviceContracts/ServiceContractApprovalPanel";
import type { ApprovalStatus } from "@/lib/serviceContractApproval";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, Handshake, CalendarDays, Building2, RefreshCw, AlertTriangle } from "lucide-react";

type ServiceContractStatus = "en_negociacion" | "activo" | "vencido" | "cancelado";
type ServiceContractFrequency = "mensual" | "trimestral" | "semestral" | "anual" | "otro";

interface ServiceContractFull {
  id: string;
  name: string;
  service_type: string;
  status: ServiceContractStatus;
  start_date: string;
  end_date: string | null;
  amount_uf: number;
  amount_clp: number | null;
  display_currency: string;
  frequency: ServiceContractFrequency;
  auto_renewal: boolean;
  notice_days: number | null;
  notes: string | null;
  supplier: { id: string; name: string } | null;
  created_by: string | null;
  approval_status: ApprovalStatus;
  approver_id: string | null;
  approver_name: string | null;
  approval_comment: string | null;
  approved_at: string | null;
}

const STATUS_MAP: Record<ServiceContractStatus, { label: string; className: string }> = {
  en_negociacion: { label: "En negociación", className: "bg-blue-100 text-blue-700" },
  activo:         { label: "Activo",          className: "bg-emerald-100 text-emerald-700" },
  vencido:        { label: "Vencido",         className: "bg-red-100 text-red-700" },
  cancelado:      { label: "Cancelado",       className: "bg-gray-100 text-gray-600" },
};

const FREQUENCY_LABELS: Record<ServiceContractFrequency, string> = {
  mensual: "Mensual", trimestral: "Trimestral", semestral: "Semestral", anual: "Anual", otro: "Otro",
};

const formatDate = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" });

const formatCLP = (n: number) => "$ " + new Intl.NumberFormat("es-CL").format(Math.round(n));
const formatUF  = (n: number) => "UF " + n.toFixed(2);

function daysUntil(d: string) {
  return (new Date(d + "T12:00:00").getTime() - Date.now()) / (1000 * 60 * 60 * 24);
}

export default function ServiceContractDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [sc, setSc] = useState<ServiceContractFull | null>(null);
  const [loading, setLoading] = useState(true);

  const loadContract = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from("service_contracts")
      .select("*, supplier:suppliers(id, name)")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) {
      toast.error("No se encontró el contrato de servicio");
      navigate("/service-contracts");
    } else {
      setSc(data as ServiceContractFull);
    }
    setLoading(false);
  }, [id, navigate]);

  useEffect(() => {
    setLoading(true);
    loadContract();
  }, [loadContract]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!sc) return null;

  const status = STATUS_MAP[sc.status];
  const expiring = sc.end_date && daysUntil(sc.end_date) >= 0 && daysUntil(sc.end_date) <= 60;
  const primaryAmt = sc.display_currency === "CLP"
    ? (sc.amount_clp != null ? formatCLP(sc.amount_clp) : formatUF(sc.amount_uf))
    : formatUF(sc.amount_uf);
  const secondaryAmt = sc.display_currency === "CLP" ? formatUF(sc.amount_uf) : (sc.amount_clp != null ? formatCLP(sc.amount_clp) : null);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[1536px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/service-contracts")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Handshake className="h-5 w-5 text-violet-600 shrink-0" />
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-foreground truncate">{sc.name}</h1>
                <p className="text-sm text-muted-foreground">{sc.service_type}</p>
              </div>
            </div>
            <span className={`text-xs font-semibold px-3 py-1 rounded-full ${status.className}`}>
              {status.label}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-[1536px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1 flex items-center gap-1">
              <Building2 className="h-3 w-3" /> Proveedor
            </p>
            <p className="text-sm font-medium">{sc.supplier?.name ?? "—"}</p>
          </CardContent></Card>

          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1">Monto</p>
            <p className="text-sm font-semibold tabular-nums">{primaryAmt}</p>
            {secondaryAmt && <p className="text-xs text-muted-foreground tabular-nums">{secondaryAmt}</p>}
            <p className="text-xs text-muted-foreground">/ {FREQUENCY_LABELS[sc.frequency].toLowerCase()}</p>
          </CardContent></Card>

          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1 flex items-center gap-1">
              <CalendarDays className="h-3 w-3" /> Vigencia
            </p>
            <p className="text-xs text-muted-foreground">Inicio</p>
            <p className="text-sm font-medium">{formatDate(sc.start_date)}</p>
            {sc.end_date && (
              <>
                <p className="text-xs text-muted-foreground mt-1">Término</p>
                <p className={`text-sm font-medium ${expiring ? "text-amber-600" : ""}`}>
                  {formatDate(sc.end_date)}
                  {expiring && <AlertTriangle className="inline h-3 w-3 ml-1" />}
                </p>
              </>
            )}
          </CardContent></Card>

          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1 flex items-center gap-1">
              <RefreshCw className="h-3 w-3" /> Renovación
            </p>
            <p className="text-sm font-medium">{sc.auto_renewal ? "Automática" : "Manual"}</p>
            {sc.notice_days != null && (
              <p className="text-xs text-muted-foreground mt-0.5">{sc.notice_days} días de aviso</p>
            )}
          </CardContent></Card>
        </div>

        {sc.notes && (
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1">Notas</p>
            <p className="text-sm text-foreground whitespace-pre-line">{sc.notes}</p>
          </CardContent></Card>
        )}

        {/* Aprobación */}
        <ServiceContractApprovalPanel
          contract={{
            id: sc.id,
            name: sc.name,
            service_type: sc.service_type,
            supplierName: sc.supplier?.name ?? null,
            amountLabel: `${primaryAmt} / ${FREQUENCY_LABELS[sc.frequency].toLowerCase()}`,
            periodLabel: `${formatDate(sc.start_date)}${sc.end_date ? ` — ${formatDate(sc.end_date)}` : ""}`,
            notes: sc.notes,
            approval_status: sc.approval_status,
            approver_id: sc.approver_id,
            approver_name: sc.approver_name,
            approval_comment: sc.approval_comment,
            approved_at: sc.approved_at,
            created_by: sc.created_by,
          }}
          onChanged={loadContract}
        />

        {/* Tabs: Cronograma | Presupuesto | Alertas */}
        <Tabs defaultValue="gantt">
          <TabsList>
            <TabsTrigger value="gantt">Cronograma</TabsTrigger>
            <TabsTrigger value="budget">Control Presupuestario</TabsTrigger>
            <TabsTrigger value="alerts">Alertas</TabsTrigger>
          </TabsList>
          <TabsContent value="gantt" className="mt-4">
            <GanttModule serviceContractId={sc.id} />
          </TabsContent>
          <TabsContent value="budget" className="mt-4">
            <ServiceBudgetSection
              serviceContractId={sc.id}
              serviceContractName={sc.name}
            />
          </TabsContent>
          <TabsContent value="alerts" className="mt-4">
            <ServiceContractAlertsSection
              serviceContractId={sc.id}
              serviceContractName={sc.name}
              endDate={sc.end_date}
              noticeDays={sc.notice_days}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
