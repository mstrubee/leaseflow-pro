import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, Link, Info, ArrowRight, ExternalLink, Truck, FileText, Clock, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveFileUrl } from "@/lib/storageUtils";
import { toast } from "@/hooks/use-toast";
import { MaintenanceForm } from "./types";
import { ResolutionDialog } from "./ResolutionDialog";
import { useMaintenanceSubStatuses } from "@/hooks/useMaintenanceSubStatuses";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface HistoryEntry {
  sub_status: string;
  changed_at: string;
  user_name: string | null;
}

interface Props {
  form: MaintenanceForm | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function MaintenanceEditDialog({ form, open, onOpenChange, onSuccess }: Props) {
  const navigate = useNavigate();
  const { subStatuses, subStatusLabels, subStatusInfo, subStatusOrder, getNextSubStatus } = useMaintenanceSubStatuses();
  const [saving, setSaving] = useState(false);
  const [resolutionOpen, setResolutionOpen] = useState(false);
  const [pendingAdvance, setPendingAdvance] = useState(false);
  const [formData, setFormData] = useState({
    form_number: "",
    status: "proceso",
    sub_status: "solicitado",
    created_date: "",
    contract_name: "",
    general_description: "",
    electrical_description: "",
    civil_description: "",
    hvac_description: "",
    fixed_assets_description: "",
    additional_comments: "",
    resolution_observations: "",
  });
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (form) {
      setFormData({
        form_number: form.form_number || "",
        status: form.status || "proceso",
        sub_status: form.sub_status || "solicitado",
        created_date: form.created_date || "",
        contract_name: form.contract_name || "",
        general_description: form.general_description || "",
        electrical_description: form.electrical_description || "",
        civil_description: form.civil_description || "",
        hvac_description: form.hvac_description || "",
        fixed_assets_description: form.fixed_assets_description || "",
        additional_comments: form.additional_comments || "",
        resolution_observations: form.resolution_observations || "",
      });
    }
  }, [form]);

  // Fetch real history from maintenance_status_history + profiles
  useEffect(() => {
    if (!form || !open) { setHistory([]); return; }
    let cancelled = false;
    const fetchHistory = async () => {
      setHistoryLoading(true);
      try {
        const { data: rows, error } = await (supabase as any)
          .from("maintenance_status_history")
          .select("new_value, changed_at, changed_by")
          .eq("form_id", form.id)
          .eq("field_changed", "sub_status")
          .order("changed_at", { ascending: true });

        if (error) throw error;

        // Get unique user ids
        const userIds = [...new Set((rows || []).map((r: any) => r.changed_by).filter(Boolean))] as string[];
        let profileMap: Record<string, string> = {};
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, full_name, email")
            .in("id", userIds);
          (profiles || []).forEach((p: any) => {
            profileMap[p.id] = p.full_name || p.email || "—";
          });
        }

        if (cancelled) return;

        // Build entries: start with "Solicitado" using form created_at
        const entries: HistoryEntry[] = [
          {
            sub_status: "solicitado",
            changed_at: (form as any).created_at || form.created_date || "",
            user_name: null,
          },
        ];

        (rows || []).forEach((r: any) => {
          if ((r.new_value || "").toLowerCase() === "solicitado") return; // skip duplicate solicitado
          entries.push({
            sub_status: r.new_value || "",
            changed_at: r.changed_at || "",
            user_name: r.changed_by ? (profileMap[r.changed_by] || "—") : null,
          });
        });

        setHistory(entries);
      } catch (err) {
        console.error("Error fetching status history", err);
      } finally {
        setHistoryLoading(false);
      }
    };
    fetchHistory();
    return () => { cancelled = true; };
  }, [form?.id, open]);

  const firstSubStatus = subStatusOrder[0] || "solicitado";

  const doSave = async (advance: boolean, resolutionObservations?: string | null) => {
    if (!form) return;

    // Block manual sub-status change if currently "solicitado"
    if (form.sub_status === "solicitado" && formData.sub_status !== "solicitado") {
      toast({ title: "Debe asignar criticidad primero", description: "El sub-estado 'Solicitado' solo cambia al asignar una clasificación de criticidad.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const newSubStatus = advance ? getNextSubStatus(formData.sub_status) : formData.sub_status;
      if (advance && !newSubStatus) {
        toast({ title: "Ya está en el último sub-estado", variant: "destructive" });
        setSaving(false);
        return;
      }

      const finalSubStatus = newSubStatus || formData.sub_status;

      // Intercept "resuelto" to open resolution dialog (unless already coming from dialog)
      if (finalSubStatus === "resuelto" && resolutionObservations === undefined) {
        setPendingAdvance(advance);
        setResolutionOpen(true);
        setSaving(false);
        return;
      }

      // Auto-set status: "solucionado" when "resuelto", otherwise "proceso"
      let finalStatus: string;
      if (finalSubStatus === "resuelto") {
        finalStatus = "solucionado";
      } else if (finalSubStatus === "solicitado") {
        finalStatus = formData.status;
      } else {
        finalStatus = "proceso";
      }

      const updatePayload: any = {
        status: finalStatus,
        sub_status: finalSubStatus,
        additional_comments: formData.additional_comments || null,
        resolution_observations: resolutionObservations !== undefined ? resolutionObservations : (formData.resolution_observations || null),
        updated_at: new Date().toISOString(),
        ...(finalSubStatus === "resuelto" ? { sub_status_resuelto_at: new Date().toISOString() } : {}),
      };

      const { error } = await (supabase.from("maintenance_forms" as any) as any)
        .update(updatePayload)
        .eq("id", form.id);

      if (error) throw error;
      toast({ title: advance ? `Avanzado a ${subStatusLabels[finalSubStatus] || finalSubStatus}` : "FORM actualizado correctamente" });
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      console.error(err);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleResolutionResolve = (observations: string | null) => {
    setResolutionOpen(false);
    doSave(pendingAdvance, observations);
  };

  const set = (key: string, val: string) => setFormData(p => ({ ...p, [key]: val }));

  const nextStatus = getNextSubStatus(formData.sub_status);

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar FORM {form?.form_number}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>N° FORM</Label>
            <Input value={formData.form_number} readOnly className="bg-muted" />
          </div>
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Input
              value={formData.status === "solucionado" ? "Solucionado" : "En Proceso"}
              readOnly
              className="bg-muted"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label>Sub Estado</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-5 w-5 rounded-full">
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-3" side="right">
                  <p className="font-semibold text-sm mb-2">Sub Estados del FORM</p>
                  <div className="space-y-2">
                    {subStatuses.map(s => (
                      <div key={s.name} className="text-xs">
                        <span className="font-medium">{s.label}</span>
                        {s.responsible && <span className="text-muted-foreground ml-1">({s.responsible})</span>}
                        {s.description && <p className="text-muted-foreground mt-0.5">{s.description}</p>}
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <Select
              value={formData.sub_status}
              onValueChange={v => set("sub_status", v)}
              disabled={form?.sub_status === "solicitado"}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {subStatuses
                  .filter(s => form?.sub_status === "solicitado" ? true : s.name.toLowerCase() !== "solicitado")
                  .map(s => (
                    <SelectItem key={s.name} value={s.name}>{s.label}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Fecha de Creación</Label>
            <Input type="date" value={formData.created_date} readOnly className="bg-muted" />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label>Contrato</Label>
            <Input value={formData.contract_name} readOnly className="bg-muted" />
          </div>

          {/* Proveedor y OC asignados */}
          <div className="space-y-1.5">
            <Label>Proveedor</Label>
            {form?.supplier_name ? (
              <Button
                variant="outline"
                className="w-full justify-start gap-2 font-normal"
                onClick={() => navigate("/suppliers")}
              >
                <Truck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{form.supplier_name}</span>
                <ExternalLink className="h-3 w-3 ml-auto shrink-0 text-muted-foreground" />
              </Button>
            ) : (
              <Input value="Sin asignar" readOnly className="bg-muted text-muted-foreground" />
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Orden de Compra</Label>
            {form?.purchase_order_number ? (
              <Button
                variant="outline"
                className="w-full justify-start gap-2 font-normal"
                onClick={() => navigate(`/purchase-orders?search=${encodeURIComponent(form.purchase_order_number!)}`)}
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{form.purchase_order_number}</span>
                <ExternalLink className="h-3 w-3 ml-auto shrink-0 text-muted-foreground" />
              </Button>
            ) : (
              <Input value="Sin asignar" readOnly className="bg-muted text-muted-foreground" />
            )}
          </div>
        </div>

        <div className="space-y-3 mt-2">
          {formData.general_description && (
            <div className="space-y-1.5">
              <Label>Descripción General</Label>
              <Textarea value={formData.general_description} readOnly className="bg-muted resize-none" rows={2} />
            </div>
          )}
          {formData.electrical_description && (
            <div className="space-y-1.5">
              <Label>Requerimiento Eléctrico</Label>
              <Textarea value={formData.electrical_description} readOnly className="bg-muted resize-none" rows={2} />
            </div>
          )}
          {formData.civil_description && (
            <div className="space-y-1.5">
              <Label>Requerimiento Obra Civil</Label>
              <Textarea value={formData.civil_description} readOnly className="bg-muted resize-none" rows={2} />
            </div>
          )}
          {formData.hvac_description && (
            <div className="space-y-1.5">
              <Label>Requerimiento Climatización</Label>
              <Textarea value={formData.hvac_description} readOnly className="bg-muted resize-none" rows={2} />
            </div>
          )}
          {formData.fixed_assets_description && (
            <div className="space-y-1.5">
              <Label>Requerimiento Activos Fijos</Label>
              <Textarea value={formData.fixed_assets_description} readOnly className="bg-muted resize-none" rows={2} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Comentarios Técnicos (Jefe Mantenciones)</Label>
            <Textarea value={formData.additional_comments} onChange={e => set("additional_comments", e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>Resuelto con Observaciones - Control de Gestión</Label>
            <Textarea value={formData.resolution_observations} onChange={e => set("resolution_observations", e.target.value)} rows={2} placeholder="Observaciones de Control de Gestión..." />
          </div>

          {form?.evidence_links && form.evidence_links.length > 0 && (
            <div className="space-y-1.5">
              <Label>Evidencias</Label>
              <div className="flex flex-col gap-1 p-3 rounded-md border bg-muted">
                {form.evidence_links.map((link, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={async () => {
                      const url = await resolveFileUrl(link);
                      if (url) window.open(url, "_blank", "noopener,noreferrer");
                    }}
                    className="text-sm text-primary hover:underline flex items-center gap-1.5 text-left"
                  >
                    <Link className="h-3.5 w-3.5 shrink-0" />
                    Evidencia {idx + 1}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Timeline de sub-estados - historial real */}
        {form && (
          <div className="space-y-2 border-t pt-3 mt-2">
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-semibold">Historial de Sub Estados</Label>
            </div>
            {historyLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando historial…
              </div>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin registros de historial.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {history.map((entry, idx) => {
                  const label = subStatusLabels[entry.sub_status.toLowerCase()] || entry.sub_status;
                  const dateStr = entry.changed_at
                    ? format(new Date(entry.changed_at), "dd MMM yyyy HH:mm", { locale: es })
                    : "—";
                  return (
                    <div key={idx} className="rounded-md border bg-primary/5 border-primary/20 p-2.5 text-xs space-y-1">
                      <p className="font-semibold text-sm">{label}</p>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3 w-3 shrink-0" />
                        <span>Fecha: {dateStr}</span>
                      </div>
                      {entry.user_name && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <User className="h-3 w-3 shrink-0" />
                          <span>Clasificador: {entry.user_name}</span>
                        </div>
                      )}
                      {entry.user_name && (
                        <div className="text-muted-foreground">
                          Fecha Clasificación: {dateStr}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="secondary" onClick={() => doSave(false)} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Guardando...</> : "Guardar"}
          </Button>
          {nextStatus && (
            <Button onClick={() => doSave(true)} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Guardar y Avanzar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <ResolutionDialog
      open={resolutionOpen}
      onOpenChange={v => { if (!v) setResolutionOpen(false); }}
      existingObservations={formData.resolution_observations || null}
      onResolve={handleResolutionResolve}
      formId={form?.id || null}
      formNumber={form?.form_number || ""}
      onOTUploaded={onSuccess}
    />
    </>
  );
}
