import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEconomicIndicators } from "@/hooks/useEconomicIndicators";
import { CompanyLogo, getCompanyNames } from "@/components/contracts/CompanyLogo";
import {
  APPROVAL_STATUS_MAP, ApprovalStatus, requestApproval, canApprove,
} from "@/lib/serviceContractApproval";
import { ApprovalActionDialog, ApprovalDialogContract } from "@/components/serviceContracts/ApprovalActionDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ArrowLeft, Plus, Pencil, Trash2, ExternalLink, Handshake, AlertTriangle, ChevronRight, Search, X, Settings2 } from "lucide-react";

type ServiceContractStatus = "en_negociacion" | "activo" | "vencido" | "cancelado";
type ServiceContractFrequency = "mensual" | "trimestral" | "semestral" | "anual" | "otro";
type DisplayCurrency = "CLP" | "UF";

interface ServiceContract {
  id: string;
  name: string;
  supplier_id: string;
  service_type: string;
  status: ServiceContractStatus;
  start_date: string;
  end_date: string | null;
  amount_uf: number;
  amount_clp: number | null;
  display_currency: DisplayCurrency;
  frequency: ServiceContractFrequency;
  notice_days: number | null;
  auto_renewal: boolean;
  renewal_term_months: number | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  approval_status: ApprovalStatus;
  approver_id: string | null;
  approver_name: string | null;
  approval_comment: string | null;
  approved_at: string | null;
  supplier?: { id: string; name: string } | null;
  linked_contracts?: string[];
  created_by_name?: string | null;
}

interface Supplier { id: string; name: string }
interface ContractOption {
  id: string;
  name: string;
  contract_companies?: Array<{ companies: { name: string } | null }>;
}

const SERVICE_TYPES_SEED = [
  "Aseo y limpieza", "Seguridad y vigilancia", "Transporte de valores",
  "Mantención de equipos", "Soporte tecnológico (IT)", "Jardinería y paisajismo",
  "Gestión de residuos", "Control de plagas", "Catering y alimentación",
  "Consultoría", "Auditoría", "Seguros",
];

const FREQUENCY_LABELS: Record<ServiceContractFrequency, string> = {
  mensual: "Mensual",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
  otro: "Otro",
};

const FREQUENCY_MONTHS: Record<ServiceContractFrequency, number> = {
  mensual: 1, trimestral: 3, semestral: 6, anual: 12, otro: 1,
};

const STATUS_MAP: Record<ServiceContractStatus, { label: string; className: string }> = {
  en_negociacion: { label: "En negociación", className: "bg-blue-100 text-blue-700" },
  activo:         { label: "Activo",          className: "bg-emerald-100 text-emerald-700" },
  vencido:        { label: "Vencido",         className: "bg-red-100 text-red-700" },
  cancelado:      { label: "Cancelado",       className: "bg-gray-100 text-gray-600" },
};

const formatCLP = (n: number) =>
  "$ " + new Intl.NumberFormat("es-CL").format(Math.round(n));

const formatUF = (n: number) =>
  "UF " + n.toFixed(2);

const EMPTY_FORM = {
  name: "",
  supplier_id: "",
  service_type: "",
  status: "en_negociacion" as ServiceContractStatus,
  start_date: "",
  end_date: "",
  amount_raw: "",
  display_currency: "CLP" as DisplayCurrency,
  frequency: "mensual" as ServiceContractFrequency,
  notice_days: "",
  auto_renewal: false,
  renewal_term_months: "",
  notes: "",
  selectedContractIds: [] as string[],
};

function daysUntil(dateStr: string) {
  return (new Date(dateStr + "T12:00:00").getTime() - Date.now()) / (1000 * 60 * 60 * 24);
}

