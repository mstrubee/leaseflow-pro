import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CategoryFusion } from "@/components/opex/useOpexCategoryChanges";

interface OpexUndoFusionDialogProps {
  planYear: number;
  fusion: CategoryFusion;
  categoryName: (id: string) => string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (moveToId: string) => Promise<boolean>;
}

// Deshacer una fusión o renombre cuya categoría final se creó con el cambio: los montos que ya tenga
// vuelven a una de las categorías originales, que se elige aquí. Nada se pierde.
export const OpexUndoFusionDialog = ({ planYear, fusion, categoryName, busy, onClose, onConfirm }: OpexUndoFusionDialogProps) => {
  const [moveToId, setMoveToId] = useState(fusion.fromIds[0]);
  const finalName = categoryName(fusion.toId);

  const handleConfirm = async () => {
    const ok = await onConfirm(moveToId);
    if (ok) onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Deshacer «{finalName}»</DialogTitle>
          <DialogDescription>
            Las categorías originales vuelven a estar vigentes en {planYear} y «{finalName}» se elimina. Si ya tiene OPEX
            agregado, OC, presupuesto o proveedores, pasan a la categoría que elijas: no se pierde ningún monto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-sm">
            Vuelven: <strong>{fusion.fromIds.map(categoryName).join(", ")}</strong>
          </p>
          {fusion.fromIds.length > 1 && (
            <div className="space-y-1">
              <Label htmlFor="undo-home">Los montos de «{finalName}» pasan a</Label>
              <Select value={moveToId} onValueChange={setMoveToId}>
                <SelectTrigger id="undo-home">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fusion.fromIds.map((id) => (
                    <SelectItem key={id} value={id}>
                      {categoryName(id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={busy}>
            {busy ? "Deshaciendo..." : "Deshacer fusión"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
