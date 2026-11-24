import { useState } from "react";
import { GanttTask } from "@/hooks/useGantt";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CheckCircle2, XCircle, RotateCcw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_DOT: Record<string, string> = {
  pending: "bg-amber-400",
  in_progress: "bg-blue-500",
  completed: "bg-emerald-500",
  delayed: "bg-red-500",
  discarded: "bg-zinc-400",
};

export const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  in_progress: "En progreso",
  completed: "Completada",
  delayed: "Retrasada",
  discarded: "Descartada",
};

export function StatusDot({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn("inline-block h-2 w-2 rounded-full flex-shrink-0", STATUS_DOT[status] ?? "bg-muted-foreground", className)}
      title={STATUS_LABEL[status] ?? status}
    />
  );
}

interface TaskStatusActionsProps {
  task: GanttTask;
  canComplete: boolean;
  canDiscard: boolean;
  onToggleComplete: (task: GanttTask) => void | Promise<void>;
  onDiscard: (taskId: string) => void | Promise<void>;
  onRestore: (taskId: string) => void | Promise<void>;
  /** Cantidad de tareas descendientes (hijas, nietas, etc.) — habilita la
   *  confirmación inteligente que avisa que también se descartará la rama. */
  descendantCount?: number;
  size?: "sm" | "md";
}

export function TaskStatusActions({
  task, canComplete, canDiscard, onToggleComplete, onDiscard, onRestore, descendantCount = 0, size = "md",
}: TaskStatusActionsProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const isDiscarded = task.status === "discarded";
  const isCompleted = task.status === "completed";
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const btnSize = size === "sm" ? "h-6 w-6" : "h-7 w-7";

  const handleDiscard = async () => {
    setBusy(true);
    await onDiscard(task.id);
    setBusy(false);
    setConfirmOpen(false);
  };

  return (
    <>
      {canComplete && !isDiscarded && (
        <Button
          variant="ghost" size="icon" className={cn(btnSize, "flex-shrink-0")}
          onClick={() => onToggleComplete(task)}
          title={isCompleted ? "Marcar como pendiente" : "Marcar como completada"}
        >
          <CheckCircle2 className={cn(iconSize, isCompleted ? "text-emerald-600" : "text-muted-foreground")} />
        </Button>
      )}
      {canDiscard && (
        isDiscarded ? (
          <Button
            variant="ghost" size="icon" className={cn(btnSize, "flex-shrink-0")}
            onClick={() => onRestore(task.id)}
            title="Restaurar tarea"
          >
            <RotateCcw className={cn(iconSize, "text-muted-foreground hover:text-primary")} />
          </Button>
        ) : (
          <Button
            variant="ghost" size="icon" className={cn(btnSize, "flex-shrink-0")}
            onClick={() => setConfirmOpen(true)}
            title="Descartar tarea"
          >
            <XCircle className={cn(iconSize, "text-muted-foreground hover:text-destructive")} />
          </Button>
        )
      )}

      <AlertDialog open={confirmOpen} onOpenChange={(o) => !busy && setConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desea descartar esta tarea?</AlertDialogTitle>
            <AlertDialogDescription>
              {descendantCount > 0
                ? `Esta acción también descartará automáticamente ${descendantCount} tarea${descendantCount === 1 ? "" : "s"} descendiente${descendantCount === 1 ? "" : "s"} y recalculará el cronograma.`
                : "Se recalculará el cronograma en base a las dependencias restantes."}
              {" "}No se elimina — conserva toda su información y puede restaurarse en cualquier momento con un clic.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDiscard} disabled={busy} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