function formatDate(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("es-CL", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

export default function ServiceContractsDashboard() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { ufValue, convertPesosToUF, convertUFToPesos } = useEconomicIndicators();

  const [contracts, setContracts] = useState<ServiceContract[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [contractOptions, setContractOptions] = useState<ContractOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingApprovalStatus, setEditingApprovalStatus] = useState<ApprovalStatus | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [poolProfileIds, setPoolProfileIds] = useState<Set<string>>(new Set());
  const [approvalTarget, setApprovalTarget] = useState<ApprovalDialogContract | null>(null);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [contractSearch, setContractSearch] = useState("");
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [contractRegionMap, setContractRegionMap] = useState<Record<string, string>>({});
  const [serviceTypes, setServiceTypes] = useState<string[]>(SERVICE_TYPES_SEED);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [newTypeInput, setNewTypeInput] = useState("");
  const [savingType, setSavingType] = useState(false);
  const [manageTypesOpen, setManageTypesOpen] = useState(false);
  const [editingType, setEditingType] = useState<{ original: string; value: string } | null>(null);
  const [typeContractCounts, setTypeContractCounts] = useState<Record<string, number>>({});
  const [manageTypeInput, setManageTypeInput] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { data: profileData }] = await Promise.all([
      supabase
        .from("service_contracts")
        .select("*, supplier:suppliers(id, name), service_contract_contracts(contract_id)")
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, email"),
    ]);

    const nameById: Record<string, string> = {};
    for (const p of ((profileData as { id: string; full_name: string | null; email: string }[]) ?? [])) {
      nameById[p.id] = p.full_name || p.email;
    }

    if (error) {
      toast.error("Error al cargar contratos de servicio");
    } else {
      setContracts(
        (data ?? []).map((d: any) => ({
          ...d,
          supplier: d.supplier ?? null,
          linked_contracts: (d.service_contract_contracts ?? []).map((c: any) => c.contract_id),
          created_by_name: d.created_by ? (nameById[d.created_by] ?? null) : null,
        }))
      );
    }
    setLoading(false);
  }, []);

  const loadApproverPool = useCallback(async () => {
    const { data } = await supabase
      .from("service_contract_approvers")
      .select("profile_id")
      .not("profile_id", "is", null);
    setPoolProfileIds(new Set(((data as { profile_id: string }[]) ?? []).map(a => a.profile_id)));
  }, []);

  const loadSuppliers = useCallback(async () => {
    const { data } = await supabase.from("suppliers").select("id, name").order("name");
    setSuppliers(data ?? []);
  }, []);

  const loadContractOptions = useCallback(async () => {
    const [{ data: contractData }, { data: addressData }] = await Promise.all([
      supabase
        .from("contracts")
        .select("id, name, contract_companies(companies(name))")
        .eq("status", "firmado")
        .is("deleted_at", null)
        .order("name"),
      supabase
        .from("contract_addresses")
        .select("contract_id, region")
        .not("region", "is", null),
    ]);
    setContractOptions((contractData as ContractOption[]) ?? []);
    const regionMap: Record<string, string> = {};
    for (const a of (addressData ?? [])) {
      if (a.contract_id && a.region) regionMap[a.contract_id] = a.region;
    }
    setContractRegionMap(regionMap);
  }, []);

  const loadServiceTypes = useCallback(async () => {
    const { data } = await supabase
      .from("service_contract_types")
      .select("name")
      .order("name");
    if (data && data.length > 0) setServiceTypes(data.map(d => d.name));
  }, []);

  const loadTypeContractCounts = useCallback(async () => {
    const { data } = await supabase.from("service_contracts").select("service_type");
    const counts: Record<string, number> = {};
    for (const d of (data ?? [])) {
      counts[d.service_type] = (counts[d.service_type] ?? 0) + 1;
    }
    setTypeContractCounts(counts);
  }, []);

  useEffect(() => {
    load();
    loadSuppliers();
    loadContractOptions();
    loadServiceTypes();
    loadApproverPool();
  }, [load, loadSuppliers, loadContractOptions, loadServiceTypes, loadApproverPool]);

  const openCreate = () => {
    setEditingId(null);
    setEditingApprovalStatus(null);
    setForm({ ...EMPTY_FORM });
    setContractSearch("");
    setSelectedRegions([]);
    setShowCustomInput(false);
    setNewTypeInput("");
    setDialogOpen(true);
  };

  const openEdit = (sc: ServiceContract) => {
    setEditingId(sc.id);
    setEditingApprovalStatus(sc.approval_status);
    const cur = sc.display_currency as DisplayCurrency;
    const raw = cur === "CLP"
      ? sc.amount_clp != null ? String(Math.round(sc.amount_clp)) : ""
      : String(sc.amount_uf);
    setForm({
      name: sc.name,
      supplier_id: sc.supplier_id,
      service_type: sc.service_type,
      status: sc.status,
      start_date: sc.start_date,
      end_date: sc.end_date ?? "",
      amount_raw: raw,
      display_currency: cur,
      frequency: sc.frequency,
      notice_days: sc.notice_days != null ? String(sc.notice_days) : "",
      auto_renewal: sc.auto_renewal,
      renewal_term_months: sc.renewal_term_months != null ? String(sc.renewal_term_months) : "",
      notes: sc.notes ?? "",
      selectedContractIds: sc.linked_contracts ?? [],
    });
    setContractSearch("");
    setSelectedRegions([]);
    setShowCustomInput(false);
    setNewTypeInput("");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.supplier_id || !form.service_type || !form.start_date || !form.amount_raw) {
      toast.error("Completa los campos obligatorios");
      return;
    }
    // Bloqueo duro: no se puede activar sin estar aprobado
    const approvedNow = editingId ? editingApprovalStatus === "aprobado" : false;
    if (form.status === "activo" && !approvedNow) {
      toast.error("No se puede poner en marcha (Activo) un contrato que no está aprobado.");
      return;
    }
    setSaving(true);

    const raw = parseFloat(form.amount_raw);
    let amount_uf: number;
    let amount_clp: number | null;

    if (form.display_currency === "CLP") {
      amount_clp = raw;
      amount_uf = ufValue > 0 ? convertPesosToUF(raw) : 0;
    } else {
      amount_uf = raw;
      amount_clp = ufValue > 0 ? convertUFToPesos(raw) : null;
    }

    const payload = {
      name: form.name.trim(),
      supplier_id: form.supplier_id,
      service_type: form.service_type,
      status: form.status,
      start_date: form.start_date,
      end_date: form.end_date || null,
      amount_uf,
      amount_clp,
      display_currency: form.display_currency,
      frequency: form.frequency,
      notice_days: form.notice_days ? parseInt(form.notice_days) : null,
      auto_renewal: form.auto_renewal,
      renewal_term_months: form.renewal_term_months ? parseInt(form.renewal_term_months) : null,
      notes: form.notes.trim() || null,
    };

    let serviceContractId = editingId;

    if (editingId) {
      const { error } = await supabase.from("service_contracts").update(payload).eq("id", editingId);
      if (error) { toast.error("Error al actualizar el contrato"); setSaving(false); return; }
    } else {
      const { data, error } = await supabase
        .from("service_contracts")
        .insert({ ...payload, created_by: user?.id ?? null })
        .select("id")
        .single();
      if (error || !data) { toast.error("Error al crear el contrato de servicio"); setSaving(false); return; }
      serviceContractId = data.id;
      // Solicitar aprobación: resuelve al aprobador (jefe directo designado) y deja "pendiente"
      if (user?.id) {
        await requestApproval(serviceContractId, user.id);
      }
    }

    if (serviceContractId) {
      await supabase.from("service_contract_contracts").delete().eq("service_contract_id", serviceContractId);
      if (form.selectedContractIds.length > 0) {
        await supabase.from("service_contract_contracts").insert(
          form.selectedContractIds.map(cid => ({ service_contract_id: serviceContractId!, contract_id: cid }))
        );
      }
    }

    toast.success(editingId ? "Contrato actualizado" : "Contrato creado — enviado a aprobación");
    setDialogOpen(false);
    load();
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("service_contracts").delete().eq("id", deleteId);
    if (error) toast.error("Error al eliminar");
    else { toast.success("Contrato eliminado"); load(); }
    setDeleteId(null);
  };

  const handleAddCustomType = async (nameOverride?: string) => {
    const name = (nameOverride ?? newTypeInput).trim();
    if (!name) return;
    setSavingType(true);
    const { error } = await supabase.from("service_contract_types").insert({ name });
    if (error && error.code !== "23505") {
      toast.error("Error al agregar tipo");
      setSavingType(false);
      return;
    }
    await loadServiceTypes();
    setForm(f => ({ ...f, service_type: name }));
    setShowCustomInput(false);
    setNewTypeInput("");
    setSavingType(false);
  };

  const handleRenameType = async () => {
    if (!editingType) return;
    const newName = editingType.value.trim();
    if (!newName || newName === editingType.original) { setEditingType(null); return; }
    const { error } = await supabase
      .from("service_contract_types")
      .update({ name: newName })
      .eq("name", editingType.original);
    if (error) { toast.error("Error al renombrar"); return; }
    await supabase.from("service_contracts").update({ service_type: newName }).eq("service_type", editingType.original);
    toast.success("Tipo actualizado");
    setEditingType(null);
    loadServiceTypes();
    load();
  };

  const handleDeleteType = async (name: string) => {
    const { error } = await supabase.from("service_contract_types").delete().eq("name", name);
    if (error) { toast.error("Error al eliminar"); return; }
    toast.success("Tipo eliminado");
    loadServiceTypes();
  };

  const handleAddTypeFromManager = async () => {
    const name = manageTypeInput.trim();
    if (!name) return;
    setSavingType(true);
    const { error } = await supabase.from("service_contract_types").insert({ name });
    if (error) {
      toast.error(error.code === "23505" ? "Ese tipo ya existe" : "Error al agregar");
    } else {
      toast.success("Tipo agregado");
      setManageTypeInput("");
      loadServiceTypes();
    }
    setSavingType(false);
  };

  const toggleContractId = (id: string) =>
    setForm(f => ({
      ...f,
      selectedContractIds: f.selectedContractIds.includes(id)
        ? f.selectedContractIds.filter(x => x !== id)
        : [...f.selectedContractIds, id],
    }));

  const openApproval = (sc: ServiceContract) => {
    const primaryAmt = sc.display_currency === "CLP"
      ? (sc.amount_clp != null ? formatCLP(sc.amount_clp) : formatCLP(convertUFToPesos(sc.amount_uf)))
      : formatUF(sc.amount_uf);
    setApprovalTarget({
      id: sc.id,
      name: sc.name,
      supplierName: sc.supplier?.name ?? null,
      serviceType: sc.service_type,
      amountLabel: `${primaryAmt} / ${FREQUENCY_LABELS[sc.frequency].toLowerCase()}`,
      periodLabel: `${formatDate(sc.start_date)}${sc.end_date ? ` — ${formatDate(sc.end_date)}` : ""}`,
      notes: sc.notes,
    });
    setApprovalOpen(true);
  };

  // Stats
  const activeContracts = contracts.filter(c => c.status === "activo");
  const expiringCount = contracts.filter(c => c.end_date && daysUntil(c.end_date) >= 0 && daysUntil(c.end_date) <= 60).length;
  const monthlyCLP = activeContracts.reduce((sum, c) => {
    const months = FREQUENCY_MONTHS[c.frequency];
    const clp = c.amount_clp != null ? c.amount_clp : convertUFToPesos(c.amount_uf);
    return sum + clp / months;
  }, 0);

  // Form equivalence preview
  const rawNum = parseFloat(form.amount_raw);
  const equivalence = !isNaN(rawNum) && rawNum > 0 && ufValue > 0
    ? form.display_currency === "CLP"
      ? `≈ ${formatUF(convertPesosToUF(rawNum))}`
      : `≈ ${formatCLP(convertUFToPesos(rawNum))}`
    : null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[1536px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
                  <Handshake className="h-6 w-6 text-violet-600" />
                  Contratos de Servicio
                </h1>
                <p className="text-sm text-muted-foreground">Contratos recurrentes con proveedores de servicios</p>
              </div>
            </div>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1.5" />
              Nuevo contrato de servicio
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1536px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card><CardContent className="p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Total</p>
            <p className="text-2xl font-bold tabular-nums">{contracts.length}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Activos</p>
            <p className="text-2xl font-bold text-emerald-600 tabular-nums">{activeContracts.length}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Vencen en 60 días</p>
            <p className={`text-2xl font-bold tabular-nums ${expiringCount > 0 ? "text-amber-600" : ""}`}>{expiringCount}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Gasto mensual</p>
            <p className="text-lg font-bold tabular-nums leading-tight">{formatCLP(monthlyCLP)}</p>
            {ufValue > 0 && (
              <p className="text-xs text-muted-foreground tabular-nums">{formatUF(monthlyCLP / ufValue)}</p>
            )}
          </CardContent></Card>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : contracts.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Handshake className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Sin contratos de servicio</p>
            <p className="text-sm mt-1">Crea el primero con el botón "Nuevo contrato de servicio"</p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-x-auto bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Servicio</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Término</TableHead>
                  <TableHead className="text-center">Locales</TableHead>
                  <TableHead>Creador</TableHead>
                  <TableHead>Aprobador</TableHead>
                  <TableHead>Aprobación</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.map(sc => {
                  const status = STATUS_MAP[sc.status];
                  const expiring = sc.end_date && daysUntil(sc.end_date) >= 0 && daysUntil(sc.end_date) <= 60;
                  const primaryAmt = sc.display_currency === "CLP"
                    ? (sc.amount_clp != null ? formatCLP(sc.amount_clp) : formatCLP(convertUFToPesos(sc.amount_uf)))
                    : formatUF(sc.amount_uf);
                  const secondaryAmt = sc.display_currency === "CLP"
                    ? formatUF(sc.amount_clp != null && ufValue > 0 ? sc.amount_clp / ufValue : sc.amount_uf)
                    : (ufValue > 0 ? formatCLP(sc.amount_uf * ufValue) : null);

                  const approval = APPROVAL_STATUS_MAP[sc.approval_status] ?? APPROVAL_STATUS_MAP.pendiente;
                  const actionable = canApprove(sc, { userId: user?.id ?? null, isAdmin, inPool: !!user && poolProfileIds.has(user.id) });

                  return (
                    <TableRow
                      key={sc.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/service-contracts/${sc.id}`)}
                    >
                      <TableCell className="font-medium">{sc.supplier?.name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{sc.service_type}</TableCell>
                      <TableCell>
                        <span className="tabular-nums text-sm font-medium">{primaryAmt}</span>
                        {secondaryAmt && (
                          <span className="block text-xs text-muted-foreground tabular-nums">{secondaryAmt}</span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          / {FREQUENCY_LABELS[sc.frequency].toLowerCase()}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {sc.end_date ? (
                          <span className={expiring ? "text-amber-600 font-medium" : ""}>
                            {formatDate(sc.end_date)}
                            {expiring && <AlertTriangle className="inline h-3 w-3 ml-1" />}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">Sin término</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground">
                        {sc.linked_contracts?.length ?? 0}
                      </TableCell>
                      <TableCell className="text-sm">
                        {sc.created_by_name ?? <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {sc.approver_name ?? <span className="text-muted-foreground text-xs">Sin resolver</span>}
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          disabled={!actionable}
                          onClick={() => actionable && openApproval(sc)}
                          title={actionable ? "Revisar y aprobar" : sc.approval_comment ?? undefined}
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${approval.className} ${
                            actionable ? "cursor-pointer ring-offset-1 hover:ring-2 hover:ring-current/30" : "cursor-default"
                          }`}
                        >
                          {approval.label}
                          {actionable && " ·"}
                        </button>
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${status.className}`}>
                          {status.label}
                        </span>
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/service-contracts/${sc.id}`)}>
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(sc)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(sc.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </main>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar contrato de servicio" : "Nuevo contrato de servicio"}</DialogTitle>
            <DialogDescription>
              Los campos con <span className="text-destructive">*</span> son obligatorios.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="sc-name">Nombre del contrato <span className="text-destructive">*</span></Label>
              <Input id="sc-name" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ej: Contrato de seguridad 2026" />
            </div>

            {/* Supplier */}
            <div className="space-y-1.5">
              <Label>Proveedor <span className="text-destructive">*</span></Label>
              {suppliers.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground border rounded-md p-3">
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                  No hay proveedores registrados.
                  <Button variant="link" size="sm" className="p-0 h-auto" onClick={() => navigate("/suppliers")}>
                    Crear proveedor <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              ) : (
                <Select value={form.supplier_id} onValueChange={v => setForm(f => ({ ...f, supplier_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar proveedor..." /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-muted-foreground">
                ¿No existe?{" "}
                <button className="text-primary underline" onClick={() => {
                  sessionStorage.setItem("returnTo", "/service-contracts");
                  navigate("/suppliers");
                }}>
                  Ir a Proveedores para crearlo
                </button>
              </p>
            </div>

            {/* Service type + status */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Tipo de servicio <span className="text-destructive">*</span></Label>
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => { loadTypeContractCounts(); setManageTypesOpen(true); }}
                  >
                    <Settings2 className="h-3 w-3" />
                    Editar lista
                  </button>
                </div>
                {showCustomInput ? (
                  <div className="flex gap-1.5">
                    <Input
                      autoFocus
                      value={newTypeInput}
                      onChange={e => setNewTypeInput(e.target.value)}
                      placeholder="Nombre del nuevo tipo..."
                      className="h-9 text-sm"
                      onKeyDown={e => {
                        if (e.key === "Enter") { e.preventDefault(); handleAddCustomType(); }
                        if (e.key === "Escape") { setShowCustomInput(false); setNewTypeInput(""); }
                      }}
                    />
                    <Button type="button" size="sm" className="h-9 px-3" onClick={() => handleAddCustomType()} disabled={savingType || !newTypeInput.trim()}>
                      {savingType ? "..." : "OK"}
                    </Button>
                    <Button type="button" size="icon" variant="ghost" className="h-9 w-9" onClick={() => { setShowCustomInput(false); setNewTypeInput(""); }}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Select value={form.service_type} onValueChange={v => {
                    if (v === "__otro__") { setShowCustomInput(true); setNewTypeInput(""); }
                    else setForm(f => ({ ...f, service_type: v }));
                  }}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar tipo..." /></SelectTrigger>
                    <SelectContent>
                      {serviceTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      <SelectItem value="__otro__" className="text-muted-foreground italic">Otro (agregar nuevo)...</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Estado</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as ServiceContractStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en_negociacion">En negociación</SelectItem>
                    <SelectItem value="activo" disabled={editingApprovalStatus !== "aprobado"}>
                      Activo{editingApprovalStatus !== "aprobado" ? " (requiere aprobación)" : ""}
                    </SelectItem>
                    <SelectItem value="vencido">Vencido</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
                {editingApprovalStatus !== "aprobado" && (
                  <p className="text-xs text-muted-foreground">
                    No se puede poner en marcha hasta que el contrato esté aprobado.
                  </p>
                )}
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="sc-start">Fecha inicio <span className="text-destructive">*</span></Label>
                <Input id="sc-start" type="date" value={form.start_date}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sc-end">Fecha término</Label>
                <Input id="sc-end" type="date" value={form.end_date}
                  onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
              </div>
            </div>

            {/* Amount + currency */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>
                  Monto {form.display_currency === "CLP" ? "(CLP)" : "(UF)"}
                  {" "}<span className="text-destructive">*</span>
                </Label>
                {/* Currency toggle */}
                <div className="flex rounded-md border overflow-hidden w-fit mb-1">
                  <button
                    type="button"
                    className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                      form.display_currency === "CLP"
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground hover:bg-muted"
                    }`}
                    onClick={() => setForm(f => ({ ...f, display_currency: "CLP" }))}
                  >
                    $ CLP
                  </button>
                  <button
                    type="button"
                    className={`px-4 py-1.5 text-sm font-medium border-l transition-colors ${
                      form.display_currency === "UF"
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground hover:bg-muted"
                    }`}
                    onClick={() => setForm(f => ({ ...f, display_currency: "UF" }))}
                  >
                    UF
                  </button>
                </div>
                <Input
                  type="number"
                  step={form.display_currency === "UF" ? "0.01" : "1"}
                  min="0"
                  value={form.amount_raw}
                  onChange={e => setForm(f => ({ ...f, amount_raw: e.target.value }))}
                  placeholder={form.display_currency === "UF" ? "0.00" : "0"}
                />
                {equivalence && (
                  <p className="text-xs text-muted-foreground">{equivalence}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Frecuencia de pago</Label>
                <Select value={form.frequency} onValueChange={v => setForm(f => ({ ...f, frequency: v as ServiceContractFrequency }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(FREQUENCY_LABELS) as [ServiceContractFrequency, string][]).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Notice days + Auto renewal */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="sc-notice">Días de aviso para término</Label>
                <Input id="sc-notice" type="number" min="0" value={form.notice_days}
                  onChange={e => setForm(f => ({ ...f, notice_days: e.target.value }))} placeholder="30" />
              </div>
              <div className="space-y-1.5">
                <Label>Renovación automática</Label>
                <div className="flex items-center gap-3 h-10">
                  <Switch checked={form.auto_renewal}
                    onCheckedChange={v => setForm(f => ({ ...f, auto_renewal: v }))} />
                  <span className="text-sm text-muted-foreground">
                    {form.auto_renewal ? "Sí" : "No"}
                  </span>
                </div>
              </div>
            </div>

            {/* Associated contracts */}
            {contractOptions.length > 0 && (() => {
              // Available regions across all options (from separate query)
              const availableRegions = [...new Set(
                contractOptions.map(co => contractRegionMap[co.id]).filter(Boolean)
              )].sort() as string[];

              // Apply filters: region(s) + text search
              const filtered = contractOptions.filter(co => {
                const region = contractRegionMap[co.id];
                const matchesRegion = selectedRegions.length === 0 || (!!region && selectedRegions.includes(region));
                const matchesSearch = co.name.toLowerCase().includes(contractSearch.toLowerCase());
                return matchesRegion && matchesSearch;
              });

              const filteredIds = filtered.map(co => co.id);
              const anyFilteredSelected = filteredIds.some(id => form.selectedContractIds.includes(id));

              const toggleAll = () => {
                if (anyFilteredSelected) {
                  // Deselect everything visible
                  setForm(f => ({ ...f, selectedContractIds: f.selectedContractIds.filter(id => !filteredIds.includes(id)) }));
                } else {
                  // Select everything visible, preserve others
                  setForm(f => ({ ...f, selectedContractIds: [...new Set([...f.selectedContractIds, ...filteredIds])] }));
                }
              };

              const toggleRegion = (region: string) =>
                setSelectedRegions(prev =>
                  prev.includes(region) ? prev.filter(r => r !== region) : [...prev, region]
                );

              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Contratos de locales asociados</Label>
                    {form.selectedContractIds.length > 0 && (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {form.selectedContractIds.length} seleccionado{form.selectedContractIds.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Selecciona los locales donde aplica este servicio. Podés combinar filtros de región con búsqueda manual.
                  </p>

                  {/* Region filter chips */}
                  {availableRegions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {availableRegions.map(region => (
                        <button
                          key={region}
                          type="button"
                          onClick={() => toggleRegion(region)}
                          className={`px-2.5 py-1 text-xs rounded-full border font-medium transition-colors ${
                            selectedRegions.includes(region)
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background text-muted-foreground border-border hover:border-primary/60 hover:text-foreground"
                          }`}
                        >
                          {region}
                        </button>
                      ))}
                      {selectedRegions.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedRegions([])}
                          className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground underline"
                        >
                          Limpiar regiones
                        </button>
                      )}
                    </div>
                  )}

                  {/* Search + select-all/none row */}
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                      <input
                        type="text"
                        value={contractSearch}
                        onChange={e => setContractSearch(e.target.value)}
                        placeholder="Buscar local por nombre..."
                        className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 text-xs"
                      onClick={toggleAll}
                      disabled={filteredIds.length === 0}
                    >
                      {anyFilteredSelected ? "Anular selección" : "Seleccionar todos"}
                    </Button>
                  </div>

                  {/* List */}
                  <ScrollArea className="h-48 border rounded-md p-3">
                    {filtered.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">Sin resultados</p>
                    ) : (
                      <div className="space-y-2">
                        {filtered.map(co => {
                          const companyNames = getCompanyNames(co.contract_companies);
                          const region = contractRegionMap[co.id];
                          return (
                            <div key={co.id} className="flex items-center gap-2.5">
                              <Checkbox
                                id={`sc-contract-${co.id}`}
                                checked={form.selectedContractIds.includes(co.id)}
                                onCheckedChange={() => toggleContractId(co.id)}
                              />
                              <CompanyLogo companyNames={companyNames} size="sm" />
                              <label
                                htmlFor={`sc-contract-${co.id}`}
                                className="text-sm cursor-pointer leading-none flex-1 min-w-0"
                              >
                                <span className="block truncate">{co.name}</span>
                                {region && (
                                  <span className="text-xs text-muted-foreground">{region}</span>
                                )}
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                </div>
              );
            })()}

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="sc-notes">Notas</Label>
              <Textarea id="sc-notes" value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Condiciones especiales, cláusulas de interés..." rows={3} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Crear contrato"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage service types */}
      <Dialog open={manageTypesOpen} onOpenChange={open => { setManageTypesOpen(open); if (!open) { setEditingType(null); setManageTypeInput(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gestionar tipos de servicio</DialogTitle>
            <DialogDescription>
              Los tipos en uso no se pueden eliminar. Al renombrar, los contratos existentes se actualizan automáticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <ScrollArea className="h-64 border rounded-md">
              <div className="p-2 space-y-0.5">
                {serviceTypes.map(type => {
                  const count = typeContractCounts[type] ?? 0;
                  const inUse = count > 0;
                  return (
                    <div key={type} className="flex items-center gap-1.5 group rounded px-2 py-1.5 hover:bg-muted/50">
                      {editingType?.original === type ? (
                        <>
                          <Input
                            autoFocus
                            className="h-7 text-sm flex-1"
                            value={editingType.value}
                            onChange={e => setEditingType(prev => prev ? { ...prev, value: e.target.value } : null)}
                            onKeyDown={e => { if (e.key === "Enter") handleRenameType(); if (e.key === "Escape") setEditingType(null); }}
                          />
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600 shrink-0" onClick={handleRenameType}>
                            <span className="text-sm">✓</span>
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setEditingType(null)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 text-sm truncate">{type}</span>
                          {inUse && (
                            <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                              {count} contrato{count !== 1 ? "s" : ""}
                            </span>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100 shrink-0 transition-opacity"
                            onClick={() => setEditingType({ original: type, value: type })}
                            title="Renombrar"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className={`h-7 w-7 opacity-0 group-hover:opacity-100 shrink-0 transition-opacity ${
                              inUse ? "text-muted-foreground/50 cursor-not-allowed" : "text-destructive"
                            }`}
                            disabled={inUse}
                            title={inUse ? `En uso por ${count} contrato${count !== 1 ? "s" : ""}` : "Eliminar"}
                            onClick={() => { if (!inUse) handleDeleteType(type); }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
            <div className="flex gap-2">
              <Input
                placeholder="Agregar nuevo tipo..."
                value={manageTypeInput}
                onChange={e => setManageTypeInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddTypeFromManager(); } }}
                className="h-9 text-sm"
              />
              <Button type="button" size="sm" className="h-9 shrink-0" onClick={handleAddTypeFromManager} disabled={savingType || !manageTypeInput.trim()}>
                <Plus className="h-4 w-4 mr-1" />
                Agregar
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManageTypesOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar contrato de servicio?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminarán también las asociaciones con locales.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Approval action */}
      <ApprovalActionDialog
        contract={approvalTarget}
        actorId={user?.id ?? null}
        open={approvalOpen}
        onOpenChange={setApprovalOpen}
        onDone={() => { load(); loadApproverPool(); }}
      />
    </div>
  );
}
