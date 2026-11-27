import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface UnsavedChangesDialogProps {
  open: boolean;
  /** true mientras se está guardando (bloquea los botones). */
  saving?: boolean;
  /** "Continuar editando": cierra el aviso y deja la ventana como estaba. */
  onContinue: () => void;
  /** "Salir sin guardar": cierra la ventana descartando lo no guardado. */
  onDiscard: () => void;
  /** "Guardar": guarda y, si todo sale bien, cierra la ventana. */
  onSave: () => void;
}

/**
 * Aviso al cerrar una ventana con cambios sin guardar: guardar, continuar editando o salir sin guardar.
 * Nada se guarda por defecto: solo "Guardar" persiste. Escape equivale a "Continuar editando".
 */
export const UnsavedChangesDialog = ({ open, saving = false, onContinue, onDiscard, onSave }: UnsavedChangesDialogProps) => (
  <AlertDialog open={open} onOpenChange={(next) => { if (!next && !saving) onContinue(); }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>¿Guardar los cambios?</AlertDialogTitle>
        <AlertDialogDescription>
          Hay cambios sin guardar. Si sales sin guardar, se perderán.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter className="gap-2 sm:gap-2">
        <Button type="button" variant="outline" onClick={onContinue} disabled={saving}>
          Continuar editando
        </Button>
        <Button type="button" variant="destructive" onClick={onDiscard} disabled={saving}>
          Salir sin guardar
        </Button>
        <Button type="button" onClick={onSave} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Guardar
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
