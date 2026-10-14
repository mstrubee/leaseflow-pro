import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { FileUp, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { backupQuotationFileToRepository } from "@/lib/repositoryBackup";
import { sanitizeFileName } from "@/lib/fileValidation";

// Mismas extensiones aceptadas que CapexOCRequiredDialog.
const ACCEPTED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".xls", ".xlsx", ".doc", ".docx"];
const ACCEPT_ATTR =
  ".pdf,.jpg,.jpeg,.png,.xls,.xlsx,.doc,.docx," +
  "application/pdf,image/jpeg,image/png," +
  "application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet," +
  "application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

interface CotizadoUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  lineId: string;
  lineName: string;
  cotizadoStatusId: string;
  onComplete: () => void;
}

/**
 * Se abre al marcar una línea CAPEX como "Cotizado" directamente desde el
 * badge de Estado de Avance (ver BudgetLineTree.tsx > ProgressStatusBadge).
 * A diferencia de "OC Requerida" (CapexOCRequiredDialog), acá no se pide
 * monto ni proveedor -- solo adjuntar la cotización. El archivo se sube a la
 * carpeta "Cotizaciones" del contrato en Drive (se crea si no existe, ver
 * repositoryBackup.ts), renombrado a "aaaa-mm-dd_NombreDeLaLinea.<ext>". El
 * estado de la línea solo cambia si la subida termina bien -- si se cancela
 * el diálogo, el badge no cambia.
 */
export function CotizadoUploadDialog({
  open,
  onOpenChange,
  contractId,
  lineId,
  lineName,
  cotizadoStatusId,
  onComplete,
}: CotizadoUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const ext = f.name.toLowerCase().slice(f.name.lastIndexOf("."));
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      toast.error(`Formato no permitido. Use: ${ACCEPTED_EXTENSIONS.join(", ")}`);
      e.target.value = "";
      return;
    }
    setFile(f);
  };

  const handleSave = async () => {
    if (!file) {
      toast.error("Adjunte un archivo de cotización");
      return;
    }
    setSaving(true);
    try {
      const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
      const dateStr = new Date().toISOString().slice(0, 10); // aaaa-mm-dd
      const driveFileName = sanitizeFileName(`${dateStr}_${lineName}${ext}`);

      const upload = await backupQuotationFileToRepository(contractId, file, driveFileName);
      if (!upload.success || !upload.driveUrl) {
        toast.error(upload.error || "No se pudo subir la cotización");
        return;
      }

      const { error } = await (supabase as any)
        .from("budget_lines")
        .update({
          progress_status_id: cotizadoStatusId,
          quotation_file_url: upload.driveUrl,
          quotation_file_name: driveFileName,
        })
        .eq("id", lineId);
      if (error) throw error;

      toast.success("Cotización subida y línea marcada como Cotizado");
      setFile(null);
      onComplete();
    } catch (error: any) {
      console.error("Error al subir cotización:", error);
      toast.error(error.message || "No se pudo subir la cotización");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setFile(null); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Marcar como Cotizado</DialogTitle>
          <DialogDescription>
            Línea: <strong>{lineName}</strong>. Adjunte la cotización (PDF, Word, Excel o imagen) -- se guarda en la
            carpeta "Cotizaciones" del contrato en Drive.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {!file ? (
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg py-8 cursor-pointer hover:bg-muted/50 transition-colors">
              <FileUp className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Haga clic para elegir un archivo</span>
              <input type="file" accept={ACCEPT_ATTR} className="hidden" onChange={handleFileChange} />
            </label>
          ) : (
            <div className="flex items-center justify-between p-3 rounded-md border bg-muted/30 text-sm">
              <span className="truncate">{file.name}</span>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setFile(null)} disabled={saving}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
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
