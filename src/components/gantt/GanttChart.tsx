import { useMemo, useState } from "react";
import { GanttTask } from "@/hooks/useGantt";
import { Holiday, calculateEndDate } from "@/lib/ganttDateUtils";
import { getGanttDateRange, getTaskStatusColor, formatGanttDate } from "@/lib/ganttDateUtils";
import { format, addDays, differenceInDays, parseISO, eachDayOfInterval, isWeekend } from "date-fns";
import { es } from "date-fns/locale";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronDown, ChevronRight, Link, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface GanttChartProps {
  tasks: GanttTask[];
  taskTree: GanttTask[];
  holidays: Array<{ date: string; name: string }>;
  onUpdateTask: (taskId: string, updates: Partial<GanttTask>) => Promise<void>;
  onAddTask: (name: string, parentId?: string | null, options?: Partial<GanttTask>) => Promise<any>;
  onAddDependency: (taskId: string, dependsOnTaskId: string) => Promise<void>;
  onRemoveDependency: (dependencyId: string) => Promise<void>;
}

const DAY_WIDTH = 30;
const ROW_HEIGHT = 36;
const TASK_NAME_WIDTH = 250;

type TaskStatus = "pending" | "in_progress" | "completed" | "delayed";

interface TaskFormData {
  name: string;
  parent_id: string | null;
  start_date: string;
  duration_days: number;
  duration_type: "calendar" | "business";
  status: TaskStatus;
  progress: number;
  notes: string;
}

const defaultTaskForm: TaskFormData = {
  name: "",
  parent_id: null,
  start_date: format(new Date(), "yyyy-MM-dd"),
  duration_days: 1,
  duration_type: "calendar",
  status: "pending",
  progress: 0,
  notes: "",
};

