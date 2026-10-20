import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

// merge: 2 o más categorías -> una existente o una nueva. rename: una categoría con otro nombre.
// retire: retirar una categoría que tiene montos (hay que elegir a cuál pasarlos).
// reassign: una categoría ya retirada sin destino que ahora debe fusionarse con otra.
export type CategoryActionMode = "merge" | "rename" | "retire" | "reassign";

interface OpexCategoryChangeDialogProps {
  open: boolean;
  mode: CategoryActionMode;
  planYear: number;
  sources: Array<{ id: string; name: string }>;
  // Categorías vigentes del año planificado que se pueden usar como destino.
  candidates: Array<{ id: string; name: string }>;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: { toId: string | null; toName: string | null }) => Promise<boolean>;
}

export const OpexCategoryChangeDialog = ({
  open,
  mode,
  planYear,
  sources,
  candidates,
  busy,
  onClose,
  onSubmit,
}: OpexCategoryChangeDialogProps) => {
  const [target, setTarget] = useState<"existing" | "new">("new");
  const [toId, setToId] = useState("");
  const [toName, setToName] = useState("");

  useEffect(() => {
    if (!open) return;
    setTarget(mode === "merge" ? "new" : "existing");
    setToId("");
    setToName("");
  }, [open, mode]);

  const needsExisting = mode === "retire" || mode === "reassign" || (mode === "merge" && target === "existing");
  const needsName = mode === "rename" || (mode === "merge" && target === "new");
  const names = sources.map((s) => `«${s.name}»`).join(", ");

  const title =
    mode === "merge"
      ? `Fusionar ${sources.length} categorías`
      : mode === "rename"
        ? `Renombrar ${names}`
        : `${mode === "retire" ? "Retirar" : "Fusionar"} ${names}`;
  const description =
    mode === "merge"
      ? `Se suman en una sola categoría desde ${planYear}.`
      : mode === "rename"
        ? `El nuevo nombre rige desde ${planYear}.`
        : `Tiene montos para ${planYear}: elige a qué categoría pasarlos (es una fusión).`;

  const handleSubmit = async () => {
    if (needsExisting && !toId) return toast.error("Elige la categoría de destino");
    if (needsName && !toName.trim()) return toast.error("Ingresa el nombre de la categoría");
    const ok = await onSubmit({ toId: needsExisting ? toId : null, toName: needsName ? toName.trim() : null });
    if (ok) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {mode === "merge" && (
            <>
              <p className="text-sm">
                Categorías a fusionar: <strong>{names}</strong>
              </p>
              <RadioGroup value={target} onValueChange={(v) => setTarget(v as "existing" | "new")} className="space-y-2">
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="target-new" value="new" />
                  <Label htmlFor="target-new">Crear una categoría con un nombre nuevo</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="target-existing" value="existing" />
                  <Label htmlFor="target-existing">Usar una categoría existente</Label>
                </div>
              </RadioGroup>
            </>
          )}

          {needsName && (
            <div className="space-y-1">
              <Label htmlFor="category-final-name">{mode === "rename" ? "Nuevo nombre" : "Nombre final"}</Label>
              <Input id="category-final-name" maxLength={100} value={toName} onChange={(e) => setToName(e.target.value)} />
            </div>
          )}

          {needsExisting && (
            <div className="space-y-1">
              <Label>{mode === "merge" ? "Categoría final" : "Pasar los montos a"}</Label>
              <Select value={toId} onValueChange={setToId}>
                <SelectTrigger>
                  <SelectValue placeholder="Elige una categoría" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            El año {planYear - 1} no se toca: sus OC, presupuestos y reportes conservan las categorías y nombres de hoy.
            Puedes deshacer el cambio hasta que se apliquen las categorías {planYear}.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={busy}>
            {busy ? "Guardando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
