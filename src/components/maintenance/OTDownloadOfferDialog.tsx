import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileDown, ArrowRight } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDownload: () => void;
  onSkip: () => void;
}

export function OTDownloadOfferDialog({ open, onOpenChange, onDownload, onSkip }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Orden de Trabajo</DialogTitle>
          <DialogDescription>
            El FORM ha sido marcado como Cotizado. ¿Desea descargar la OT completada por el sistema?
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          <Button className="gap-2" onClick={onDownload}>
            <FileDown className="h-4 w-4" /> Descargar OT
          </Button>
          <Button variant="outline" className="gap-2" onClick={onSkip}>
            <ArrowRight className="h-4 w-4" /> Continuar sin descargar
          </Button>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
