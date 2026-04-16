import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { GanttTask } from "@/hooks/useGantt";
import { Holiday, calculateEndDate, calculateStartDate } from "@/lib/ganttDateUtils";
import { getGanttDateRange, getTaskStatusColor, formatGanttDate } from "@/lib/ganttDateUtils";
import { format, differenceInDays, parseISO, eachDayOfInterval, isWeekend, addDays } from "date-fns";
import { es } from "date-fns/locale";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronDown, ChevronRight, Link, Plus, Calendar as CalendarIcon, Trash2, GripVertical, CheckCircle2, Eye, EyeOff, FileDown, Palette } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { SearchableSelect } from "@/components/ui/searchable-select";

// Auto-progress based on today's date vs task start/end
function computeAutoProgress(task: GanttTask): number {
  if (!task.start_date || !task.end_date) return 0;
  const start = parseISO(task.start_date).getTime();
  const end = parseISO(task.end_date).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const now = today.getTime();
  if (now <= start) return 0;
  if (now >= end) return 100;
  const total = end - start;
  if (total <= 0) return 0;
  return Math.round(((now - start) / total) * 100);
}

// Predefined color palette for Gantt task bars
const TASK_COLORS: Array<{ name: string; value: string }> = [
  { name: "Azul", value: "#3b82f6" },
  { name: "Verde", value: "#10b981" },
  { name: "Naranjo", value: "#f97316" },
  { name: "Rojo", value: "#ef4444" },
  { name: "Morado", value: "#8b5cf6" },
  { name: "Rosa", value: "#ec4899" },
  { name: "Amarillo", value: "#eab308" },
  { name: "Cian", value: "#06b6d4" },
  { name: "Gris", value: "#64748b" },
];

// Lighten a hex color by mixing with white. amount = 0..1
function lightenHex(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `#${lr.toString(16).padStart(2, "0")}${lg.toString(16).padStart(2, "0")}${lb.toString(16).padStart(2, "0")}`;
}

type BarDragMode = "move" | "resize-left" | "resize-right" | "dependency" | null;