export function GanttChart({
  tasks,
  taskTree,
  holidays,
  onUpdateTask,
  onAddTask,
}: GanttChartProps) {
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<GanttTask | null>(null);
  const [taskForm, setTaskForm] = useState<TaskFormData>(defaultTaskForm);
  const [isSaving, setIsSaving] = useState(false);

  const { minDate, maxDate } = useMemo(() => getGanttDateRange(tasks), [tasks]);

  const days = useMemo(() => {
    return eachDayOfInterval({ start: minDate, end: maxDate });
  }, [minDate, maxDate]);

  const totalDays = days.length;

  const toggleExpand = (taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  // Flatten visible tasks based on expansion state
  const visibleTasks = useMemo(() => {
    const result: Array<{ task: GanttTask; level: number }> = [];
    
    const addTasks = (tasks: GanttTask[], level: number) => {
      tasks.forEach((task) => {
        result.push({ task, level });
        if (task.children && task.children.length > 0 && expandedTasks.has(task.id)) {
          addTasks(task.children, level + 1);
        }
      });
    };
    
    addTasks(taskTree, 0);
    return result;
  }, [taskTree, expandedTasks]);

  // Flatten all tasks for parent selection
  const allTasksFlat = useMemo(() => {
    const result: Array<{ task: GanttTask; level: number }> = [];
    
    const addTasks = (tasks: GanttTask[], level: number) => {
      tasks.forEach((task) => {
        result.push({ task, level });
        if (task.children && task.children.length > 0) {
          addTasks(task.children, level + 1);
        }
      });
    };
    
    addTasks(taskTree, 0);
    return result;
  }, [taskTree]);

  const getTaskPosition = (task: GanttTask) => {
    if (!task.start_date || !task.end_date) {
      return { left: 0, width: 0, visible: false };
    }

    const startDate = parseISO(task.start_date);
    const endDate = parseISO(task.end_date);
    
    const startOffset = differenceInDays(startDate, minDate);
    const duration = differenceInDays(endDate, startDate) + 1;
    
    return {
      left: startOffset * DAY_WIDTH,
      width: duration * DAY_WIDTH,
      visible: true,
    };
  };

  const isHolidayDate = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return holidays.some((h) => h.date === dateStr);
  };

  const handleOpenNewTask = () => {
    setEditingTask(null);
    setTaskForm(defaultTaskForm);
    setShowTaskDialog(true);
  };

  const handleEditTask = (task: GanttTask) => {
    setEditingTask(task);
    setTaskForm({
      name: task.name,
      parent_id: task.parent_id,
      start_date: task.start_date || format(new Date(), "yyyy-MM-dd"),
      duration_days: task.duration_days || 1,
      duration_type: task.duration_type as "calendar" | "business",
      status: task.status,
      progress: task.progress || 0,
      notes: task.notes || "",
    });
    setShowTaskDialog(true);
  };

  const handleSaveTask = async () => {
    if (!taskForm.name.trim()) return;
    
    setIsSaving(true);
    try {
      const endDate = calculateEndDate(
        taskForm.start_date,
        taskForm.duration_days,
        taskForm.duration_type,
        holidays
      );

      if (editingTask) {
        await onUpdateTask(editingTask.id, {
          name: taskForm.name,
          parent_id: taskForm.parent_id,
          start_date: taskForm.start_date,
          end_date: format(endDate, "yyyy-MM-dd"),
          duration_days: taskForm.duration_days,
          duration_type: taskForm.duration_type,
          status: taskForm.status,
          progress: taskForm.progress,
          notes: taskForm.notes,
        });
      } else {
        await onAddTask(
          taskForm.name,
          taskForm.parent_id,
          {
            start_date: taskForm.start_date,
            end_date: format(endDate, "yyyy-MM-dd"),
            duration_days: taskForm.duration_days,
            duration_type: taskForm.duration_type,
            status: taskForm.status,
            progress: taskForm.progress,
            notes: taskForm.notes,
          }
        );
      }
      setShowTaskDialog(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Add task button */}
      <div className="p-2 border-b bg-muted/30 flex justify-end">
        <Button size="sm" onClick={handleOpenNewTask}>
          <Plus className="h-4 w-4 mr-1" />
          Nueva Tarea
        </Button>
      </div>

      <ScrollArea className="w-full">
        <div className="min-w-fit">
          {/* Header with dates */}
          <div className="flex border-b bg-muted/50 sticky top-0 z-10">
            {/* Task name column header */}
            <div
              className="flex-shrink-0 border-r px-3 py-2 font-medium text-sm"
              style={{ width: TASK_NAME_WIDTH }}
            >
              Tarea
            </div>
            
            {/* Days header */}
            <div className="flex">
              {days.map((day, idx) => {
                const isWeekendDay = isWeekend(day);
                const isHoliday = isHolidayDate(day);
                const isToday = format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
                
                return (
                  <TooltipProvider key={idx}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            "flex-shrink-0 text-center text-xs py-1 border-r border-b",
                            isWeekendDay && "bg-muted/80",
                            isHoliday && "bg-red-100 dark:bg-red-900/20",
                            isToday && "bg-primary/10 font-bold"
                          )}
                          style={{ width: DAY_WIDTH }}
                        >
                          <div className="font-medium">
                            {format(day, "d", { locale: es })}
                          </div>
                          <div className="text-muted-foreground text-[10px]">
                            {format(day, "EEE", { locale: es })}
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{format(day, "PPPP", { locale: es })}</p>
                        {isHoliday && (
                          <p className="text-red-500">
                            {holidays.find((h) => h.date === format(day, "yyyy-MM-dd"))?.name}
                          </p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })}
            </div>
          </div>

          {/* Task rows */}
          <div>
            {visibleTasks.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No hay tareas aún. Haz clic en "Nueva Tarea" para comenzar.
              </div>
            ) : (
              visibleTasks.map(({ task, level }) => {
                const hasChildren = task.children && task.children.length > 0;
                const isExpanded = expandedTasks.has(task.id);
                const position = getTaskPosition(task);
                
                return (
                  <div
                    key={task.id}
                    className="flex border-b hover:bg-muted/30 transition-colors"
                    style={{ height: ROW_HEIGHT }}
                  >
                    {/* Task name */}
                    <div
                      className="flex-shrink-0 border-r px-2 flex items-center gap-1 overflow-hidden"
                      style={{ width: TASK_NAME_WIDTH, paddingLeft: 8 + level * 16 }}
                    >
                      {hasChildren ? (
                        <button
                          onClick={() => toggleExpand(task.id)}
                          className="p-0.5 hover:bg-muted rounded"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                      ) : (
                        <span className="w-5" />
                      )}
                      <span 
                        className="truncate text-sm cursor-pointer hover:underline" 
                        title={task.name}
                        onDoubleClick={() => handleEditTask(task)}
                      >
                        {task.name}
                      </span>
                      {task.dependencies && task.dependencies.length > 0 && (
                        <Link className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      )}
                    </div>

                    {/* Gantt bar area */}
                    <div
                      className="relative flex-1"
                      style={{ width: totalDays * DAY_WIDTH }}
                    >
                      {/* Background grid */}
                      <div className="absolute inset-0 flex">
                        {days.map((day, idx) => {
                          const isWeekendDay = isWeekend(day);
                          const isHoliday = isHolidayDate(day);
                          
                          return (
                            <div
                              key={idx}
                              className={cn(
                                "flex-shrink-0 border-r h-full",
                                isWeekendDay && "bg-muted/50",
                                isHoliday && "bg-red-50 dark:bg-red-900/10"
                              )}
                              style={{ width: DAY_WIDTH }}
                            />
                          );
                        })}
                      </div>

                      {/* Task bar */}
                      {position.visible && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className={cn(
                                  "absolute top-1 rounded h-6 cursor-pointer transition-all hover:opacity-80",
                                  getTaskStatusColor(task.status, task.end_date)
                                )}
                                style={{
                                  left: position.left,
                                  width: Math.max(position.width - 4, 8),
                                }}
                                onDoubleClick={() => handleEditTask(task)}
                              >
                                {/* Progress indicator */}
                                {task.progress > 0 && (
                                  <div
                                    className="absolute inset-y-0 left-0 bg-white/30 rounded-l"
                                    style={{ width: `${task.progress}%` }}
                                  />
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="space-y-1">
                                <p className="font-medium">{task.name}</p>
                                <p className="text-xs">
                                  {formatGanttDate(task.start_date)} - {formatGanttDate(task.end_date)}
                                </p>
                                <p className="text-xs">
                                  Duración: {task.duration_days} días ({task.duration_type === "business" ? "hábiles" : "corridos"})
                                </p>
                                <p className="text-xs">Progreso: {task.progress}%</p>
                                <p className="text-xs text-muted-foreground">Doble clic para editar</p>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {/* Task Dialog */}
      <Dialog open={showTaskDialog} onOpenChange={setShowTaskDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingTask ? "Editar Tarea" : "Nueva Tarea"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Nombre de la tarea *</Label>
              <Input
                value={taskForm.name}
                onChange={(e) => setTaskForm({ ...taskForm, name: e.target.value })}
                placeholder="Nombre de la tarea"
              />
            </div>

            <div>
              <Label>Tarea padre (opcional)</Label>
              <Select
                value={taskForm.parent_id || "none"}
                onValueChange={(value) => setTaskForm({ ...taskForm, parent_id: value === "none" ? null : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin padre" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin padre (nivel raíz)</SelectItem>
                  {allTasksFlat
                    .filter(({ task }) => task.id !== editingTask?.id)
                    .map(({ task, level }) => (
                      <SelectItem key={task.id} value={task.id}>
                        {"—".repeat(level)} {task.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Fecha inicio</Label>
                <Input
                  type="date"
                  value={taskForm.start_date}
                  onChange={(e) => setTaskForm({ ...taskForm, start_date: e.target.value })}
                />
              </div>
              <div>
                <Label>Duración (días)</Label>
                <Input
                  type="number"
                  min={1}
                  value={taskForm.duration_days}
                  onChange={(e) => setTaskForm({ ...taskForm, duration_days: parseInt(e.target.value) || 1 })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo de días</Label>
                <Select
                  value={taskForm.duration_type}
                  onValueChange={(value: "calendar" | "business") => setTaskForm({ ...taskForm, duration_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="calendar">Corridos</SelectItem>
                    <SelectItem value="business">Hábiles</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Estado</Label>
                <Select
                  value={taskForm.status}
                  onValueChange={(value: TaskStatus) => setTaskForm({ ...taskForm, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendiente</SelectItem>
                    <SelectItem value="in_progress">En progreso</SelectItem>
                    <SelectItem value="completed">Completada</SelectItem>
                    <SelectItem value="delayed">Atrasada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Progreso (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={taskForm.progress}
                onChange={(e) => setTaskForm({ ...taskForm, progress: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) })}
              />
            </div>

            <div>
              <Label>Notas</Label>
              <Textarea
                value={taskForm.notes}
                onChange={(e) => setTaskForm({ ...taskForm, notes: e.target.value })}
                placeholder="Notas adicionales..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTaskDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveTask} disabled={isSaving || !taskForm.name.trim()}>
              {isSaving ? "Guardando..." : editingTask ? "Guardar Cambios" : "Crear Tarea"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
