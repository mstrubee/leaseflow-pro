import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Bell, BellOff, Trash2, Wand2, CheckCircle2 } from "lucide-react";

interface ServiceContractAlertsProps {
  serviceContractId: string;
  serviceContractName: string;
  endDate: string | null;
  noticeDays: number | null;
}

interface AlertRow {
  id: string;
  title: string;
  due_date: string;
  message: string | null;
  is_active: boolean;
  completed_at: string | null;
  days_before: number[];
}

function formatDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("es-CL", {
    day: "2-digit", month: "long", year: "numeric",
  });
}

function daysUntil(d: string) {
  return Math.ceil((new Date(d + "T12:00:00").getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

const EMPTY_FORM = {
  title: "",
  due_date: "",
  message: "",
};

export function ServiceContractAlertsSection({
  serviceContractId,
  serviceContractName,
  endDate,
  noticeDays,
}: ServiceContractAlertsProps) {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("alerts")
      .select("id, title, due_date, message, is_active, completed_at, days_before")
      .eq("service_contract_id", serviceContractId)
      .is("deleted_at", null)
      .order("due_date", { ascending: true });
    setAlerts((data as AlertRow[]) ?? []);
    setLoading(false);
  }, [serviceContractId]);

  useEffect(() => { load(); }, [load]);

  const openCreate = (prefill?: Partial<typeof EMPTY_FORM>) => {
    setForm({ ...EMPTY_FORM, ...prefill });
    setDialogOpen(true);
  };

  const autoCreate = () => {
    if (!endDate) {
      toast.error("Este contrato no tiene fecha de término definida");
      return;
    }
    const alertDate = noticeDays
      ? new Date(new Date(endDate + "T12:00:00").getTime() - noticeDays * 86400000)
          .toISOString().split("T")[0]
      : endDate;
    openCreate({
      title: `Vencimiento: ${serviceContractName}`,
      due_date: alertDate,
      message: `El contrato de servicio "${serviceContractName}" vence el ${formatDate(endDate)}.${noticeDays ? ` Quedan ${noticeDays} días de aviso.` : ""}`,
    });
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.due_date) {
      toast.error("Título y fecha de vencimiento son obligatorios");
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("alerts").insert({
      service_contract_id: serviceContractId,
      title: form.title.trim(),
      due_date: form.due_date,
      message: form.message.trim() || null,
      is_active: true,
      days_before: [0],
      created_by: user?.id,
    });
    if (error) {
      toast.error("Error al crear la alerta");
    } else {
      toast.success("Alerta creada");
      setDialogOpen(false);
      load();
    }
    setSaving(false);
  };

  const handleToggle = async (alert: AlertRow) => {
    const { error } = await supabase
      .from("alerts")
      .update({ is_active: !alert.is_active })
      .eq("id", alert.id);
    if (error) toast.error("Error al actualizar");
    else load();
  };

  const handleComplete = async (id: string) => {
    const { error } = await supabase
      .from("alerts")
      .update({ completed_at: new Date().toISOString(), is_active: false })
      .eq("id", id);
    if (error) toast.error("Error al completar");
    else { toast.success("Alerta completada"); load(); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase
      .from("alerts")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", deleteId);
    if (error) toast.error("Error al eliminar");
    else { toast.success("Alerta eliminada"); load(); }
    setDeleteId(null);
  };

  const activeAlerts = alerts.filter(a => a.is_active && !a.completed_at);
  const doneAlerts   = alerts.filter(a => !a.is_active || a.completed_at);

  return (
    <div className="space-y-4">
      {/* Actions bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={() => openCreate()}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Nueva alerta
        </Button>
        {endDate && (
          <Button size="sm" variant="outline" onClick={autoCreate}>
            <Wand2 className="h-3.5 w-3.5 mr-1" />
            Crear alerta de vencimiento
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </div>
      ) : alerts.length === 0 ? (
        <div className="border rounded-lg p-10 text-center text-muted-foreground">
          <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="font-medium">Sin alertas</p>
          <p className="text-sm mt-1">
            {endDate
              ? `Usa "Crear alerta de vencimiento" para generar una alerta automática basada en la fecha de término.`
              : "Crea una alerta manual con el botón de arriba."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Active alerts */}
          {activeAlerts.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Activas</p>
              <div className="space-y-2">
                {activeAlerts.map(a => {
                  const days = daysUntil(a.due_date);
                  const isOverdue = days < 0;
                  const isSoon = days >= 0 && days <= 7;
                  return (
                    <div key={a.id} className={`border rounded-lg p-3 flex items-start gap-3 bg-card ${isOverdue ? "border-red-300" : isSoon ? "border-amber-300" : ""}`}>
                      <Bell className={`h-4 w-4 mt-0.5 shrink-0 ${isOverdue ? "text-red-500" : isSoon ? "text-amber-500" : "text-muted-foreground"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{a.title}</p>
                        <p className={`text-xs mt-0.5 ${isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                          {isOverdue
                            ? `Vencida hace ${Math.abs(days)} día${Math.abs(days) !== 1 ? "s" : ""}`
                            : days === 0
                              ? "Vence hoy"
                              : `Vence en ${days} día${days !== 1 ? "s" : ""} — ${formatDate(a.due_date)}`}
                        </p>
                        {a.message && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.message}</p>}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600" title="Marcar completada" onClick={() => handleComplete(a.id)}>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Desactivar" onClick={() => handleToggle(a)}>
                          <BellOff className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(a.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Done / inactive alerts */}
          {doneAlerts.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Completadas / inactivas</p>
              <div className="space-y-2">
                {doneAlerts.map(a => (
                  <div key={a.id} className="border rounded-lg p-3 flex items-start gap-3 bg-muted/30 opacity-70">
                    <BellOff className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium line-through truncate">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(a.due_date)}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => setDeleteId(a.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nueva alerta</DialogTitle>
            <DialogDescription>
              La alerta aparecerá en la barra de alertas del sistema en la fecha indicada.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Título <span className="text-destructive">*</span></Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Ej: Vencimiento contrato aseo" />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha de alerta <span className="text-destructive">*</span></Label>
              <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Mensaje (opcional)</Label>
              <Textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} rows={3} placeholder="Detalle adicional de la alerta..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Creando..." : "Crear alerta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar alerta?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