const DatePickerCell = ({ 
  value, 
  onChange, 
  placeholder = "Seleccionar",
  showTaskDates = false,
  taskDates = [],
  editable = true,
}: { 
  value: string | null; 
  onChange: (date: string) => void;
  placeholder?: string;
  showTaskDates?: boolean;
  taskDates?: Array<{ date: string; taskName: string; type: "start" | "end" }>;
  editable?: boolean;
}) => {
  const [open, setOpen] = useState(false);

  // Non-editable: show plain text
  if (!editable) {
    return (
      <span className="text-xs text-muted-foreground px-2 truncate">
        {value ? format(parseISO(value), "dd/MM/yy") : "—"}
      </span>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          className="w-full h-full flex items-center justify-center cursor-pointer select-none hover:bg-muted/40 rounded"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
          title="Doble clic para editar"
        >
          <span className={cn("text-xs px-2 truncate", !value && "text-muted-foreground")}>
            {value ? format(parseISO(value), "dd/MM/yy") : placeholder}
          </span>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 z-50 bg-popover" align="start">
        <div className="flex">
          {showTaskDates && taskDates.length > 0 && (
            <div className="border-r max-h-[300px] overflow-y-auto w-48">
              <div className="p-2 border-b bg-muted/50">
                <span className="text-xs font-medium text-muted-foreground">Fechas de tareas</span>
              </div>
              <div className="p-1">
                {taskDates.map((td, idx) => (
                  <Button
                    key={idx}
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start h-auto py-1.5 px-2 text-left"
                    onClick={() => { onChange(td.date); setOpen(false); }}
                  >
                    <div className="flex flex-col">
                      <span className="text-xs font-medium">
                        {format(parseISO(td.date), "dd/MM/yyyy")}
                      </span>
                      <span className="text-[10px] text-muted-foreground truncate">
                        {td.type === "end" ? "Fin:" : "Inicio:"} {td.taskName}
                      </span>
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          )}
          <Calendar
            mode="single"
            selected={value ? parseISO(value) : undefined}
            onSelect={(date) => { if (date) { onChange(format(date, "yyyy-MM-dd")); setOpen(false); } }}
            initialFocus
            className="p-3 pointer-events-auto"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
};

interface GanttChartProps {
  tasks: GanttTask[];
  taskTree: GanttTask[];
  holidays: Array<{ date: string; name: string }>;
  onUpdateTask: (taskId: string, updates: Partial<GanttTask>, options?: { skipPropagation?: boolean; breakDependencies?: boolean }) => Promise<void>;
  onAddTask: (name: string, parentId?: string | null, options?: Partial<GanttTask>) => Promise<any>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onAddDependency: (taskId: string, dependsOnTaskId: string) => Promise<void>;
  onRemoveDependency: (dependencyId: string) => Promise<void>;
  onReorderTask: (taskId: string, newIndex: number, siblingIds: string[]) => Promise<void>;
  isAdmin?: boolean;
  onExportPDF?: (hideCompleted: boolean) => void;
}

const DAY_WIDTH = 30;
const ROW_HEIGHT = 40;
const TASK_NAME_WIDTH = 300;
const DATE_COL_WIDTH = 110;
const DURATION_COL_WIDTH = 110;
const PROGRESS_COL_WIDTH = 80;

interface NewTaskRow {
  name: string;
  start_date: string;
  duration_days: number;
  duration_type: "calendar" | "business";
  end_date: string;
  parent_id: string | null;
}

const createEmptyNewTask = (): NewTaskRow => ({
  name: "",
  start_date: "",
  duration_days: 1,
  duration_type: "calendar",
  end_date: "",
  parent_id: null,
});

export function GanttChart({
  tasks,
  taskTree,
  holidays,
  onUpdateTask,
  onAddTask,
  onDeleteTask,
  onAddDependency,
  onRemoveDependency,
  onReorderTask,
  isAdmin = false,
  onExportPDF,
}: GanttChartProps) {
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const didInitExpandRef = useRef(false);
  const [newTaskRow, setNewTaskRow] = useState<NewTaskRow | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [pendingDateEdit, setPendingDateEdit] = useState<{
    taskId: string;
    field: "start_date" | "end_date";
    newDate: string;
    hasOutgoing: boolean;
    hasIncoming: boolean;
  } | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  
  // Drag state for creating dependencies (bar drag to another task)
  const [dragSource, setDragSource] = useState<string | null>(null);
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  const [isDraggingBar, setIsDraggingBar] = useState(false);
  
  // State for bar manipulation (move/resize) - LOCAL PREVIEW ONLY
  const [barDragMode, setBarDragMode] = useState<BarDragMode>(null);
  const [barDragTaskId, setBarDragTaskId] = useState<string | null>(null);
  const [barDragStartX, setBarDragStartX] = useState<number>(0);
  const [barDragOriginalStart, setBarDragOriginalStart] = useState<string>("");
  const [barDragOriginalEnd, setBarDragOriginalEnd] = useState<string>("");
  // Preview state for visual feedback during drag (not persisted until mouseup)
  const [dragPreview, setDragPreview] = useState<{ start: string; end: string; duration: number } | null>(null);
  
  // Drag state for row reordering
  const [rowDragSource, setRowDragSource] = useState<string | null>(null);
  const [rowDragOverId, setRowDragOverId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<"above" | "below" | "into" | null>(null);
  
  const ganttAreaRef = useRef<HTMLDivElement>(null);

  const { minDate, maxDate } = useMemo(() => getGanttDateRange(tasks), [tasks]);

  const days = useMemo(() => {
    return eachDayOfInterval({ start: minDate, end: maxDate });
  }, [minDate, maxDate]);

  // Group days by month for header
  const monthGroups = useMemo(() => {
    const groups: Array<{ month: string; year: number; days: number; startIdx: number }> = [];
    let currentMonth = "";
    let currentYear = 0;
    let dayCount = 0;
    let startIdx = 0;

    days.forEach((day, idx) => {
      const month = format(day, "MMM", { locale: es });
      const year = day.getFullYear();
      const monthKey = `${month}-${year}`;

      if (monthKey !== currentMonth) {
        if (currentMonth) {
          groups.push({ month: currentMonth.split("-")[0], year: currentYear, days: dayCount, startIdx });
        }
        currentMonth = monthKey;
        currentYear = year;
        dayCount = 1;
        startIdx = idx;
      } else {
        dayCount++;
      }
    });

    if (currentMonth) {
      groups.push({ month: currentMonth.split("-")[0], year: currentYear, days: dayCount, startIdx });
    }

    return groups;
  }, [days]);

  const totalDays = days.length;

  useEffect(() => {
    if (newTaskRow && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [newTaskRow]);

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

  const allParentTaskIds = useMemo(() => {
    const ids: string[] = [];
    const collect = (list: GanttTask[]) => {
      list.forEach((t) => {
        if (t.children && t.children.length > 0) {
          ids.push(t.id);
          collect(t.children);
        }
      });
    };
    collect(taskTree);
    return ids;
  }, [taskTree]);

  // Default view: fully expanded — only initialize once when tasks first arrive,
  // so subsequent updates (date edits, completion toggles, etc.) preserve the
  // user's current expanded/collapsed state.
  useEffect(() => {
    if (!didInitExpandRef.current && allParentTaskIds.length > 0) {
      setExpandedTasks(new Set(allParentTaskIds));
      didInitExpandRef.current = true;
    }
  }, [allParentTaskIds]);

  const allExpanded = allParentTaskIds.length > 0 && allParentTaskIds.every((id) => expandedTasks.has(id));

  const toggleExpandAll = () => {
    if (allExpanded) {
      setExpandedTasks(new Set());
    } else {
      setExpandedTasks(new Set(allParentTaskIds));
    }
  };

  const visibleTasks = useMemo(() => {
    const result: Array<{ task: GanttTask; level: number }> = [];
    
    const addTasks = (tasks: GanttTask[], level: number) => {
      tasks.forEach((task) => {
        if (hideCompleted && task.status === "completed") return;
        result.push({ task, level });
        if (task.children && task.children.length > 0 && expandedTasks.has(task.id)) {
          addTasks(task.children, level + 1);
        }
      });
    };
    
    addTasks(taskTree, 0);
    return result;
  }, [taskTree, expandedTasks, hideCompleted]);

  // Map task IDs to their row index for arrow drawing
  const taskRowIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    visibleTasks.forEach(({ task }, idx) => {
      map.set(task.id, idx);
    });
    return map;
  }, [visibleTasks]);

  // Get task position - uses dragPreview for the task being dragged
  const getTaskPosition = useCallback((task: GanttTask) => {
    // Use preview state if this task is being dragged
    const isBeingDragged = barDragTaskId === task.id && dragPreview;
    const startDateStr = isBeingDragged ? dragPreview.start : task.start_date;
    const endDateStr = isBeingDragged ? dragPreview.end : task.end_date;
    
    if (!startDateStr || !endDateStr) {
      return { left: 0, width: 0, visible: false };
    }

    const startDate = parseISO(startDateStr);
    const endDate = parseISO(endDateStr);
    
    const startOffset = differenceInDays(startDate, minDate);
    const duration = differenceInDays(endDate, startDate) + 1;
    
    return {
      left: startOffset * DAY_WIDTH,
      width: duration * DAY_WIDTH,
      visible: true,
    };
  }, [barDragTaskId, dragPreview, minDate]);

  // Calculate dependency arrows data
  const dependencyArrows = useMemo(() => {
    const arrows: Array<{
      id: string;
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      parentTaskId: string;
      childTaskId: string;
    }> = [];

    const HEADER_OFFSET = TASK_NAME_WIDTH + DATE_COL_WIDTH + DURATION_COL_WIDTH + DATE_COL_WIDTH + PROGRESS_COL_WIDTH + 6; // +6 for grip handle

    visibleTasks.forEach(({ task }, rowIdx) => {
      if (!task.dependencies || task.dependencies.length === 0) return;

      const taskPosition = getTaskPosition(task);
      if (!taskPosition.visible) return;

      task.dependencies.forEach((dep) => {
        const parentRowIdx = taskRowIndexMap.get(dep.depends_on_task_id);
        if (parentRowIdx === undefined) return;

        const parentTask = tasks.find(t => t.id === dep.depends_on_task_id);
        if (!parentTask) return;

        const parentPosition = getTaskPosition(parentTask);
        if (!parentPosition.visible) return;

        // Shift the whole arrow to the RIGHT so it starts just to the right of
        // the parent's vertical edge, and the arrowhead lands ~50% over the
        // dependent task bar.
        const fromX = HEADER_OFFSET + parentPosition.left + parentPosition.width + 8;
        const fromY = parentRowIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
        const toX = HEADER_OFFSET + taskPosition.left + Math.min(Math.max(taskPosition.width / 2, 10), 24);
        const toY = rowIdx * ROW_HEIGHT + ROW_HEIGHT / 2;

        arrows.push({
          id: dep.id,
          fromX,
          fromY,
          toX,
          toY,
          parentTaskId: dep.depends_on_task_id,
          childTaskId: task.id,
        });
      });
    });

    return arrows;
  }, [visibleTasks, taskRowIndexMap, tasks, getTaskPosition]);

  const isHolidayDate = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return holidays.some((h) => h.date === dateStr);
  };

  const handleAddNewRow = (parentId: string | null = null) => {
    const empty = createEmptyNewTask();
    setNewTaskRow({ ...empty, parent_id: parentId });
    if (parentId) {
      setExpandedTasks((prev) => {
        const next = new Set(prev);
        next.add(parentId);
        return next;
      });
    }
  };

  const handleNewTaskChange = (field: keyof NewTaskRow, value: any) => {
    if (!newTaskRow) return;
    
    const updated = { ...newTaskRow, [field]: value };
    
    // Auto-calculate dates based on which field was set first
    if (field === "start_date" && updated.start_date && updated.duration_days > 0) {
      // Start date set/changed → calculate end date
      const endDate = calculateEndDate(updated.start_date, updated.duration_days, updated.duration_type, holidays);
      updated.end_date = format(endDate, "yyyy-MM-dd");
    } else if (field === "end_date" && updated.end_date && updated.duration_days > 0) {
      // End date set/changed → calculate start date (subtract duration)
      const startDate = calculateStartDate(updated.end_date, updated.duration_days, updated.duration_type, holidays);
      updated.start_date = format(startDate, "yyyy-MM-dd");
    } else if (field === "duration_days" && value > 0) {
      // Duration changed → if start date exists, calculate end; otherwise if end exists, calculate start
      if (updated.start_date) {
        const endDate = calculateEndDate(updated.start_date, value, updated.duration_type, holidays);
        updated.end_date = format(endDate, "yyyy-MM-dd");
      } else if (updated.end_date) {
        const startDate = calculateStartDate(updated.end_date, value, updated.duration_type, holidays);
        updated.start_date = format(startDate, "yyyy-MM-dd");
      }
    } else if (field === "duration_type") {
      // Duration type changed → recalculate based on priority (start date takes precedence)
      if (updated.start_date && updated.duration_days > 0) {
        const endDate = calculateEndDate(updated.start_date, updated.duration_days, updated.duration_type, holidays);
        updated.end_date = format(endDate, "yyyy-MM-dd");
      } else if (updated.end_date && updated.duration_days > 0) {
        const startDate = calculateStartDate(updated.end_date, updated.duration_days, updated.duration_type, holidays);
        updated.start_date = format(startDate, "yyyy-MM-dd");
      }
    }
    
    setNewTaskRow(updated);
  };

  const handleSaveNewTask = async () => {
    if (!newTaskRow || !newTaskRow.name.trim()) return;
    
    setIsSaving(true);
    try {
      await onAddTask(
        newTaskRow.name,
        newTaskRow.parent_id,
        {
          start_date: newTaskRow.start_date || null,
          end_date: newTaskRow.end_date || null,
          duration_days: newTaskRow.duration_days,
          duration_type: newTaskRow.duration_type,
        }
      );
      // If new task is a child, extend ancestors to fit (min/max)
      if (newTaskRow.parent_id && newTaskRow.start_date && newTaskRow.end_date) {
        await syncAncestorsDates(newTaskRow.parent_id);
      }
      setNewTaskRow(createEmptyNewTask());
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && newTaskRow?.name.trim()) {
      handleSaveNewTask();
    } else if (e.key === "Escape") {
      setNewTaskRow(null);
    }
  };

  // Drag handlers for creating dependencies (bar drag)
  const handleBarDragStart = (taskId: string) => {
    setDragSource(taskId);
    setIsDraggingBar(true);
  };

  const handleBarDragOver = (e: React.DragEvent, taskId: string) => {
    e.preventDefault();
    if (dragSource && dragSource !== taskId) {
      setDragTarget(taskId);
    }
  };

  const handleBarDragLeave = () => {
    setDragTarget(null);
  };

  const handleBarDrop = async (targetTaskId: string) => {
    if (dragSource && dragSource !== targetTaskId) {
      // Create dependency: targetTask depends on dragSource
      await onAddDependency(targetTaskId, dragSource);
    }
    setDragSource(null);
    setDragTarget(null);
    setIsDraggingBar(false);
  };

  const handleBarDragEnd = () => {
    setDragSource(null);
    setDragTarget(null);
    setIsDraggingBar(false);
  };

  // Row drag handlers for reordering
  const handleRowDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", taskId);
    setRowDragSource(taskId);
  };

  // Sync all ancestors' dates to encompass their children (min start / max end)
  const syncAncestorsDates = async (
    startParentId: string | null,
    overrides: Map<string, { start_date?: string | null; end_date?: string | null; parent_id?: string | null }> = new Map()
  ) => {
    let currentParentId = startParentId;
    while (currentParentId) {
      const parent = tasks.find((t) => t.id === currentParentId);
      if (!parent) break;
      const allTasks = tasks.map((t) => {
        const ov = overrides.get(t.id);
        return ov ? { ...t, ...ov } : t;
      });
      const children = allTasks.filter((t) => t.parent_id === currentParentId);
      const starts = children.map((c) => c.start_date).filter(Boolean) as string[];
      const ends = children.map((c) => c.end_date).filter(Boolean) as string[];
      if (starts.length === 0 || ends.length === 0) break;
      const minStart = starts.sort()[0];
      const maxEnd = ends.sort()[ends.length - 1];
      const updates: Partial<GanttTask> = {};
      if (parent.start_date !== minStart) updates.start_date = minStart;
      if (parent.end_date !== maxEnd) updates.end_date = maxEnd;
      if (Object.keys(updates).length > 0) {
        updates.duration_days = differenceInDays(parseISO(maxEnd), parseISO(minStart)) + 1;
        await onUpdateTask(parent.id, updates, { skipPropagation: true });
        overrides.set(parent.id, { start_date: minStart, end_date: maxEnd });
      }
      currentParentId = parent.parent_id;
    }
  };

  const handleRowDragOver = (e: React.DragEvent, taskId: string) => {
    e.preventDefault();
    if (!rowDragSource || rowDragSource === taskId) return;
    
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const ratio = y / rect.height;
    let pos: "above" | "into" | "below";
    if (ratio < 0.25) pos = "above";
    else if (ratio > 0.75) pos = "below";
    else pos = "into";
    
    setRowDragOverId(taskId);
    setDropPosition(pos);
  };

  const handleRowDragLeave = () => {
    setRowDragOverId(null);
    setDropPosition(null);
  };

  const handleRowDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (!rowDragSource || !rowDragOverId || rowDragSource === rowDragOverId) {
      handleRowDragEnd();
      return;
    }

    // Prevent dropping into own descendant
    const isDescendant = (potentialAncestorId: string, candidateId: string): boolean => {
      let current = tasks.find((t) => t.id === candidateId);
      while (current?.parent_id) {
        if (current.parent_id === potentialAncestorId) return true;
        current = tasks.find((t) => t.id === current!.parent_id);
      }
      return false;
    };

    // REPARENTING: drop "into" => set new parent
    if (dropPosition === "into") {
      if (isDescendant(rowDragSource, rowDragOverId)) {
        handleRowDragEnd();
        return;
      }
      const sourceTask = tasks.find((t) => t.id === rowDragSource);
      const newParent = tasks.find((t) => t.id === rowDragOverId);
      if (!sourceTask || !newParent) {
        handleRowDragEnd();
        return;
      }
      const oldParentId = sourceTask.parent_id;
      const updates: Partial<GanttTask> = { parent_id: rowDragOverId };
      // Inherit color from new parent if source had no custom color
      if (!sourceTask.color && newParent.color) {
        updates.color = newParent.color;
      }
      await onUpdateTask(rowDragSource, updates, { skipPropagation: true });
      // Sync new ancestors (extend to fit) and old ancestors (shrink if needed)
      await syncAncestorsDates(rowDragOverId);
      if (oldParentId && oldParentId !== rowDragOverId) {
        await syncAncestorsDates(oldParentId);
      }
      handleRowDragEnd();
      return;
    }

    // REORDER: drop above/below
    const flatTaskIds = visibleTasks.map(vt => vt.task.id);
    const sourceIdx = flatTaskIds.indexOf(rowDragSource);
    const targetIdx = flatTaskIds.indexOf(rowDragOverId);
    
    if (sourceIdx === -1 || targetIdx === -1) {
      handleRowDragEnd();
      return;
    }

    const newOrder = [...flatTaskIds];
    newOrder.splice(sourceIdx, 1);
    const insertIdx = dropPosition === "above" 
      ? (targetIdx > sourceIdx ? targetIdx - 1 : targetIdx)
      : (targetIdx > sourceIdx ? targetIdx : targetIdx + 1);
    newOrder.splice(insertIdx, 0, rowDragSource);

    await onReorderTask(rowDragSource, insertIdx, newOrder);
    handleRowDragEnd();
  };

  const handleRowDragEnd = () => {
    setRowDragSource(null);
    setRowDragOverId(null);
    setDropPosition(null);
  };

  // Bar manipulation handlers (move/resize)
  const handleBarMouseDown = (
    e: React.MouseEvent, 
    task: GanttTask, 
    mode: "move" | "resize-left" | "resize-right"
  ) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!task.start_date || !task.end_date) return;
    
    setBarDragMode(mode);
    setBarDragTaskId(task.id);
    setBarDragStartX(e.clientX);
    setBarDragOriginalStart(task.start_date);
    setBarDragOriginalEnd(task.end_date);
  };

  const handleBarMouseMove = useCallback((e: MouseEvent) => {
    if (!barDragMode || !barDragTaskId) return;
    
    const deltaX = e.clientX - barDragStartX;
    const deltaDays = Math.round(deltaX / DAY_WIDTH);
    
    const originalStart = parseISO(barDragOriginalStart);
    const originalEnd = parseISO(barDragOriginalEnd);
    
    let newStart: Date;
    let newEnd: Date;
    let newDuration = differenceInDays(originalEnd, originalStart) + 1;
    
    if (barDragMode === "move") {
      // Move entire bar - keep duration same
      newStart = addDays(originalStart, deltaDays);
      newEnd = addDays(originalEnd, deltaDays);
    } else if (barDragMode === "resize-left") {
      // Resize from left - change start, keep end
      newStart = addDays(originalStart, deltaDays);
      newEnd = originalEnd;
      newDuration = differenceInDays(newEnd, newStart) + 1;
      if (newDuration < 1) return; // Prevent negative duration
    } else {
      // Resize from right - keep start, change end
      newStart = originalStart;
      newEnd = addDays(originalEnd, deltaDays);
      newDuration = differenceInDays(newEnd, newStart) + 1;
      if (newDuration < 1) return; // Prevent negative duration
    }
    
    // Only update local preview state - NO database calls during drag
    setDragPreview({
      start: format(newStart, "yyyy-MM-dd"),
      end: format(newEnd, "yyyy-MM-dd"),
      duration: newDuration,
    });
  }, [barDragMode, barDragTaskId, barDragStartX, barDragOriginalStart, barDragOriginalEnd]);

  const handleBarMouseUp = useCallback(async () => {
    // Persist to database ONLY on mouseup
    if (barDragTaskId && dragPreview) {
      const draggedTask = tasks.find((t) => t.id === barDragTaskId);
      const originalStart = draggedTask?.start_date ?? null;
      const originalEnd = draggedTask?.end_date ?? null;
      const newStart = dragPreview.start;
      const newEnd = dragPreview.end;

      await onUpdateTask(barDragTaskId, {
        start_date: newStart,
        end_date: newEnd,
        duration_days: dragPreview.duration,
      });

      // 1) Cascade DOWN to children sharing the dragged edge (only on resize, not move)
      if (draggedTask && (barDragMode === "resize-left" || barDragMode === "resize-right")) {
        const children = tasks.filter((t) => t.parent_id === barDragTaskId);
        for (const child of children) {
          const updates: Partial<GanttTask> = {};
          if (barDragMode === "resize-left" && originalStart && child.start_date === originalStart && newStart !== originalStart) {
            updates.start_date = newStart;
            if (child.end_date) {
              updates.duration_days = differenceInDays(parseISO(child.end_date), parseISO(newStart)) + 1;
            }
          }
          if (barDragMode === "resize-right" && originalEnd && child.end_date === originalEnd && newEnd !== originalEnd) {
            updates.end_date = newEnd;
            if (child.start_date) {
              updates.duration_days = differenceInDays(parseISO(newEnd), parseISO(child.start_date)) + 1;
            }
          }
          if (Object.keys(updates).length > 0) {
            await onUpdateTask(child.id, updates, { skipPropagation: true });
          }
        }
      }

      // 2) Cascade UP: sync ancestors to min(start)/max(end) of their children
      let currentParentId = draggedTask?.parent_id ?? null;
      while (currentParentId) {
        const parent = tasks.find((t) => t.id === currentParentId);
        if (!parent) break;
        const siblings = tasks.filter((t) => t.parent_id === currentParentId);
        // Use the just-updated values for the dragged task
        const effectiveSiblings = siblings.map((s) =>
          s.id === barDragTaskId ? { ...s, start_date: newStart, end_date: newEnd } : s
        );
        const starts = effectiveSiblings.map((s) => s.start_date).filter(Boolean) as string[];
        const ends = effectiveSiblings.map((s) => s.end_date).filter(Boolean) as string[];
        if (starts.length === 0 || ends.length === 0) break;
        const minStart = starts.sort()[0];
        const maxEnd = ends.sort()[ends.length - 1];
        const updates: Partial<GanttTask> = {};
        if (parent.start_date !== minStart) updates.start_date = minStart;
        if (parent.end_date !== maxEnd) updates.end_date = maxEnd;
        if (Object.keys(updates).length > 0) {
          updates.duration_days = differenceInDays(parseISO(maxEnd), parseISO(minStart)) + 1;
          await onUpdateTask(parent.id, updates, { skipPropagation: true });
        }
        currentParentId = parent.parent_id;
      }
    }
    
    // Reset all drag state
    setBarDragMode(null);
    setBarDragTaskId(null);
    setBarDragStartX(0);
    setBarDragOriginalStart("");
    setBarDragOriginalEnd("");
    setDragPreview(null);
  }, [barDragTaskId, barDragMode, dragPreview, onUpdateTask, tasks]);

  // Add global mouse listeners for bar drag
  useEffect(() => {
    if (barDragMode) {
      window.addEventListener("mousemove", handleBarMouseMove);
      window.addEventListener("mouseup", handleBarMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleBarMouseMove);
        window.removeEventListener("mouseup", handleBarMouseUp);
      };
    }
  }, [barDragMode, handleBarMouseMove, handleBarMouseUp]);

  // Check if any descendant in the tree depends on this task (incoming for someone else)
  const hasOutgoingDependents = useCallback((taskId: string) => {
    return tasks.some((t) => t.dependencies?.some((d) => d.depends_on_task_id === taskId));
  }, [tasks]);

  const hasIncomingDependencies = useCallback((taskId: string) => {
    const t = tasks.find((x) => x.id === taskId);
    return !!(t?.dependencies && t.dependencies.length > 0);
  }, [tasks]);

  const performDateUpdate = async (
    taskId: string,
    field: "start_date" | "end_date",
    value: string,
    options?: { skipPropagation?: boolean; breakDependencies?: boolean }
  ) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const updates: Partial<GanttTask> = { [field]: value };
    if (field === "start_date" && value && task.duration_days) {
      const endDate = calculateEndDate(value, task.duration_days, task.duration_type as "calendar" | "business", holidays);
      updates.end_date = format(endDate, "yyyy-MM-dd");
    } else if (field === "end_date" && value && task.duration_days) {
      const startDate = calculateStartDate(value, task.duration_days, task.duration_type as "calendar" | "business", holidays);
      updates.start_date = format(startDate, "yyyy-MM-dd");
    }
    await onUpdateTask(taskId, updates, options);
  };

  const handleUpdateTaskField = async (taskId: string, field: string, value: any) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    // Date-field edits with dependencies → ask the user
    if ((field === "start_date" || field === "end_date") && value) {
      const outgoing = hasOutgoingDependents(taskId);
      const incoming = hasIncomingDependencies(taskId);
      if (outgoing || incoming) {
        setPendingDateEdit({
          taskId,
          field: field as "start_date" | "end_date",
          newDate: value,
          hasOutgoing: outgoing,
          hasIncoming: incoming,
        });
        return;
      }
    }

    const updates: Partial<GanttTask> = { [field]: value };
    if (field === "start_date" && value && task.duration_days) {
      const endDate = calculateEndDate(value, task.duration_days, task.duration_type as "calendar" | "business", holidays);
      updates.end_date = format(endDate, "yyyy-MM-dd");
    } else if (field === "end_date" && value && task.duration_days) {
      const startDate = calculateStartDate(value, task.duration_days, task.duration_type as "calendar" | "business", holidays);
      updates.start_date = format(startDate, "yyyy-MM-dd");
    } else if (field === "duration_days" && task.start_date && value > 0) {
      const endDate = calculateEndDate(task.start_date, value, task.duration_type as "calendar" | "business", holidays);
      updates.end_date = format(endDate, "yyyy-MM-dd");
    }

    await onUpdateTask(taskId, updates);
  };

  const toggleTaskCompleted = async (task: GanttTask) => {
    const newStatus = task.status === "completed" ? "pending" : "completed";
    const newProgress = newStatus === "completed" ? 100 : 0;

    // Collect all descendants recursively
    const collectDescendants = (parentId: string): GanttTask[] => {
      const direct = tasks.filter((t) => t.parent_id === parentId);
      return direct.flatMap((c) => [c, ...collectDescendants(c.id)]);
    };

    // 1. Update the task itself
    await onUpdateTask(task.id, { status: newStatus, progress: newProgress });

    // 2. Cascade DOWN: update all descendants to match
    const descendants = collectDescendants(task.id);
    await Promise.all(
      descendants
        .filter((d) => d.status !== newStatus)
        .map((d) => onUpdateTask(d.id, { status: newStatus, progress: newProgress }))
    );

    // 3. Cascade UP: walk ancestors; if all siblings are completed, mark parent completed.
    //    If any sibling is not completed, mark parent pending.
    let currentParentId = task.parent_id;
    while (currentParentId) {
      const parent = tasks.find((t) => t.id === currentParentId);
      if (!parent) break;
      const siblings = tasks.filter((t) => t.parent_id === currentParentId);
      // Account for the changes we just applied (task + descendants)
      const updatedIds = new Set<string>([task.id, ...descendants.map((d) => d.id)]);
      const allCompleted = siblings.every((s) =>
        updatedIds.has(s.id) ? newStatus === "completed" : s.status === "completed"
      );
      const desiredParentStatus = allCompleted ? "completed" : "pending";
      const desiredParentProgress = allCompleted ? 100 : 0;
      if (parent.status !== desiredParentStatus) {
        await onUpdateTask(parent.id, { status: desiredParentStatus, progress: desiredParentProgress });
        updatedIds.add(parent.id);
      } else if (!allCompleted && newStatus === "pending" && parent.status === "completed") {
        // already handled above
      }
      currentParentId = parent.parent_id;
    }
  };

  // Map id -> task for parent lookups
  const taskById = useMemo(() => {
    const m = new Map<string, GanttTask>();
    tasks.forEach((t) => m.set(t.id, t));
    return m;
  }, [tasks]);

  // Resolve effective color: own color, else inherit from nearest ancestor (lightened 50% per generation gap)
  const getEffectiveColor = useCallback((task: GanttTask): { color: string | null; inherited: boolean } => {
    if (task.color) return { color: task.color, inherited: false };
    let current = task.parent_id ? taskById.get(task.parent_id) : null;
    while (current) {
      if (current.color) return { color: lightenHex(current.color, 0.5), inherited: true };
      current = current.parent_id ? taskById.get(current.parent_id) : null;
    }
    return { color: null, inherited: false };
  }, [taskById]);

  const handleSetColor = async (taskId: string, color: string | null) => {
    await onUpdateTask(taskId, { color } as Partial<GanttTask>, { skipPropagation: true });
  };

  // Get unique task dates for quick selection
  const taskDates = useMemo(() => {
    const dates: Array<{ date: string; taskName: string; type: "start" | "end" }> = [];
    tasks.forEach((task) => {
      if (task.start_date) {
        dates.push({ date: task.start_date, taskName: task.name, type: "start" });
      }
      if (task.end_date) {
        dates.push({ date: task.end_date, taskName: task.name, type: "end" });
      }
    });
    // Sort by date and remove duplicates by date
    const uniqueDates = dates.reduce((acc, curr) => {
      if (!acc.find((d) => d.date === curr.date)) {
        acc.push(curr);
      }
      return acc;
    }, [] as typeof dates);
    return uniqueDates.sort((a, b) => a.date.localeCompare(b.date));
  }, [tasks]);

  // DatePickerCell is now defined outside the component

  return (
    <div className="border rounded-lg overflow-hidden bg-background">
      <ScrollArea className="w-full">
        <div className="min-w-fit">
          {/* Month/Year Header */}
          <div className="flex border-b bg-muted/70 sticky top-0 z-30">
            <div className="flex-shrink-0 border-r" style={{ width: 24 + TASK_NAME_WIDTH + DATE_COL_WIDTH + DURATION_COL_WIDTH + DATE_COL_WIDTH + PROGRESS_COL_WIDTH }}>
              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground flex items-center justify-between gap-1 flex-wrap">
                <span>Cronograma</span>
                <div className="flex items-center gap-1">
                  {allParentTaskIds.length > 0 && (
                    <Button
                      size="sm"
                      className="h-6 px-2 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={toggleExpandAll}
                      title={allExpanded ? "Contraer todo" : "Expandir todo"}
                    >
                      {allExpanded ? (
                        <><ChevronDown className="h-3 w-3 mr-1" />Contraer</>
                      ) : (
                        <><ChevronRight className="h-3 w-3 mr-1" />Expandir</>
                      )}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setHideCompleted((v) => !v)}
                    title={hideCompleted ? "Mostrar completadas" : "Ocultar completadas"}
                  >
                    {hideCompleted ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  </Button>
                  {onExportPDF && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => onExportPDF(hideCompleted)}
                      title="Exportar PDF"
                    >
                      <FileDown className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
            {/* Month groups */}
            <div className="flex">
              {monthGroups.map((group, idx) => (
                <div
                  key={idx}
                  className="flex-shrink-0 border-r text-center text-xs font-semibold py-1 bg-muted/50"
                  style={{ width: group.days * DAY_WIDTH }}
                >
                  <span className="capitalize">{group.month}</span>
                  <span className="text-muted-foreground ml-1">{group.year}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex border-b bg-muted/50 sticky top-6 z-20">
            <div className="flex-shrink-0 w-6" /> {/* Grip handle space */}
            <div className="flex-shrink-0 border-r px-2 py-2 font-medium text-xs" style={{ width: TASK_NAME_WIDTH - 6 }}>
              Tarea
            </div>
            <div className="flex-shrink-0 border-r px-2 py-2 font-medium text-xs text-center" style={{ width: DATE_COL_WIDTH }}>
              Inicio
            </div>
            <div className="flex-shrink-0 border-r px-2 py-2 font-medium text-xs text-center" style={{ width: DURATION_COL_WIDTH }}>
              Plazo
            </div>
            <div className="flex-shrink-0 border-r px-2 py-2 font-medium text-xs text-center" style={{ width: DATE_COL_WIDTH }}>
              Término
            </div>
            <div className="flex-shrink-0 border-r px-2 py-2 font-medium text-xs text-center" style={{ width: PROGRESS_COL_WIDTH }}>
              % Avance
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
                            "flex-shrink-0 text-right pr-1 text-xs py-1 border-r",
                            isWeekendDay && "bg-muted/80",
                            isHoliday && "bg-red-100 dark:bg-red-900/20",
                            isToday && "bg-primary/10 font-bold"
                          )}
                          style={{ width: DAY_WIDTH }}
                        >
                          <div className="font-medium text-[10px] leading-tight">
                            {format(day, "d")}
                          </div>
                          <div className="text-muted-foreground text-[8px] leading-tight">
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

          {/* Task rows with dependency arrows overlay */}
          <div className="relative">
            {/* Today vertical highlight - overlays bar area only */}
            {(() => {
              const todayStr = format(new Date(), "yyyy-MM-dd");
              const todayIdx = days.findIndex((d) => format(d, "yyyy-MM-dd") === todayStr);
              if (todayIdx < 0) return null;
              const HEADER_OFFSET = TASK_NAME_WIDTH + DATE_COL_WIDTH + DURATION_COL_WIDTH + DATE_COL_WIDTH + PROGRESS_COL_WIDTH + 6;
              return (
                <div
                  className="absolute top-0 pointer-events-none z-[5] bg-primary/10 border-l border-r border-primary/40"
                  style={{
                    left: HEADER_OFFSET + todayIdx * DAY_WIDTH,
                    width: DAY_WIDTH,
                    height: visibleTasks.length * ROW_HEIGHT + (newTaskRow ? ROW_HEIGHT : 0) + ROW_HEIGHT,
                  }}
                />
              );
            })()}
            {/* SVG overlay for dependency arrows - clickable to delete */}
            {dependencyArrows.length > 0 && (
              <svg
                className="absolute inset-0 z-10 pointer-events-none"
                style={{
                  width: "100%",
                  height: visibleTasks.length * ROW_HEIGHT,
                  overflow: "visible",
                }}
              >
                <defs>
                  <marker
                    id="arrowhead"
                    markerWidth="8"
                    markerHeight="6"
                    refX="7"
                    refY="3"
                    orient="auto"
                  >
                    <polygon
                      points="0 0, 8 3, 0 6"
                      className="fill-primary"
                    />
                  </marker>
                  <marker
                    id="arrowhead-hover"
                    markerWidth="8"
                    markerHeight="6"
                    refX="7"
                    refY="3"
                    orient="auto"
                  >
                    <polygon
                      points="0 0, 8 3, 0 6"
                      className="fill-destructive"
                    />
                  </marker>
                </defs>
                {dependencyArrows.map((arrow) => {
                  // The arrow must ALWAYS arrive at the left edge of the dependent task
                  // pointing forward (→). If the child starts before the parent ends,
                  // the path loops vertically and around so the arrow still enters from the left.
                  // Routing guarantees:
                  //  1) Always exits the parent bar with a horizontal segment to the RIGHT (SOURCE_LEAD).
                  //  2) Always arrives at the arrow tip with a horizontal segment from the LEFT (HORIZ_LEAD).
                  const SOURCE_LEAD = 24; // forced horizontal exit to the right of parent (50% of previous)
                  const HORIZ_LEAD = 28;  // forced horizontal lead-in to the arrow tip (50% of previous)
                  const VERT_GAP = ROW_HEIGHT / 2 - 2;

                  const exitX = arrow.fromX + SOURCE_LEAD;
                  const approachX = arrow.toX - HORIZ_LEAD;

                  let pathD: string;
                  if (approachX >= exitX) {
                    // Normal forward case: exit right, drop, then approach left → tip
                    pathD = `M ${arrow.fromX} ${arrow.fromY}
                             L ${exitX} ${arrow.fromY}
                             L ${exitX} ${arrow.toY}
                             L ${arrow.toX} ${arrow.toY}`;
                  } else {
                    // Tight/backward case: exit right, detour vertically, come back left to approachX, then approach → tip
                    const goingDown = arrow.toY >= arrow.fromY;
                    const detourY = goingDown ? arrow.fromY + VERT_GAP : arrow.fromY - VERT_GAP;
                    pathD = `M ${arrow.fromX} ${arrow.fromY}
                             L ${exitX} ${arrow.fromY}
                             L ${exitX} ${detourY}
                             L ${approachX} ${detourY}
                             L ${approachX} ${arrow.toY}
                             L ${arrow.toX} ${arrow.toY}`;
                  }
                  
                  return (
                    <g key={arrow.id} className="group/arrow">
                      {/* Visible arrow path - click handled via midpoint circle below */}
                      <path
                        d={pathD}
                        fill="none"
                        className="stroke-primary group-hover/arrow:stroke-destructive transition-colors pointer-events-none"
                        strokeWidth="2"
                        markerEnd="url(#arrowhead)"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {/* Tooltip on hover - delete icon at midpoint */}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <circle
                              cx={(arrow.fromX + arrow.toX) / 2}
                              cy={(arrow.fromY + arrow.toY) / 2}
                              r="8"
                              className="fill-background stroke-muted-foreground opacity-0 group-hover/arrow:opacity-100 cursor-pointer pointer-events-auto transition-opacity"
                              strokeWidth="1"
                              onClick={() => onRemoveDependency(arrow.id)}
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Clic para eliminar dependencia</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      {/* X icon inside circle */}
                      <g 
                        className="opacity-0 group-hover/arrow:opacity-100 pointer-events-none transition-opacity"
                        transform={`translate(${(arrow.fromX + arrow.toX) / 2}, ${(arrow.fromY + arrow.toY) / 2})`}
                      >
                        <line x1="-3" y1="-3" x2="3" y2="3" className="stroke-destructive" strokeWidth="1.5" />
                        <line x1="3" y1="-3" x2="-3" y2="3" className="stroke-destructive" strokeWidth="1.5" />
                      </g>
                    </g>
                  );
                })}
              </svg>
            )}

            {/* Task rows */}
            {visibleTasks.map(({ task, level }) => {
              const hasChildren = task.children && task.children.length > 0;
              const isExpanded = expandedTasks.has(task.id);
              const position = getTaskPosition(task);
              const effective = getEffectiveColor(task);
              
              return (
                <ContextMenu key={task.id}>
                  <ContextMenuTrigger asChild>
                    <div
                      draggable
                      onDragStart={(e) => handleRowDragStart(e, task.id)}
                      onDragOver={(e) => handleRowDragOver(e, task.id)}
                      onDragLeave={handleRowDragLeave}
                      onDrop={handleRowDrop}
                      onDragEnd={handleRowDragEnd}
                      className={cn(
                        "flex border-b hover:bg-muted/20 transition-colors group",
                        rowDragSource === task.id && "opacity-50 bg-muted",
                        rowDragOverId === task.id && dropPosition === "above" && "border-t-2 border-t-primary",
                        rowDragOverId === task.id && dropPosition === "below" && "border-b-2 border-b-primary",
                        rowDragOverId === task.id && dropPosition === "into" && "ring-2 ring-inset ring-primary bg-primary/10",
                        task.status === "completed" && "bg-muted/30"
                      )}
                      style={{ height: ROW_HEIGHT }}
                    >
                  {/* Drag handle */}
                  <div className="flex-shrink-0 flex items-center justify-center w-6 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                  </div>

                  {/* Task name */}
                  <div
                    className="flex-shrink-0 border-r px-1 flex items-center gap-1 overflow-hidden"
                    style={{ width: TASK_NAME_WIDTH - 6, paddingLeft: 4 + level * 12 }}
                  >
                    {hasChildren ? (
                      <button
                        onClick={() => toggleExpand(task.id)}
                        className="p-0.5 hover:bg-muted rounded flex-shrink-0"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                      </button>
                    ) : (
                      <span className="w-4 flex-shrink-0" />
                    )}
                    <Input
                      value={task.name}
                      onChange={(e) => handleUpdateTaskField(task.id, "name", e.target.value)}
                      className={cn(
                        "h-7 text-xs border-0 bg-transparent focus:bg-background px-1",
                        task.status === "completed" && "line-through text-muted-foreground"
                      )}
                      onDragStart={(e) => e.stopPropagation()}
                      draggable={false}
                    />
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            "flex-shrink-0 rounded hover:bg-muted p-0.5",
                            !(task.dependencies && task.dependencies.length > 0) && "opacity-0 group-hover:opacity-100"
                          )}
                          title={task.dependencies && task.dependencies.length > 0 ? "Ver/editar dependencias" : "Agregar dependencia"}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link className="h-3 w-3 text-muted-foreground" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-72 p-2 z-50 bg-popover" align="start">
                        <p className="text-xs font-medium mb-1.5">Depende de:</p>
                        {task.dependencies && task.dependencies.length > 0 ? (
                          <ul className="space-y-2 mb-2">
                            {task.dependencies.map((dep) => {
                              const currentDeps = task.dependencies?.map((d) => d.depends_on_task_id) ?? [];
                              const options = tasks
                                .filter(
                                  (t) =>
                                    t.id !== task.id &&
                                    (t.id === dep.depends_on_task_id || !currentDeps.includes(t.id))
                                )
                                .map((t) => ({ value: t.id, label: t.name }));
                              return (
                                <li key={dep.id} className="flex items-center gap-1">
                                  <div className="flex-1 min-w-0">
                                    <SearchableSelect
                                      value={dep.depends_on_task_id}
                                      onValueChange={async (newParentId) => {
                                        if (newParentId && newParentId !== dep.depends_on_task_id) {
                                          await onRemoveDependency(dep.id);
                                          await onAddDependency(task.id, newParentId);
                                        }
                                      }}
                                      options={options}
                                      placeholder="Seleccionar tarea..."
                                      searchPlaceholder="Buscar tarea..."
                                      triggerClassName="h-7 text-xs"
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    className="text-destructive hover:underline text-[10px] flex-shrink-0 px-1"
                                    onClick={() => onRemoveDependency(dep.id)}
                                  >
                                    Quitar
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="text-[11px] text-muted-foreground mb-2">Sin dependencias</p>
                        )}
                        <div className="border-t pt-2">
                          <p className="text-[11px] font-medium mb-1">Agregar dependencia:</p>
                          {(() => {
                            const currentDeps = task.dependencies?.map((d) => d.depends_on_task_id) ?? [];
                            const addOptions = tasks
                              .filter((t) => t.id !== task.id && !currentDeps.includes(t.id))
                              .map((t) => ({ value: t.id, label: t.name }));
                            return (
                              <SearchableSelect
                                value=""
                                onValueChange={async (newParentId) => {
                                  if (newParentId) {
                                    await onAddDependency(task.id, newParentId);
                                  }
                                }}
                                options={addOptions}
                                placeholder="Buscar tarea predecesora..."
                                searchPlaceholder="Buscar tarea..."
                                triggerClassName="h-7 text-xs"
                              />
                            );
                          })()}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 flex-shrink-0"
                      onClick={() => toggleTaskCompleted(task)}
                      title={task.status === "completed" ? "Marcar como pendiente" : "Marcar como completada"}
                    >
                      <CheckCircle2
                        className={cn(
                          "h-3.5 w-3.5",
                          task.status === "completed" ? "text-primary" : "text-muted-foreground"
                        )}
                      />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 flex-shrink-0"
                      onClick={() => handleAddNewRow(task.id)}
                      title="Agregar tarea hija"
                    >
                      <Plus className="h-3 w-3 text-primary" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 flex-shrink-0"
                      onClick={() => onDeleteTask(task.id)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>

                  {/* Start date */}
                  <div className="flex-shrink-0 border-r flex items-center justify-center" style={{ width: DATE_COL_WIDTH }}>
                    <DatePickerCell
                      value={task.start_date}
                      onChange={(date) => handleUpdateTaskField(task.id, "start_date", date)}
                      placeholder="Inicio"
                      editable={isAdmin}
                    />
                  </div>

                  {/* Duration */}
                  <div className="flex-shrink-0 border-r flex items-center px-1" style={{ width: DURATION_COL_WIDTH }}>
                    <Input
                      type="number"
                      min={1}
                      value={task.duration_days || 1}
                      onChange={(e) => handleUpdateTaskField(task.id, "duration_days", parseInt(e.target.value) || 1)}
                      className="h-7 text-xs border-0 bg-transparent focus:bg-background text-center w-14 px-1"
                      onDragStart={(e) => e.stopPropagation()}
                      draggable={false}
                    />
                    <span className="text-[10px] text-muted-foreground">
                      {task.duration_type === "business" ? "háb" : "días"}
                    </span>
                  </div>

                  {/* End date */}
                  <div className="flex-shrink-0 border-r flex items-center justify-center" style={{ width: DATE_COL_WIDTH }}>
                    <DatePickerCell
                      value={task.end_date}
                      onChange={(date) => handleUpdateTaskField(task.id, "end_date", date)}
                      placeholder="Término"
                      editable={isAdmin}
                    />
                  </div>

                  {/* Progress % */}
                  <div className="flex-shrink-0 border-r flex items-center justify-center px-1" style={{ width: PROGRESS_COL_WIDTH }}>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={task.progress && task.progress > 0 ? task.progress : computeAutoProgress(task)}
                      onChange={(e) => {
                        const str = e.target.value;
                        if (str === "") {
                          onUpdateTask(task.id, { progress: null as any }, { skipPropagation: true });
                          return;
                        }
                        const raw = parseInt(str);
                        const value = isNaN(raw) ? 0 : Math.max(0, Math.min(100, raw));
                        const updates: Partial<GanttTask> = { progress: value };
                        if (value === 100) updates.status = "completed";
                        else if (task.status === "completed") updates.status = "in_progress";
                        onUpdateTask(task.id, updates, { skipPropagation: true });
                      }}
                      disabled={!isAdmin}
                      className="h-7 text-xs w-16 text-center px-1"
                      title="Se calcula automáticamente según la fecha actual. Escribe un valor para fijarlo manualmente."
                    />
                    <span className="text-xs text-muted-foreground ml-1">%</span>
                  </div>

                  {/* Gantt bar area */}
                  <div
                    className={cn(
                      "relative flex-1",
                      isDraggingBar && dragTarget === task.id && "bg-primary/20"
                    )}
                    style={{ width: totalDays * DAY_WIDTH }}
                    onDragOver={(e) => {
                      // Only handle bar drag here
                      if (dragSource) {
                        handleBarDragOver(e, task.id);
                      }
                    }}
                    onDragLeave={() => {
                      if (dragSource) {
                        handleBarDragLeave();
                      }
                    }}
                    onDrop={(e) => {
                      if (dragSource) {
                        e.stopPropagation();
                        handleBarDrop(task.id);
                      }
                      // else: let row drop handler (parent) handle it for reparent/reorder
                    }}
                  >
                    {/* Background grid */}
                    <div className="absolute inset-0 flex pointer-events-none">
                      {days.map((day, idx) => {
                        const isWeekendDay = isWeekend(day);
                        const isHoliday = isHolidayDate(day);
                        
                        return (
                          <div
                            key={idx}
                            className={cn(
                              "flex-shrink-0 border-r h-full",
                              isWeekendDay && "bg-muted/40",
                              isHoliday && "bg-red-50 dark:bg-red-900/10"
                            )}
                            style={{ width: DAY_WIDTH }}
                          />
                        );
                      })}
                    </div>

                    {/* Task bar with resize handles */}
                    {position.visible && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className={cn(
                                "absolute top-1.5 rounded h-6 transition-all shadow-sm group/bar",
                                !effective.color && getTaskStatusColor(task.status, task.end_date),
                                dragSource === task.id && "opacity-50 ring-2 ring-primary",
                                barDragTaskId === task.id && "ring-2 ring-primary"
                              )}
                              style={{
                                left: position.left,
                                width: Math.max(position.width - 4, 8),
                                ...(effective.color ? { backgroundColor: effective.color } : {}),
                              }}
                            >
                              {/* Left resize handle */}
                              <div
                                className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-10 hover:bg-white/30 rounded-l"
                                onMouseDown={(e) => handleBarMouseDown(e, task, "resize-left")}
                              />
                              
                              {/* Center area - for moving or creating dependencies */}
                              <div
                                className="absolute left-2 right-2 top-0 bottom-0 cursor-move"
                                onMouseDown={(e) => handleBarMouseDown(e, task, "move")}
                                draggable
                                onDragStart={(e) => {
                                  e.stopPropagation();
                                  handleBarDragStart(task.id);
                                }}
                                onDragEnd={(e) => {
                                  e.stopPropagation();
                                  handleBarDragEnd();
                                }}
                              />
                              
                              {/* Right resize handle */}
                              <div
                                className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-10 hover:bg-white/30 rounded-r"
                                onMouseDown={(e) => handleBarMouseDown(e, task, "resize-right")}
                              />
                              
                              {/* Progress line at bottom: blue < 100%, green at 100% */}
                              {(() => {
                                const effectiveProgress = task.progress && task.progress > 0 ? task.progress : computeAutoProgress(task);
                                if (effectiveProgress <= 0) return null;
                                const isComplete = effectiveProgress >= 100;
                                return (
                                  <div
                                    className={cn(
                                      "absolute left-0 bottom-0 h-1 rounded-b pointer-events-none transition-all",
                                      isComplete ? "bg-green-500" : "bg-blue-500"
                                    )}
                                    style={{ width: `${effectiveProgress}%` }}
                                  />
                                );
                              })()}

                              {/* Task name */}
                              <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white font-medium truncate px-3 pointer-events-none">
                                {position.width > 60 ? task.name : ""}
                              </span>
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
                              <p className="text-xs">Progreso: {task.progress && task.progress > 0 ? `${task.progress}% (manual)` : `${computeAutoProgress(task)}% (auto)`}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                Arrastra bordes para cambiar fechas • Centro para mover • A otra tarea para dependencia
                              </p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-48 bg-popover z-50">
                    <ContextMenuLabel className="flex items-center gap-2 text-xs">
                      <Palette className="h-3 w-3" /> Color de la tarea
                    </ContextMenuLabel>
                    <ContextMenuSeparator />
                    <div className="grid grid-cols-5 gap-1 p-2">
                      {TASK_COLORS.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          title={c.name}
                          onClick={() => handleSetColor(task.id, c.value)}
                          className={cn(
                            "h-6 w-6 rounded-md border border-border hover:scale-110 transition-transform",
                            task.color === c.value && "ring-2 ring-foreground ring-offset-1 ring-offset-popover"
                          )}
                          style={{ backgroundColor: c.value }}
                        />
                      ))}
                    </div>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      className="text-xs"
                      onClick={() => handleSetColor(task.id, null)}
                    >
                      Quitar color {task.parent_id ? "(heredar del padre)" : "(predeterminado)"}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}

            {/* New task row */}
            {newTaskRow && (
              <div
                className="flex border-b bg-primary/5"
                style={{ height: ROW_HEIGHT }}
                onKeyDown={handleKeyDown}
              >
                <div className="flex-shrink-0 w-6" /> {/* Grip handle space */}
                <div className="flex-shrink-0 border-r px-1 flex items-center gap-1" style={{ width: TASK_NAME_WIDTH - 6 }}>
                  <span className="w-4 flex-shrink-0" />
                  <Input
                    ref={nameInputRef}
                    value={newTaskRow.name}
                    onChange={(e) => handleNewTaskChange("name", e.target.value)}
                    placeholder="Nombre de la tarea..."
                    className="h-7 text-xs"
                  />
                </div>

                <div className="flex-shrink-0 border-r flex items-center justify-center" style={{ width: DATE_COL_WIDTH }}>
                  <DatePickerCell
                    value={newTaskRow.start_date || null}
                    onChange={(date) => handleNewTaskChange("start_date", date)}
                    placeholder="Inicio"
                    showTaskDates={true}
                    taskDates={taskDates}
                  />
                </div>

                <div className="flex-shrink-0 border-r flex items-center px-1 gap-1" style={{ width: DURATION_COL_WIDTH }}>
                  <Input
                    type="number"
                    min={1}
                    value={newTaskRow.duration_days}
                    onChange={(e) => handleNewTaskChange("duration_days", parseInt(e.target.value) || 1)}
                    className="h-7 text-xs w-10 text-center"
                  />
                  <Select
                    value={newTaskRow.duration_type}
                    onValueChange={(v: "calendar" | "business") => handleNewTaskChange("duration_type", v)}
                  >
                    <SelectTrigger className="h-7 w-12 text-[10px] px-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover">
                      <SelectItem value="calendar">días</SelectItem>
                      <SelectItem value="business">háb</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex-shrink-0 border-r flex items-center justify-center" style={{ width: DATE_COL_WIDTH }}>
                  <DatePickerCell
                    value={newTaskRow.end_date || null}
                    onChange={(date) => handleNewTaskChange("end_date", date)}
                    placeholder="Término"
                    showTaskDates={true}
                    taskDates={taskDates}
                  />
                </div>

                <div className="flex-shrink-0 border-r" style={{ width: PROGRESS_COL_WIDTH }} />

                <div className="flex items-center px-2 gap-2">
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={handleSaveNewTask}
                    disabled={!newTaskRow.name.trim() || isSaving}
                  >
                    {isSaving ? "..." : "Agregar"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => setNewTaskRow(null)}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            )}

            {/* Add task button row */}
            {!newTaskRow && (
              <div
                className="flex items-center border-b hover:bg-muted/20 cursor-pointer transition-colors"
                style={{ height: ROW_HEIGHT }}
                onClick={() => handleAddNewRow(null)}
              >
                <div className="flex-shrink-0 w-6" /> {/* Grip handle space */}
                <div className="flex items-center gap-2 px-3 text-muted-foreground">
                  <Plus className="h-4 w-4" />
                  <span className="text-sm">Agregar tarea padre...</span>
                </div>
              </div>
            )}

            {visibleTasks.length === 0 && !newTaskRow && (
              <div className="p-8 text-center text-muted-foreground">
                Haz clic en "Agregar tarea padre..." para comenzar
              </div>
            )}
          </div>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <AlertDialog open={!!pendingDateEdit} onOpenChange={(o) => { if (!o) setPendingDateEdit(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Esta tarea tiene dependencias</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDateEdit?.hasOutgoing && pendingDateEdit?.hasIncoming
                ? "Otras tareas dependen de esta y esta también depende de otras. ¿Quieres mover solo esta tarea (rompiendo las dependencias) o mover también las tareas dependientes en cascada?"
                : pendingDateEdit?.hasOutgoing
                ? "Hay tareas que dependen de esta. ¿Quieres mover solo esta (rompiendo el vínculo con sus dependientes) o mover también las dependientes en cascada?"
                : "Esta tarea depende de otra. ¿Quieres mover solo esta tarea (rompiendo el vínculo con su predecesora) o mantener la dependencia?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!pendingDateEdit) return;
                const p = pendingDateEdit;
                setPendingDateEdit(null);
                await performDateUpdate(p.taskId, p.field, p.newDate, { skipPropagation: true, breakDependencies: true });
              }}
            >
              Solo esta (romper dependencias)
            </AlertDialogAction>
            <AlertDialogAction
              onClick={async () => {
                if (!pendingDateEdit) return;
                const p = pendingDateEdit;
                setPendingDateEdit(null);
                await performDateUpdate(p.taskId, p.field, p.newDate);
              }}
            >
              Mover en cascada
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}