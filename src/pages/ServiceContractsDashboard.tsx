import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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
import {
  ArrowLeft, Plus, Pencil, Trash2, ExternalLink, Handshake, AlertTriangle,
} from "lucide-react";

type ServiceContractStatus = "en_negociacion" | "activo" | "vencido" | "cancelado";
type ServiceContractFrequency = "mensual" | "trimestral" | "semestral" | "anual" | "otro";

interface ServiceContract {
  id: string;
  name: string;
  supplier_id: string;
  service_type: string;
  status: ServiceContractStatus;
  start_date: string;
  end_date: string | null;
  amount_uf: number;
  frequency: ServiceContractFrequency;
  notice_days: number | null;
  auto_renewal: boolean;
  renewal_term_months: number | null;
  notes: string | null;
  created_at: string;
  supplier?: { id: string; name: string } | null;
  linked_contracts?: string[];
}

interface Supplier { id: string; name: string }
interface ContractOption { id: string; name: string }

const SERVICE_TYPES = [
  "Aseo y limpieza",
  "Seguridad y vigilancia",
  "Transporte de valores",
  "Mantención de equipos",
  "Soporte tecnológico (IT)",
  "Jardinería y paisajismo",
  "Gestión de residuos",
  "Control de plagas",
  "Catering y alimentación",
  "Consultoría",
  "Auditoría",
  "Seguros",
  "Otro",
];

const FREQUENCY_LABELS: Record<ServiceContractFrequency, string> = {
  mensual: "Mensual",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
  otro: "Otro",
};

const STATUS_MAP: Record<ServiceContractStatus, { label: string; className: string }> = {
  en_negociacion: { label: "En negociación", className: "bg-blue-100 text-blue-700" },
  activo: { label: "Activo", className: "bg-emerald-100 text-emerald-700" },
  vencido: { label: "Vencido", className: "bg-red-100 text-red-700" },
  cancelado: { label: "Cancelado", className: "bg-gray-100 text-gray-600" },
};

const EMPTY_FORM = {
  name: "",
  supplier_id: "",
  service_type: "",
  status: "en_negociacion" as ServiceContractStatus,
  start_date: "",
  end_date: "",
  amount_uf: "",
  frequency: "mensual" as ServiceContractFrequency,
  notice_days: "",
  auto_renewal: false,
  renewal_term_months: "",
  notes: "",
  selectedContractIds: [] as string[],
};

