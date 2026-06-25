import { useState } from "react";
import { GanttTimeline, GanttTask, OrgMember, Holiday, GanttTaskDependency } from "@/hooks/useGantt";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { GanttChart } from "./GanttChart";
import { Star, GitCompare } from "lucide-react";
import { cn } from "@/lib/utils";

interface GanttCompareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timelines: GanttTimeline[];
  tasksByTimeline: Record<string, GanttTask[]>;
  buildTaskTree: (tasks: GanttTask[]) => GanttTask[];
  orgMembers: OrgMember[];
  holidays: Holiday[];
  onUpdateTask: (taskId: string, updates: Partial<GanttTask>, opts?: { skipPropagation?: boolean; breakDependencies?: boolean }) => Promise<void>;
  onAddTask: (timelineId: string, name: string, parentId?: string | null, opts?: Partial<GanttTask>) => Promise<any>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onUndoDelete: () => Promise<void>;
  onAddDependency: (taskId: string, dependsOnTaskId: string, opts?: { dep_type?: "start" | "end"; lag_days?: number; lag_type?: "calendar" | "business" }) => Promise<void>;
  onRemoveDependency: (depId: string) => Promise<void>;
  onUpdateDependency: (depId: string, updates: { dep_type?: "start" | "end"; lag_days?: number; lag_type?: "calendar" | "business" }) => Promise<void>;
  onReorderTask: (taskId: string, newIndex: number, siblingIds: string[]) => Promise<void>;
  isAdmin: boolean;
}

export function GanttCompareDialog({
  open,
  onOpenChange,
  timelines,
  tasksByTimeline,
  buildTaskTree,
  orgMembers,
  holidays,
  onUpdateTask,
  onAddTask,
  onDeleteTask,
  onUndoDelete,
  onAddDependency,
  onRemoveDependency,
  onUpdateDependency,
  onReorderTask,
  isAdmin,
}: GanttCompareDialogProps) {
  // Step 1: selection; Step 2: comparison view
  const [step, setStep] = useState<"select" | "compare">("select");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleOpen = (o: boolean) => {
    if (!o) {
      setStep("select");
      setSelectedIds(new Set());
    }
    onOpenChange(o);
  };

  const selectedTimelines = timelines.filter((tl) => selectedIds.has(tl.id));

  if (!open) return null;

  // ── Step 1: selection ──────────────────────────────────────────────────
  if (step === "select") {
    return (
      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitCompare className="h-5 w-5" />
              Comparar Cronogramas
            </DialogTitle>
            <DialogDescription>
              Selecciona los cronogramas que deseas comparar (mínimo 2).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            {timelines.map((tl) => {
              const tlTasks = tasksByTimeline[tl.id] || [];
              return (
                <div
                  key={tl.id}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                    selectedIds.has(tl.id)
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50 hover:bg-muted/30"
                  )}
                  onClick={() => toggleSelect(tl.id)}
                >
                  <Checkbox
                    checked={selectedIds.has(tl.id)}
                    onCheckedChange={() => toggleSelect(tl.id)}
                    className="pointer-events-none"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{tl.name}</span>
                      {tl.is_priority ? (
                        <Badge className="text-xs px-1.5 py-0 bg-amber-500 hover:bg-amber-500 text-white gap-1 flex-shrink-0">
                          <Star className="h-2.5 w-2.5" />
                          Prioritario
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs px-1.5 py-0 flex-shrink-0">
                          Estudio
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {tlTasks.length} tarea{tlTasks.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={selectedIds.size < 2}
              onClick={() => setStep("compare")}
              className="gap-2"
            >
              <GitCompare className="h-4 w-4" />
              Comparar ({selectedIds.size} seleccionados)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Step 2: comparison view (full-screen) ──────────────────────────────
  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-[95vw] w-[95vw] max-h-[95vh] h-[95vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <GitCompare className="h-5 w-5" />
              Comparación de Cronogramas
            </DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep("select")}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ← Cambiar selección
            </Button>
          </div>
          <DialogDescription>
            Columnas visibles: #, Tarea, Responsable, Inicio, Plazo, Término. Todas las funcionalidades de edición y arrastre están activas.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto overflow-x-hidden divide-y">
          {selectedTimelines.map((tl) => {
            const tlTasks = tasksByTimeline[tl.id] || [];
            const taskTree = buildTaskTree(tlTasks);

            return (
              <div key={tl.id} className="min-h-0">
                {/* Timeline label bar */}
                <div className="flex items-center gap-2 px-4 py-2 bg-muted/40 border-b sticky top-0 z-10">
                  <span className="text-sm font-semibold">{tl.name}</span>
                  {tl.is_priority ? (
                    <Badge className="text-xs px-1.5 py-0 bg-amber-500 hover:bg-amber-500 text-white gap-1">
                      <Star className="h-2.5 w-2.5" />
                      Prioritario
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs px-1.5 py-0">
                      Estudio
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {tlTasks.length} tarea{tlTasks.length !== 1 ? "s" : ""}
                  </span>
                </div>

                <GanttChart
                  tasks={tlTasks}
                  taskTree={taskTree}
                  holidays={holidays}
                  orgMembers={orgMembers}
                  compareMode
                  onUpdateTask={onUpdateTask}
                  onAddTask={(name, parentId, opts) => onAddTask(tl.id, name, parentId ?? null, opts)}
                  onDeleteTask={onDeleteTask}
                  onUndoDelete={onUndoDelete}
                  onAddDependency={onAddDependency}
                  onRemoveDependency={onRemoveDependency}
                  onUpdateDependency={onUpdateDependency}
                  onReorderTask={onReorderTask}
                  isAdmin={isAdmin}
                />
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
