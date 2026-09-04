import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { backupQuotationFileToRepository } from "@/lib/repositoryBackup";

interface SiblingLine {
  id: string;
  name: string;
}

interface CapexOCRequiredDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  projectName: string;
  originLine: SiblingLine;
  siblingLines: SiblingLine[];
  ocRequeridaStatusId: string;
  onComplete: () => void;
}

/**
 * Se abre al marcar una línea CAPEX como "OC Requerida": exige subir la
 * cotización PDF que justifica el cambio y permite aplicar el mismo estado +
 * la misma cotización a otras líneas CAPEX del mismo presupuesto (una fila en
 * oc_quotations por línea, todas con el mismo archivo -- ver plan).
 */
export function CapexOCRequiredDialog({
  open,
  onOpenChange,
  contractId,
  projectName,
  originLine,
  siblingLines,
  ocRequeridaStatusId,
  onComplete,
}: CapexOCRequiredDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const toggleLine = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const reset = () => {
    setFile(null);
    setSelectedIds(new Set());
  };

  const handleClose = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const handleSave = async () => {
    if (!file) {
      toast.error("Debes adjuntar la cotización en PDF");
      return;
    }
    if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("El archivo debe ser un PDF");
      return;
    }

    setSaving(true);
    try {
      const upload = await backupQuotationFileToRepository(contractId, file, file.name);
      if (!upload.success || !upload.driveUrl) {
        toast.error(upload.error || "No se pudo subir la cotización");
        return;
      }

      const targetLines = [originLine, ...siblingLines.filter((l) => selectedIds.has(l.id))];
      const quotationNumber = `COT-${Date.now()}`;
      const today = new Date().toISOString().slice(0, 10);

      const quotationRows = targetLines.map((line) => ({
        budget_line_id: line.id,
        contract_id: contractId,
        quotation_number: quotationNumber,
        line_name: line.name,
        project_name: projectName,
        file_path: upload.driveUrl,
        file_name: file.name,
        quotation_date: today,
      }));

      const { error: quotationsError } = await (supabase as any).from("oc_quotations").insert(quotationRows);
      if (quotationsError) {
        toast.error("La cotización se subió, pero no se pudo asociar a las líneas");
        return;
      }

      const { error: statusError } = await (supabase as any)
        .from("budget_lines")
        .update({ progress_status_id: ocRequeridaStatusId })
        .in("id", targetLines.map((l) => l.id));
      if (statusError) {
        toast.error("La cotización se asoció, pero no se pudo actualizar el estado de las líneas");
        return;
      }

      toast.success(
        targetLines.length > 1
          ? `${targetLines.length} líneas marcadas como "OC Requerida"`
          : "Línea marcada como \"OC Requerida\""
      );
      reset();
      onComplete();
    } catch (error: any) {
      console.error("Error al procesar OC Requerida:", error);
      toast.error("Ocurrió un error al procesar la solicitud");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={saving ? undefined : handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Marcar "OC Requerida"</DialogTitle>
          <DialogDescription>
            Adjunta la cotización en PDF para <strong>{originLine.name}</strong>. Queda guardada en la
            carpeta "Cotizaciones" del repositorio del contrato.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="capex-oc-quote-file">Cotización (PDF)</Label>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild className="cursor-pointer">
                <label htmlFor="capex-oc-quote-file" className="flex items-center gap-1.5">
                  <FileUp className="h-3.5 w-3.5" />
                  Elegir archivo
                </label>
              </Button>
              <span className="text-sm text-muted-foreground truncate">
                {file ? file.name : "Ningún archivo seleccionado"}
              </span>
            </div>
            <input
              id="capex-oc-quote-file"
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {siblingLines.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Asociar otras líneas de CAPEX (opcional)
              </Label>
              <ScrollArea className="h-40 rounded-md border p-2">
                <div className="space-y-1">
                  {siblingLines.map((line) => (
                    <label
                      key={line.id}
                      className="flex items-center gap-2 text-sm py-1 px-1 rounded hover:bg-accent cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedIds.has(line.id)}
                        onCheckedChange={() => toggleLine(line.id)}
                      />
                      <span className="truncate">{line.name}</span>
                    </label>
                  ))}
                </div>
              </ScrollArea>
              <p className="text-[11px] text-muted-foreground">
                Las líneas seleccionadas también quedarán en "OC Requerida" con la misma cotización.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !file}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