function formatDate(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("es-CL", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function daysUntil(dateStr: string) {
  return (new Date(dateStr + "T12:00:00").getTime() - Date.now()) / (1000 * 60 * 60 * 24);
}

export default function ServiceContractsDashboard() {
  const navigate = useNavigate();
  const [contracts, setContracts] = useState<ServiceContract[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [contractOptions, setContractOptions] = useState<ContractOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("service_contracts")
      .select(`
        *,
        supplier:suppliers(id, name),
        service_contract_contracts(contract_id)
      `)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Error al cargar contratos de servicio");
    } else {
      setContracts(
        (data ?? []).map((d: any) => ({
          ...d,
          supplier: d.supplier ?? null,
          linked_contracts: (d.service_contract_contracts ?? []).map((c: any) => c.contract_id),
        }))
      );
    }
    setLoading(false);
  }, []);

  const loadSuppliers = useCallback(async () => {
    const { data } = await supabase
      .from("suppliers")
      .select("id, name")
      .order("name");
    setSuppliers(data ?? []);
  }, []);

  const loadContractOptions = useCallback(async () => {
    const { data } = await supabase
      .from("contracts")
      .select("id, name")
      .eq("status", "firmado")
      .is("deleted_at", null)
      .order("name");
    setContractOptions(data ?? []);
  }, []);

  useEffect(() => {
    load();
    loadSuppliers();
    loadContractOptions();
  }, [load, loadSuppliers, loadContractOptions]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  };

  const openEdit = (sc: ServiceContract) => {
    setEditingId(sc.id);
    setForm({
      name: sc.name,
      supplier_id: sc.supplier_id,
      service_type: sc.service_type,
      status: sc.status,
      start_date: sc.start_date,
      end_date: sc.end_date ?? "",
      amount_uf: String(sc.amount_uf),
      frequency: sc.frequency,
      notice_days: sc.notice_days != null ? String(sc.notice_days) : "",
      auto_renewal: sc.auto_renewal,
      renewal_term_months: sc.renewal_term_months != null ? String(sc.renewal_term_months) : "",
      notes: sc.notes ?? "",
      selectedContractIds: sc.linked_contracts ?? [],
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.supplier_id || !form.service_type || !form.start_date || !form.amount_uf) {
      toast.error("Completa los campos obligatorios");
      return;
    }
    setSaving(true);

    const payload = {
      name: form.name.trim(),
      supplier_id: form.supplier_id,
      service_type: form.service_type,
      status: form.status,
      start_date: form.start_date,
      end_date: form.end_date || null,
      amount_uf: parseFloat(form.amount_uf),
      frequency: form.frequency,
      notice_days: form.notice_days ? parseInt(form.notice_days) : null,
      auto_renewal: form.auto_renewal,
      renewal_term_months: form.renewal_term_months ? parseInt(form.renewal_term_months) : null,
      notes: form.notes.trim() || null,
    };

    let serviceContractId = editingId;

    if (editingId) {
      const { error } = await supabase
        .from("service_contracts")
        .update(payload)
        .eq("id", editingId);
      if (error) {
        toast.error("Error al actualizar el contrato");
        setSaving(false);
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("service_contracts")
        .insert(payload)
        .select("id")
        .single();
      if (error || !data) {
        toast.error("Error al crear el contrato de servicio");
        setSaving(false);
        return;
      }
      serviceContractId = data.id;
    }

    if (serviceContractId) {
      await supabase
        .from("service_contract_contracts")
        .delete()
        .eq("service_contract_id", serviceContractId);

      if (form.selectedContractIds.length > 0) {
        await supabase.from("service_contract_contracts").insert(
          form.selectedContractIds.map(cid => ({
            service_contract_id: serviceContractId!,
            contract_id: cid,
          }))
        );
      }
    }

    toast.success(editingId ? "Contrato actualizado" : "Contrato de servicio creado");
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

  const toggleContractId = (id: string) => {
    setForm(f => ({
      ...f,
      selectedContractIds: f.selectedContractIds.includes(id)
        ? f.selectedContractIds.filter(x => x !== id)
        : [...f.selectedContractIds, id],
    }));
  };

  const activeCount = contracts.filter(c => c.status === "activo").length;
  const expiringCount = contracts.filter(c => c.end_date && daysUntil(c.end_date) >= 0 && daysUntil(c.end_date) <= 60).length;
  const monthlyUF = contracts
    .filter(c => c.status === "activo")
    .reduce((sum, c) => {
      const factor: Record<ServiceContractFrequency, number> = {
        mensual: 1, trimestral: 1 / 3, semestral: 1 / 6, anual: 1 / 12, otro: 1,
      };
      return sum + c.amount_uf * factor[c.frequency];
    }, 0);

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
                <p className="text-sm text-muted-foreground">
                  Contratos recurrentes con proveedores de servicios
                </p>
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Total</p>
              <p className="text-2xl font-bold tabular-nums">{contracts.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Activos</p>
              <p className="text-2xl font-bold text-emerald-600 tabular-nums">{activeCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Vencen en 60 días</p>
              <p className={`text-2xl font-bold tabular-nums ${expiringCount > 0 ? "text-amber-600" : ""}`}>
                {expiringCount}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Gasto mensual</p>
              <p className="text-2xl font-bold tabular-nums">
                UF {monthlyUF.toFixed(1)}
              </p>
            </CardContent>
          </Card>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : contracts.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Handshake className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Sin contratos de servicio</p>
            <p className="text-sm mt-1">
              Crea el primero con el botón "Nuevo contrato de servicio"
            </p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Servicio</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Inicio</TableHead>
                  <TableHead>Término</TableHead>
                  <TableHead className="text-center">Locales</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.map(sc => {
                  const status = STATUS_MAP[sc.status];
                  const expiring = sc.end_date && daysUntil(sc.end_date) >= 0 && daysUntil(sc.end_date) <= 60;
                  return (
                    <TableRow key={sc.id}>
                      <TableCell className="font-medium">{sc.supplier?.name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{sc.service_type}</TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap text-sm">
                        UF {sc.amount_uf.toFixed(2)}
                        <span className="text-xs text-muted-foreground ml-1">
                          / {FREQUENCY_LABELS[sc.frequency].toLowerCase()}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(sc.start_date)}</TableCell>
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
                      <TableCell>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${status.className}`}>
                          {status.label}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(sc)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                            onClick={() => setDeleteId(sc.id)}
                          >
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
            <DialogTitle>
              {editingId ? "Editar contrato de servicio" : "Nuevo contrato de servicio"}
            </DialogTitle>
            <DialogDescription>
              Los campos marcados con <span className="text-destructive">*</span> son obligatorios.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="sc-name">
                Nombre del contrato <span className="text-destructive">*</span>
              </Label>
              <Input
                id="sc-name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ej: Contrato de seguridad 2026"
              />
            </div>

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
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar proveedor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-muted-foreground">
                ¿No existe el proveedor?{" "}
                <button
                  className="text-primary underline"
                  onClick={() => {
                    sessionStorage.setItem("returnTo", "/service-contracts");
                    navigate("/suppliers");
                  }}
                >
                  Ir a Proveedores para crearlo
                </button>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Tipo de servicio <span className="text-destructive">*</span></Label>
                <Select value={form.service_type} onValueChange={v => setForm(f => ({ ...f, service_type: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar tipo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Estado</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as ServiceContractStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en_negociacion">En negociación</SelectItem>
                    <SelectItem value="activo">Activo</SelectItem>
                    <SelectItem value="vencido">Vencido</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="sc-amount">Monto (UF) <span className="text-destructive">*</span></Label>
                <Input id="sc-amount" type="number" step="0.01" min="0" value={form.amount_uf}
                  onChange={e => setForm(f => ({ ...f, amount_uf: e.target.value }))} placeholder="0.00" />
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="sc-notice">Días de aviso para término</Label>
                <Input id="sc-notice" type="number" min="0" value={form.notice_days}
                  onChange={e => setForm(f => ({ ...f, notice_days: e.target.value }))} placeholder="30" />
              </div>
              <div className="space-y-1.5">
                <Label>Renovación automática</Label>
                <div className="flex items-center gap-3 h-10">
                  <Switch
                    checked={form.auto_renewal}
                    onCheckedChange={v => setForm(f => ({ ...f, auto_renewal: v }))}
                  />
                  <span className="text-sm text-muted-foreground">
                    {form.auto_renewal ? "Sí" : "No"}
                  </span>
                </div>
              </div>
            </div>

            {contractOptions.length > 0 && (
              <div className="space-y-1.5">
                <Label>Contratos de locales asociados</Label>
                <p className="text-xs text-muted-foreground">
                  Selecciona los locales donde aplica este servicio. Omite si es corporativo.
                </p>
                <ScrollArea className="h-40 border rounded-md p-3">
                  <div className="space-y-2">
                    {contractOptions.map(co => (
                      <div key={co.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`sc-contract-${co.id}`}
                          checked={form.selectedContractIds.includes(co.id)}
                          onCheckedChange={() => toggleContractId(co.id)}
                        />
                        <label htmlFor={`sc-contract-${co.id}`} className="text-sm cursor-pointer leading-none">
                          {co.name}
                        </label>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="sc-notes">Notas</Label>
              <Textarea
                id="sc-notes"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Condiciones especiales, cláusulas de interés..."
                rows={3}
              />
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
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
