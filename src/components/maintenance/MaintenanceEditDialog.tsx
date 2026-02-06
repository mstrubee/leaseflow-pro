import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { MaintenanceForm } from "./types";

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

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const { error } = await (supabase.from("maintenance_forms" as any) as any)
        .update({
          form_number: formData.form_number,
          status: formData.status,
          created_date: formData.created_date || null,
          contract_name: formData.contract_name || null,
          general_description: formData.general_description || null,
          electrical_description: formData.electrical_description || null,
          civil_description: formData.civil_description || null,
          hvac_description: formData.hvac_description || null,
          fixed_assets_description: formData.fixed_assets_description || null,
          additional_comments: formData.additional_comments || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", form.id);

      if (error) throw error;
      toast({ title: "FORM actualizado correctamente" });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar FORM {form?.form_number}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>N° FORM</Label>
            <Input value={formData.form_number} onChange={e => set("form_number", e.target.value)} />
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
            <Label>Fecha</Label>
            <Input type="date" value={formData.created_date} onChange={e => set("created_date", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Contrato</Label>
            <Input value={formData.contract_name} onChange={e => set("contract_name", e.target.value)} readOnly className="bg-muted" />
          </div>
        </div>

        <div className="space-y-3 mt-2">
          <div className="space-y-1.5">
            <Label>Descripción General</Label>
            <Textarea value={formData.general_description} onChange={e => set("general_description", e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>Requerimiento Eléctrico</Label>
            <Textarea value={formData.electrical_description} onChange={e => set("electrical_description", e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>Requerimiento Obra Civil</Label>
            <Textarea value={formData.civil_description} onChange={e => set("civil_description", e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>Requerimiento Climatización</Label>
            <Textarea value={formData.hvac_description} onChange={e => set("hvac_description", e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>Requerimiento Activos Fijos</Label>
            <Textarea value={formData.fixed_assets_description} onChange={e => set("fixed_assets_description", e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>Comentarios Adicionales</Label>
            <Textarea value={formData.additional_comments} onChange={e => set("additional_comments", e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Guardando...</> : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
