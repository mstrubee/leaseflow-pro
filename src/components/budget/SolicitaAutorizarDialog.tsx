import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { FileUp, FileText, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { backupQuotationFileToRepository } from "@/lib/repositoryBackup";
import { sanitizeFileName } from "@/lib/fileValidation";
import { useBudgetProgressStatuses } from "@/hooks/useBudgetProgressStatuses";

export interface SolicitaAutorizarLineRef {
  id: string;
  name: string;
  amount_uf: number;
  status: string;
}

interface SolicitaAutorizarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  originLine: SolicitaAutorizarLineRef;
  /** El padre entra en modo selección de líneas directamente en la página.
   *  initialIds queda pre-tildado (incluye siempre la línea de origen, que
   *  además queda bloqueada para no poder destildarla). */
  onRequestLineSelection: (initialIds: string[]) => void;
  /** Se actualiza (junto con additionalLinesVersion) cuando el usuario termina
   *  de seleccionar líneas en la página -- puede ser [] si terminó sin elegir
   *  ninguna. */
  additionalLines: SolicitaAutorizarLineRef[];
  additionalLinesVersion: number;
  onComplete: () => void;
}

type Step = "upload" | "selecting" | "summary";

// Mismas extensiones aceptadas que CapexOCRequiredDialog/CotizadoUploadDialog.
const ACCEPTED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".xls", ".xlsx", ".doc", ".docx"];
const ACCEPT_ATTR =
  ".pdf,.jpg,.jpeg,.png,.xls,.xlsx,.doc,.docx," +
  "application/pdf,image/jpeg,image/png," +
  "application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet," +
  "application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const lineStatusLabel = (status: string) =>
  status === "autorizado" ? "Autorizado" : status === "solicita_autorizar" ? "Solicita Autorizar" : "No autorizado";

/**
 * Se abre al marcar una línea CAPEX como "Solicita Autorizar" desde su badge
 * de estado (ver BudgetLineTree.tsx > handleStatusSelect). A diferencia del
 * toggle directo Autorizado/No Autorizado, este estado exige primero adjuntar
 * la cotización -- igual que "OC Requerida" (CapexOCRequiredDialog), permite
 * asociar el mismo archivo a otras líneas adicionales elegidas directamente
 * en la página. El cambio de estado (y el de Estado de Avance a "Cotizado")
 * solo se aplica al confirmar "Aceptar" -- si se cancela, el badge no cambia.
 */
