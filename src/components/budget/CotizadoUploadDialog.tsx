import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { FileUp, Loader2, X, ExternalLink, ArrowRightCircle } from "lucide-react";
import { toast } from "sonner";
import { backupQuotationFileToRepository } from "@/lib/repositoryBackup";
import { sanitizeFileName } from "@/lib/fileValidation";
import { extractStoragePath } from "@/lib/storageUtils";
import { useBudgetProgressStatuses } from "@/hooks/useBudgetProgressStatuses";

// Mismas extensiones aceptadas que CapexOCRequiredDialog.
const ACCEPTED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".xls", ".xlsx", ".doc", ".docx"];
const ACCEPT_ATTR =
  ".pdf,.jpg,.jpeg,.png,.xls,.xlsx,.doc,.docx," +
  "application/pdf,image/jpeg,image/png," +
  "application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet," +
  "application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Convierte el link de Drive guardado (.../file/d/<ID>/view...) al formato
// embebible del visor de Drive (.../file/d/<ID>/preview), que soporta PDF,
// imágenes, Word y Excel sin descargar nada.
function getDrivePreviewUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/\/file\/d\/([^/]+)/);
  if (!match) return null;
  return `https://drive.google.com/file/d/${match[1]}/preview`;
}

interface CotizadoUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  lineId: string;
  lineName: string;
  cotizadoStatusId: string;
  /** Cotización ya subida (si la línea ya está "Cotizado") -- se muestra con
   *  previsualización en vez del selector de archivo. */
  existingFileUrl?: string | null;
  existingFileName?: string | null;
  /** Ruta en Supabase Storage de la misma cotización (ver handleSave) -- se
   *  usa para recuperar el archivo sin pedírselo de nuevo al avanzar a "OC
   *  Requerida". Si es null (cotización subida antes de que existiera esta
   *  columna, o ya vencida), se avanza igual pero pidiendo el archivo de nuevo. */
  existingStoragePath?: string | null;
  /** El padre abre el flujo completo de "OC Requerida" (CapexOCRequiredDialog)
   *  para esta misma línea, con el id del estado "OC Requerida" ya resuelto y,
   *  si se pudo recuperar, el mismo archivo ya adjunto. */
  onAdvanceToOcRequerida: (ocRequeridaStatusId: string, initialFile: File | null) => void;
  onComplete: () => void;
}

/**
 * Se abre al marcar (o reabrir) una línea CAPEX como "Cotizado" desde el
 * badge de Estado de Avance (ver BudgetLineTree.tsx > ProgressStatusBadge).
 * A diferencia de "OC Requerida" (CapexOCRequiredDialog), acá no se pide
 * monto ni proveedor -- solo adjuntar la cotización. El archivo se sube a la
 * carpeta "Cotizaciones" del contrato en Drive (se crea si no existe, ver
 * repositoryBackup.ts), renombrado a "aaaa-mm-dd_NombreDeLaLinea.<ext>". El
 * estado de la línea solo cambia si la subida termina bien -- si se cancela
 * el diálogo, el badge no cambia.
 *
 * Si la línea ya tiene una cotización subida, se abre en modo "ver" con
 * previsualización embebida (visor de Drive) en vez del selector de
 * archivo, con opción de reemplazarla o de avanzar directo a "OC Requerida".
 */
export function CotizadoUploadDialog({
  open,
  onOpenChange,
  contractId,
  lineId,
  lineName,
  cotizadoStatusId,
  existingFileUrl,
  existingFileName,
  existingStoragePath,
  onAdvanceToOcRequerida,
  onComplete,
}: CotizadoUploadDialogProps) {
  const { statuses } = useBudgetProgressStatuses();
  const ocRequeridaStatusId = statuses.find((s) => s.name.trim().toLowerCase() === "oc requerida")?.id ?? null;

  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  // "view": muestra la cotización ya subida. "upload": selector de archivo
  // (primera subida, o reemplazo de la existente).
  const [mode, setMode] = useState<"view" | "upload">(existingFileUrl ? "view" : "upload");

  useEffect(() => {
    if (open) {
      setMode(existingFileUrl ? "view" : "upload");
      setFile(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lineId]);

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
          quotation_storage_path: upload.storagePath ?? null,
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

  // Intenta recuperar el mismo archivo ya subido (desde Supabase Storage,
  // donde queda una copia además de la que se sube a Drive) para no
  // pedírselo de nuevo al usuario en el flujo de "OC Requerida". Si no se
  // puede (cotización subida antes de esta columna, o ya vencida), igual se
  // avanza pero pidiendo el archivo de nuevo.
  const handleAdvance = async () => {
    if (!ocRequeridaStatusId) {
      toast.error("No se encontró el estado \"OC Requerida\"");
      return;
    }
    const storagePath = existingStoragePath ? extractStoragePath(existingStoragePath) : null;
    if (!storagePath) {
      onAdvanceToOcRequerida(ocRequeridaStatusId, null);
      return;
    }
    setAdvancing(true);
    try {
      const { data: blob, error } = await supabase.storage.from("repository-files").download(storagePath);
      if (error || !blob) throw error || new Error("Archivo no encontrado");
      const recoveredFile = new File([blob], existingFileName || "cotizacion", { type: blob.type });
      onAdvanceToOcRequerida(ocRequeridaStatusId, recoveredFile);
    } catch (error: any) {
      console.error("No se pudo recuperar el archivo original:", error);
      toast.error("No se encontró el archivo original de la cotización -- deberá adjuntarlo nuevamente");
      onAdvanceToOcRequerida(ocRequeridaStatusId, null);
    } finally {
      setAdvancing(false);
    }
  };

  const previewUrl = getDrivePreviewUrl(existingFileUrl);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setFile(null); onOpenChange(o); }}>
      <DialogContent className={mode === "view" ? "max-w-2xl" : undefined}>
        <DialogHeader>
          <DialogTitle>{mode === "view" ? "Cotización" : "Marcar como Cotizado"}</DialogTitle>
          <DialogDescription>
            Línea: <strong>{lineName}</strong>.{" "}
            {mode === "view"
              ? "Esta es la cotización adjunta."
              : "Adjunte la cotización (PDF, Word, Excel o imagen) -- se guarda en la carpeta \"Cotizaciones\" del contrato en Drive."}
          </DialogDescription>
        </DialogHeader>

        {mode === "view" ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate font-medium">{existingFileName}</span>
              {existingFileUrl && (
                <Button variant="outline" size="sm" className="shrink-0 gap-1" asChild>
                  <a href={existingFileUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3 w-3" />
                    Abrir en Drive
                  </a>
                </Button>
              )}
            </div>
            {previewUrl ? (
              <iframe
                src={previewUrl}
                title="Vista previa de la cotización"
                className="w-full h-[420px] rounded-md border"
              />
            ) : (
              <div className="py-10 text-center text-sm text-muted-foreground border rounded-md">
                No se pudo generar la vista previa. Use "Abrir en Drive" para verla.
              </div>
            )}
          </div>
        ) : (
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
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {mode === "view" ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={advancing}>
                Cerrar
              </Button>
              <Button variant="outline" onClick={() => setMode("upload")} className="gap-1" disabled={advancing}>
                <FileUp className="h-4 w-4" />
                Reemplazar archivo
              </Button>
              <Button onClick={handleAdvance} className="gap-1" disabled={advancing}>
                {advancing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightCircle className="h-4 w-4" />}
                Avanzar a Requerimiento de OC
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => (existingFileUrl ? setMode("view") : onOpenChange(false))}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving || !file}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Guardar
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
