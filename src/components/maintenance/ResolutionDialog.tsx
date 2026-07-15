import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, MessageSquare } from "lucide-react";
import { OTUploadDialog } from "./OTUploadDialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingObservations: string | null;
  onResolve: (observations: string | null) => void;
  formId?: string | null;
  formNumber?: string;
  onOTUploaded?: () => void;
}

export function ResolutionDialog({ open, onOpenChange, existingObservations, onResolve, formId, formNumber, onOTUploaded }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [observations, setObservations] = useState("");
  const [otUploadOpen, setOtUploadOpen] = useState(false);
  const [pendingObservations, setPendingObservations] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep(1);
      setObservations(existingObservations || "");
    }
  }, [open, existingObservations]);

  const handleClose = () => {
    onOpenChange(false);
  };

  const proceedToOTUpload = (obs: string | null) => {
    setPendingObservations(obs);
    onOpenChange(false);
    setOtUploadOpen(true);
  };

  const handleOTUploadClose = (uploaded: boolean) => {
    setOtUploadOpen(false);
    if (uploaded) {
      // Only resolve after OT is uploaded
      onResolve(pendingObservations);
      if (onOTUploaded) onOTUploaded();
    }
    // If not uploaded, do nothing — resolution is blocked
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-md"
          // Igual que en OTUploadDialog: mientras el flujo de resolución está
          // en curso, no debe poder cerrarse por accidente vía backdrop/Escape.
          onPointerDownOutside={e => e.preventDefault()}
          onEscapeKeyDown={e => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Marcar como Resuelto</DialogTitle>
            <DialogDescription>
              {step === 1
                ? "Seleccione cómo desea marcar este FORM como resuelto."
                : "Ingrese las observaciones de Control de Gestión."}
            </DialogDescription>
          </DialogHeader>

          {step === 1 ? (
            <div className="flex flex-col gap-3 py-2">
              <Button
                variant="outline"
                className="justify-start gap-2 h-auto py-3"
                onClick={() => proceedToOTUpload(existingObservations)}
              >
                <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                <span>Marcar como resuelto</span>
              </Button>
              <Button
                variant="outline"
                className="justify-start gap-2 h-auto py-3"
                onClick={() => setStep(2)}
              >
                <MessageSquare className="h-4 w-4 text-primary shrink-0" />
                <span>Resuelto con observaciones</span>
              </Button>
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <Textarea
                value={observations}
                onChange={e => setObservations(e.target.value)}
                placeholder="Escriba las observaciones de Control de Gestión..."
                rows={4}
                autoFocus
              />
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            {step === 1 ? (
              <Button variant="outline" onClick={handleClose}>Cancelar</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setStep(1)}>Cancelar</Button>
                <Button onClick={() => proceedToOTUpload(observations.trim() || null)}>
                  Continuar
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OTUploadDialog
        open={otUploadOpen}
        onOpenChange={v => {
          if (!v) handleOTUploadClose(false);
        }}
        formId={formId || null}
        formNumber={formNumber || ""}
        onSuccess={() => handleOTUploadClose(true)}
      />
    </>
  );
}
