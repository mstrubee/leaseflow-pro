import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  buildReconcilePreview,
  applyReconciliation,
  ReconcilePreview,
} from "@/lib/ocImportReconcile";

interface ReconcileImportsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

/**
 * Reconstruye, para el historial de importaciones ya hecho, lo que #23
 * arregló solo hacia adelante: marcar como importadas ("I") las OC cuyo
 * total ya coincidía con el Excel y por eso nunca se tocaron. Vuelve a leer
 * cada Excel guardado — el usuario no tiene que volver a subir nada — y
 * solo actúa tras ver la vista previa y confirmar.
 */
export function ReconcileImportsDialog({ open, onOpenChange, onComplete }: ReconcileImportsDialogProps) {
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<ReconcilePreview | null>(null);

  useEffect(() => {
    if (!open) {
      setPreview(null);
      return;
    }
    setLoadingPreview(true);
    buildReconcilePreview()
      .then(setPreview)
      .catch((err) => {
        console.error("Error al armar la vista previa de reconciliación:", err);
        toast.error("No se pudo revisar el historial de importaciones.");
        onOpenChange(false);
      })
      .finally(() => setLoadingPreview(false));
  }, [open]);

  const handleApply = async () => {
    if (!preview || preview.candidates.length === 0) return;
    setApplying(true);
    try {
      const result = await applyReconciliation(preview.candidates);
      if (result.failed > 0) {
        toast.warning(`${result.updated} OC marcadas como importadas, ${result.failed} con error.`);
      } else {
        toast.success(`${result.updated} OC marcadas como importadas.`);
      }
      onComplete?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Error al aplicar la reconciliación:", err);
      toast.error("No se pudo aplicar la reconciliación.");
    } finally {
      setApplying(false);
    }
  };

  const busy = loadingPreview || applying;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Reconciliar importaciones anteriores</DialogTitle>
        </DialogHeader>

        {loadingPreview ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Revisando el historial de importaciones…
          </div>
        ) : preview ? (
          <div className="space-y-3 text-sm">
            <p>
              Se revisaron <strong>{preview.batchesScanned}</strong> importación(es) anterior(es).
            </p>
            {preview.candidates.length > 0 ? (
              <p>
                <strong>{preview.candidates.length}</strong> OC coinciden exactamente con lo ya cargado y
                todavía no están marcadas como importadas. Se les va a dejar constancia de qué importación
                las trajo, <strong>sin cambiar monto, descripción ni proveedor</strong>.
              </p>
            ) : (
              <p className="text-muted-foreground">No hay OC pendientes de reconciliar — nada que hacer.</p>
            )}
            {preview.skippedBatches.length > 0 && (
              <div className="flex items-start gap-2 p-2 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  {preview.skippedBatches.length} importación(es) no se pudieron revisar (archivo no disponible o
                  ilegible) y se omitieron.
                </p>
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cerrar
          </Button>
          <Button onClick={handleApply} disabled={busy || !preview || preview.candidates.length === 0}>
            {applying && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Marcar {preview?.candidates.length ? `(${preview.candidates.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
