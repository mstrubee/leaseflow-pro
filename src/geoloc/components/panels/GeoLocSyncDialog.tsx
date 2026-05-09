import { useState } from "react";
import { Loader2, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useGeoLocSync } from "@/geoloc/hooks/useGeoLocSync";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const GeoLocSyncDialog = ({ open, onOpenChange }: Props) => {
  const { pending, lastLog, loading, requestSync } = useGeoLocSync();
  const [submitting, setSubmitting] = useState(false);

  const triggerLovableAgent = (message: string) => {
    try {
      const inIframe = window.parent && window.parent !== window;
      if (!inIframe) return false;
      // Lovable editor listens for chat messages from preview iframe
      window.parent.postMessage(
        { type: "lovable:chat:send", message, source: "geoloc-sync" },
        "*",
      );
      window.parent.postMessage(
        { type: "LOVABLE_SEND_CHAT_MESSAGE", message },
        "*",
      );
      return true;
    } catch {
      return false;
    }
  };

  const handleRequest = async () => {
    setSubmitting(true);
    try {
      await requestSync();
      const dispatched = triggerLovableAgent(
        "ejecuta la sincronización de GeoLoc pendiente",
      );
      if (dispatched) {
        toast.success("Sincronización iniciada", {
          description:
            "Se envió la orden al agente Lovable. Revisa el chat para ver el avance.",
          duration: 6000,
        });
      } else {
        toast.success("Solicitud registrada", {
          description:
            "Escribe en el chat de Lovable: 'ejecuta la sincronización de GeoLoc pendiente'.",
          duration: 8000,
        });
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al solicitar");
    } finally {
      setSubmitting(false);
    }
  };

  const conflicts = Array.isArray(lastLog?.conflicts)
    ? (lastLog!.conflicts as unknown[])
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Sincronizar GeoLoc desde el proyecto original
          </DialogTitle>
          <DialogDescription>
            Solicita al asistente que traiga las últimas actualizaciones del módulo
            GeoLoc original al proyecto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div className="mb-2 font-medium">Última sincronización</div>
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
              </div>
            ) : lastLog ? (
              <div className="space-y-1 text-xs text-muted-foreground">
                <div>
                  <span className="font-medium text-foreground">Fecha:</span>{" "}
                  {new Date(lastLog.executed_at).toLocaleString("es-CL")}
                </div>
                <div>
                  <span className="font-medium text-foreground">
                    Archivos actualizados:
                  </span>{" "}
                  {lastLog.files_updated}
                </div>
                <div>
                  <span className="font-medium text-foreground">
                    Archivos protegidos (no tocados):
                  </span>{" "}
                  {lastLog.files_skipped_protected}
                </div>
                {conflicts.length > 0 && (
                  <div className="flex items-start gap-1.5 text-amber-600 dark:text-amber-400">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{conflicts.length} conflicto(s) reportado(s)</span>
                  </div>
                )}
                {lastLog.summary && (
                  <div className="mt-2 whitespace-pre-wrap rounded bg-background/50 p-2 text-foreground">
                    {lastLog.summary}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                Aún no se ha ejecutado ninguna sincronización.
              </div>
            )}
          </div>

          {pending.length > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              <div className="mb-1 flex items-center gap-1.5 font-medium">
                <AlertCircle className="h-3.5 w-3.5" />
                {pending.length} solicitud(es) pendiente(s)
              </div>
              <p>
                Hay solicitudes esperando ejecución. Pídele al asistente Lovable:{" "}
                <em>"ejecuta la sincronización de GeoLoc pendiente"</em>.
              </p>
            </div>
          )}

          <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            <p>
              Al solicitar la sincronización, se registra una solicitud que el
              asistente Lovable procesará. Se preservan los archivos adaptados al
              almacenamiento Drive del proyecto.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button onClick={handleRequest} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />{" "}
                Solicitando…
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-3.5 w-3.5" /> Solicitar
                sincronización
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
