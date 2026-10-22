import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { CheckCircle2, MessageSquareWarning, XCircle } from "lucide-react";
import { actOnApproval, ApprovalAction } from "@/lib/serviceContractApproval";

export interface ApprovalDialogContract {
  id: string;
  name: string;
  supplierName?: string | null;
  serviceType?: string | null;
  amountLabel?: string | null;
  periodLabel?: string | null;
  notes?: string | null;
}

interface Props {
  contract: ApprovalDialogContract | null;
  actorId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

export function ApprovalActionDialog({ contract, actorId, open, onOpenChange, onDone }: Props) {
  const [mode, setMode] = useState<null | "observada" | "rechazada">(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setMode(null); setComment(""); }
  }, [open]);

  if (!contract) return null;

  const submit = async (action: ApprovalAction) => {
    if (!actorId) { toast.error("No se pudo identificar al usuario"); return; }
    if ((action === "observada" || action === "rechazada") && !comment.trim()) {
      toast.error("Escribe un comentario para el creador");
      return;
    }
    setSaving(true);
    const { error } = await actOnApproval(contract.id, action, actorId, comment);
    setSaving(false);
    if (error) {
      toast.error("No se pudo registrar la decisión");
      return;
    }
    toast.success(
      action === "aprobada" ? "Contrato aprobado"
      : action === "observada" ? "Contrato observado"
      : "Contrato rechazado"
    );
    onOpenChange(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Revisar aprobación</DialogTitle>
          <DialogDescription>{contract.name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2 text-sm">
          <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5">
            {contract.supplierName && (
              <><dt className="text-muted-foreground">Proveedor</dt><dd className="font-medium">{contract.supplierName}</dd></>
            )}
            {contract.serviceType && (
              <><dt className="text-muted-foreground">Servicio</dt><dd>{contract.serviceType}</dd></>
            )}
            {contract.amountLabel && (
              <><dt className="text-muted-foreground">Monto</dt><dd className="tabular-nums">{contract.amountLabel}</dd></>
            )}
            {contract.periodLabel && (
              <><dt className="text-muted-foreground">Vigencia</dt><dd>{contract.periodLabel}</dd></>
            )}
          </dl>
          {contract.notes && (
            <div className="pt-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Notas</p>
              <p className="text-sm whitespace-pre-line">{contract.notes}</p>
            </div>
          )}
        </div>

        {mode && (
          <div className="space-y-1.5">
            <Label>
              {mode === "observada" ? "Observación para el creador" : "Motivo del rechazo"}
              <span className="text-destructive"> *</span>
            </Label>
            <Textarea
              autoFocus
              rows={3}
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder={mode === "observada"
                ? "Qué debe corregir o aclarar el creador..."
                : "Por qué se rechaza este contrato..."}
            />
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {mode === null ? (
            <>
              <Button variant="outline" className="text-orange-600 border-orange-200 hover:bg-orange-50" onClick={() => setMode("observada")}>
                <MessageSquareWarning className="h-4 w-4 mr-1.5" /> Observar
              </Button>
              <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setMode("rechazada")}>
                <XCircle className="h-4 w-4 mr-1.5" /> Rechazar
              </Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => submit("aprobada")} disabled={saving}>
                <CheckCircle2 className="h-4 w-4 mr-1.5" /> Aprobar
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => { setMode(null); setComment(""); }}>Volver</Button>
              <Button
                className={mode === "observada" ? "bg-orange-600 hover:bg-orange-700" : "bg-red-600 hover:bg-red-700"}
                onClick={() => submit(mode)}
                disabled={saving || !comment.trim()}
              >
                {saving ? "Guardando..." : mode === "observada" ? "Enviar observación" : "Confirmar rechazo"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
