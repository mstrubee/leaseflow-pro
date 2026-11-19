import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

/** Admin: pide la observación (opcional) al rechazar una solicitud de autorización. */
export function RejectAuthorizationDialog({
  open,
  onOpenChange,
  lineName,
  saving,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lineName: string;
  saving: boolean;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  useEffect(() => {
    if (open) setNote("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={saving ? undefined : onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rechazar solicitud de autorización</DialogTitle>
          <DialogDescription>
            <strong>{lineName}</strong> volverá a estado "No Autorizado". Puedes dejar una observación para quien la solicitó.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Observación (opcional): qué debe corregirse o aclararse"
          rows={4}
          maxLength={1000}
          disabled={saving}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={() => onConfirm(note)} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Rechazar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Todos los usuarios: muestra la observación dejada al rechazar la solicitud. */
export function LineObservationDialog({
  open,
  onOpenChange,
  lineName,
  note,
  rejectedAt,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lineName: string;
  note: string | null | undefined;
  rejectedAt: string | null | undefined;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Observación</DialogTitle>
          <DialogDescription>
            <strong>{lineName}</strong>
            {rejectedAt ? ` — ${new Date(rejectedAt).toLocaleString("es-CL")}` : ""}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm whitespace-pre-wrap rounded-md border bg-muted/30 p-3">
          {note?.trim() || "La solicitud fue rechazada sin observación escrita."}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
