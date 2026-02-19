import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, Link, Info, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { MaintenanceForm, SubStatus, SUB_STATUS_ORDER, SUB_STATUS_LABELS, SUB_STATUS_INFO, getNextSubStatus } from "./types";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Clock } from "lucide-react";

interface Props {
  form: MaintenanceForm | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function MaintenanceEditDialog({ form, open, onOpenChange, onSuccess }: Props) {
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    form_number: "",
    status: "proceso",
    sub_status: "solicitado" as SubStatus,
    created_date: "",
    contract_name: "",
    general_description: "",
    electrical_description: "",
    civil_description: "",
    hvac_description: "",
    fixed_assets_description: "",
    additional_comments: "",
  });

  useEffect(() => {
    if (form) {
      setFormData({
        form_number: form.form_number || "",
        status: form.status || "proceso",
        sub_status: (form.sub_status as SubStatus) || "solicitado",
        created_date: form.created_date || "",
        contract_name: form.contract_name || "",
        general_description: form.general_description || "",
        electrical_description: form.electrical_description || "",
        civil_description: form.civil_description || "",
        hvac_description: form.hvac_description || "",
        fixed_assets_description: form.fixed_assets_description || "",
        additional_comments: form.additional_comments || "",
      });
    }
  }, [form]);

  const doSave = async (advance: boolean) => {
    if (!form) return;
    setSaving(true);
    try {
      const newSubStatus = advance ? getNextSubStatus(formData.sub_status) : formData.sub_status;
      if (advance && !newSubStatus) {
        toast({ title: "Ya está en el último sub-estado", variant: "destructive" });
        setSaving(false);
        return;
      }

      const { error } = await (supabase.from("maintenance_forms" as any) as any)
        .update({
          status: formData.status,
          sub_status: newSubStatus || formData.sub_status,
          additional_comments: formData.additional_comments || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", form.id);

      if (error) throw error;
      toast({ title: advance ? `Avanzado a ${SUB_STATUS_LABELS[newSubStatus as SubStatus]}` : "FORM actualizado correctamente" });
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      console.error(err);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const set = (key: string, val: string) => setFormData(p => ({ ...p, [key]: val }));

  const nextStatus = getNextSubStatus(formData.sub_status);

  return (
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
            <Select value={formData.status} onValueChange={v => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="proceso">En Proceso</SelectItem>
                <SelectItem value="solucionado">Solucionado</SelectItem>
              </SelectContent>
            </Select>
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
                    {SUB_STATUS_ORDER.map(s => (
                      <div key={s} className="text-xs">
                        <span className="font-medium">{SUB_STATUS_LABELS[s]}</span>
                        <span className="text-muted-foreground ml-1">({SUB_STATUS_INFO[s].responsible})</span>
                        <p className="text-muted-foreground mt-0.5">{SUB_STATUS_INFO[s].description}</p>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <Select value={formData.sub_status} onValueChange={v => set("sub_status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SUB_STATUS_ORDER.map(s => (
                  <SelectItem key={s} value={s}>{SUB_STATUS_LABELS[s]}</SelectItem>
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

          {form?.evidence_links && form.evidence_links.length > 0 && (
            <div className="space-y-1.5">
              <Label>Evidencias</Label>
              <div className="flex flex-col gap-1 p-3 rounded-md border bg-muted">
                {form.evidence_links.map((link, idx) => (
                  <a key={idx} href={link} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1.5">
                    <Link className="h-3.5 w-3.5 shrink-0" />
                    Evidencia {idx + 1}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Timeline de sub-estados */}
        {form && (
          <div className="space-y-2 border-t pt-3 mt-2">
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-semibold">Historial de Sub Estados</Label>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {SUB_STATUS_ORDER.map(s => {
                const key = `sub_status_${s}_at` as keyof MaintenanceForm;
                const dateVal = form[key] as string | null;
                return (
                  <div key={s} className={`rounded-md border p-2 text-xs ${dateVal ? 'bg-primary/5 border-primary/20' : 'bg-muted/50 border-border'}`}>
                    <p className="font-medium">{SUB_STATUS_LABELS[s]}</p>
                    <p className="text-muted-foreground mt-0.5">
                      {dateVal ? format(new Date(dateVal), "dd MMM yyyy HH:mm", { locale: es }) : "—"}
                    </p>
                  </div>
                );
              })}
            </div>
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
  );
}
