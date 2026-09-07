import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { backupQuotationFileToRepository } from "@/lib/repositoryBackup";
import { useBudgetProgressStatuses } from "@/hooks/useBudgetProgressStatuses";
import type { OCRequiredGroup } from "./OCRequiredList";

interface CapexLeaf {
  id: string;
  name: string;
}

interface EditOCRequiredDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  projectName: string;
  group: OCRequiredGroup;
  onSaved: () => void;
}

/** Editar una "OC Requerida": monto, reemplazar el archivo adjunto, y
 *  agregar/quitar líneas CAPEX asociadas. Quitar una línea repone su estado a
 *  "Sin estado"; agregar una línea la deja en "OC Requerida" -- misma
 *  política que eliminar el requerimiento completo. */
export function EditOCRequiredDialog({ open, onOpenChange, contractId, projectName, group, onSaved }: EditOCRequiredDialogProps) {
  const { statuses } = useBudgetProgressStatuses();
  const ocRequeridaStatusId = statuses.find((s) => s.name.trim().toLowerCase() === "oc requerida")?.id ?? null;

  const [monto, setMonto] = useState(String(Math.round(group.amountClp)));
  const [file, setFile] = useState<File | null>(null);
  const [leaves, setLeaves] = useState<CapexLeaf[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(group.lines.map((l) => l.budgetLineId)));
  const [loadingLeaves, setLoadingLeaves] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMonto(String(Math.round(group.amountClp)));
    setFile(null);
    setSelectedIds(new Set(group.lines.map((l) => l.budgetLineId)));
    loadLeaves();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, group.quotationNumber]);

  const loadLeaves = async () => {
    setLoadingLeaves(true);
    try {
      const { data: budgets } = await supabase
        .from("contract_budgets")
        .select("id")
        .eq("contract_id", contractId)
        .eq("budget_type", "capex");
      const budgetIds = (budgets || []).map((b: any) => b.id);
      if (budgetIds.length === 0) { setLeaves([]); return; }

      const { data: lines } = await supabase
        .from("budget_lines")
        .select("id, name, parent_id")
        .in("budget_id", budgetIds)
        .is("deleted_at", null);
      const all = (lines || []) as { id: string; name: string; parent_id: string | null }[];
      const parentIds = new Set(all.map((l) => l.parent_id).filter(Boolean) as string[]);
      setLeaves(all.filter((l) => !parentIds.has(l.id)).map((l) => ({ id: l.id, name: l.name })));
    } catch (error) {
      console.error("Error cargando líneas CAPEX:", error);
    } finally {
      setLoadingLeaves(false);
    }
  };

  const toggleLine = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const montoClp = parseInt(monto.replace(/\D/g, ""), 10) || 0;

  const handleSave = async () => {
    if (montoClp <= 0) {
      toast.error("Ingresa un monto válido");
      return;
    }
    if (selectedIds.size === 0) {
      toast.error("Debe quedar al menos una línea asociada");
      return;
    }
    if (!ocRequeridaStatusId) {
      toast.error('No se encontró el estado "OC Requerida"');
      return;
    }

    setSaving(true);
    try {
      let filePath = group.filePath;
      let fileName = group.fileName;
      if (file) {
        const upload = await backupQuotationFileToRepository(contractId, file, file.name);
        if (!upload.success || !upload.driveUrl) {
          toast.error(upload.error || "No se pudo subir el nuevo archivo");
          return;
        }
        filePath = upload.driveUrl;
        fileName = file.name;
      }

      const originalIds = new Set(group.lines.map((l) => l.budgetLineId));
      const removed = [...originalIds].filter((id) => !selectedIds.has(id));
      const kept = [...originalIds].filter((id) => selectedIds.has(id));
      const added = [...selectedIds].filter((id) => !originalIds.has(id));

      if (removed.length > 0) {
        const { error } = await supabase
          .from("oc_quotations")
          .delete()
          .eq("quotation_number", group.quotationNumber)
          .in("budget_line_id", removed);
        if (error) throw error;
        await supabase.from("budget_lines").update({ progress_status_id: null }).in("id", removed);
      }

      if (kept.length > 0) {
        const { error } = await (supabase as any)
          .from("oc_quotations")
          .update({ amount_clp: montoClp, amount_uf: group.ufValue > 0 ? montoClp / group.ufValue : 0, file_path: filePath, file_name: fileName })
          .eq("quotation_number", group.quotationNumber)
          .in("budget_line_id", kept);
        if (error) throw error;
      }

      if (added.length > 0) {
        const addedLeaves = leaves.filter((l) => added.includes(l.id));
        const rows = addedLeaves.map((l) => ({
          budget_line_id: l.id,
          contract_id: contractId,
          quotation_number: group.quotationNumber,
          line_name: l.name,
          project_name: projectName,
          file_path: filePath,
          file_name: fileName,
          quotation_date: group.quotationDate,
          amount_clp: montoClp,
          amount_uf: group.ufValue > 0 ? montoClp / group.ufValue : 0,
        }));
        const { error } = await (supabase as any).from("oc_quotations").insert(rows);
        if (error) throw error;
        await supabase.from("budget_lines").update({ progress_status_id: ocRequeridaStatusId }).in("id", added);
      }

      toast.success("Requerimiento actualizado");
      onOpenChange(false);
      onSaved();
    } catch (error: any) {
      console.error("Error al editar OC Requerida:", error);
      toast.error(error.message || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={saving ? undefined : onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar OC Requerida</DialogTitle>
          <DialogDescription>{group.quotationNumber}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-oc-required-monto">Monto requerido ($)</Label>
            <Input id="edit-oc-required-monto" type="text" inputMode="numeric" value={monto} onChange={(e) => setMonto(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-oc-required-file">Archivo adjunto</Label>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild className="cursor-pointer">
                <label htmlFor="edit-oc-required-file" className="flex items-center gap-1.5">
                  <FileUp className="h-3.5 w-3.5" />
                  Reemplazar archivo
                </label>
              </Button>
              <span className="text-sm text-muted-foreground truncate">{file ? file.name : group.fileName || "Sin archivo"}</span>
            </div>
            <input
              id="edit-oc-required-file"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.xls,.xlsx,.doc,.docx"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Líneas CAPEX asociadas</Label>
            {loadingLeaves ? (
              <div className="flex items-center justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (
              <ScrollArea className="h-48 rounded-md border p-2">
                <div className="space-y-1">
                  {leaves.map((line) => (
                    <label key={line.id} className="flex items-center gap-2 text-sm py-1 px-1 rounded hover:bg-accent cursor-pointer">
                      <Checkbox checked={selectedIds.has(line.id)} onCheckedChange={() => toggleLine(line.id)} />
                      <span className="truncate">{line.name}</span>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