export function SolicitaAutorizarDialog({
  open,
  onOpenChange,
  contractId,
  originLine,
  onRequestLineSelection,
  additionalLines,
  additionalLinesVersion,
  onComplete,
}: SolicitaAutorizarDialogProps) {
  const { statuses } = useBudgetProgressStatuses();
  const cotizadoStatusId = statuses.find((s) => s.name.trim().toLowerCase() === "cotizado")?.id ?? null;

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [finalAdditionalLines, setFinalAdditionalLines] = useState<SolicitaAutorizarLineRef[]>([]);
  const [saving, setSaving] = useState(false);

  // Vuelve del modo "seleccionar en la página" con el resultado -- incluso si
  // vino vacío, cuenta como "terminó de seleccionar" (pasa al resumen).
  useEffect(() => {
    if (additionalLinesVersion > 0) {
      setFinalAdditionalLines(additionalLines);
      setStep("summary");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [additionalLinesVersion]);

  const reset = () => {
    setStep("upload");
    setFile(null);
    setFinalAdditionalLines([]);
  };

  const handleClose = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const handleFileChange = (f: File | null) => {
    if (!f) return;
    const ext = f.name.toLowerCase().slice(f.name.lastIndexOf("."));
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      toast.error("El archivo debe ser PDF, JPEG, PNG, Excel o Word");
      return;
    }
    setFile(f);
    setStep("summary");
  };

  const targetLines = [originLine, ...finalAdditionalLines];

  const handleSave = async () => {
    if (!file || !cotizadoStatusId) {
      if (!cotizadoStatusId) toast.error('No se encontró el estado "Cotizado"');
      return;
    }
    setSaving(true);
    try {
      const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
      const dateStr = new Date().toISOString().slice(0, 10);
      const driveFileName = sanitizeFileName(`${dateStr}_${originLine.name}${ext}`);

      const upload = await backupQuotationFileToRepository(contractId, file, driveFileName);
      if (!upload.success || !upload.driveUrl) {
        toast.error(upload.error || "No se pudo subir la cotización");
        return;
      }

      const targetIds = targetLines.map((l) => l.id);

      // En dos pasos, no en un solo update: el trigger trg_budget_line_authorized
      // reacciona a cambios de `status` y puede tocar `progress_status_id` -- se
      // fija primero el status y recién después, en un segundo update, se deja
      // `progress_status_id` en "Cotizado" explícitamente, para que valga pase lo
      // que pase haya hecho el trigger en el medio.
      const { error: statusError } = await (supabase as any)
        .from("budget_lines")
        .update({ status: "solicita_autorizar" })
        .in("id", targetIds);
      if (statusError) throw statusError;

      const { error: progressError } = await (supabase as any)
        .from("budget_lines")
        .update({
          progress_status_id: cotizadoStatusId,
          quotation_file_url: upload.driveUrl,
          quotation_file_name: driveFileName,
          quotation_storage_path: upload.storagePath ?? null,
        })
        .in("id", targetIds);
      if (progressError) {
        toast.error('Las líneas quedaron en "Solicita Autorizar", pero no se pudo guardar la cotización');
        return;
      }

      toast.success(
        targetLines.length > 1
          ? `${targetLines.length} líneas marcadas como "Solicita Autorizar"`
          : 'Línea marcada como "Solicita Autorizar"'
      );
      reset();
      onComplete();
    } catch (error: any) {
      console.error("Error al procesar Solicita Autorizar:", error);
      toast.error(error.message || "Ocurrió un error al procesar la solicitud");
    } finally {
      setSaving(false);
    }
  };

  const dialogOpen = open && step !== "selecting";

  return (
    <Dialog open={dialogOpen} onOpenChange={saving ? undefined : handleClose}>
      <DialogContent className={cn(step === "summary" ? "max-w-lg" : "max-w-md")}>
        <DialogHeader>
          <DialogTitle>Solicitar Autorización</DialogTitle>
          <DialogDescription>
            <strong>{originLine.name}</strong>
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-3">
            {!file ? (
              <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg py-8 cursor-pointer hover:bg-muted/50 transition-colors">
                <FileUp className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Haga clic para elegir la cotización</span>
                <input
                  type="file"
                  accept={ACCEPT_ATTR}
                  className="hidden"
                  onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                />
              </label>
            ) : (
              <div className="flex items-center justify-between p-3 rounded-md border bg-muted/30 text-sm">
                <span className="flex items-center gap-2 truncate">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {file.name}
                </span>
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setFile(null)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">PDF, JPEG, PNG, Excel o Word</p>
          </div>
        )}

        {step === "summary" && file && (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-md border bg-muted/30 text-sm">
              <span className="flex items-center gap-2 truncate">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                {file.name}
              </span>
              <Button variant="ghost" size="sm" className="h-7 gap-1 shrink-0" onClick={() => setStep("upload")} disabled={saving}>
                <FileUp className="h-3.5 w-3.5" />
                Reemplazar
              </Button>
            </div>
            <div className="rounded-md border divide-y">
              {targetLines.map((line) => (
                <div key={line.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="truncate">{line.name}</span>
                  <span className="text-[10px] uppercase text-muted-foreground shrink-0">{lineStatusLabel(line.status)}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Puedes asociar otras líneas para que queden con el mismo estado "Solicita Autorizar".
            </p>
          </div>
        )}

        <DialogFooter>
          {step === "upload" && (
            <Button variant="outline" onClick={() => handleClose(false)}>
              Cancelar
            </Button>
          )}
          {step === "summary" && (
            <>
              <Button variant="outline" onClick={() => handleClose(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => {
                  setStep("selecting");
                  onRequestLineSelection([originLine.id, ...finalAdditionalLines.map((l) => l.id)]);
                }}
              >
                Seleccionar otras líneas
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Aceptar
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
