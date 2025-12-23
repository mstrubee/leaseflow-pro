import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { GanttTask } from "@/hooks/useGantt";
import { Holiday, calculateEndDate, calculateStartDate } from "@/lib/ganttDateUtils";
import { getGanttDateRange, getTaskStatusColor, formatGanttDate } from "@/lib/ganttDateUtils";
import { format, differenceInDays, parseISO, eachDayOfInterval, isWeekend, addDays } from "date-fns";
import { es } from "date-fns/locale";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronDown, ChevronRight, Link, Plus, Calendar as CalendarIcon, Trash2, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

type BarDragMode = "move" | "resize-left" | "resize-right" | "dependency" | null;

interface GanttChartProps {
  tasks: GanttTask[];
  taskTree: GanttTask[];
  holidays: Array<{ date: string; name: string }>;
  onUpdateTask: (taskId: string, updates: Partial<GanttTask>) => Promise<void>;
  onAddTask: (name: string, parentId?: string | null, options?: Partial<GanttTask>) => Promise<any>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onAddDependency: (taskId: string, dependsOnTaskId: string) => Promise<void>;
  onRemoveDependency: (dependencyId: string) => Promise<void>;
  onReorderTask: (taskId: string, newIndex: number, siblingIds: string[]) => Promise<void>;
}

const DAY_WIDTH = 30;
const ROW_HEIGHT = 40;
const TASK_NAME_WIDTH = 200;
const DATE_COL_WIDTH = 110;
const DURATION_COL_WIDTH = 80;

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
}: GanttChartProps) {
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [newTaskRow, setNewTaskRow] = useState<NewTaskRow | null>(null);
  const [isSaving, setIsSaving] = useState(false);
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
  const [dropPosition, setDropPosition] = useState<"above" | "below" | null>(null);
  
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

    const HEADER_OFFSET = TASK_NAME_WIDTH + DATE_COL_WIDTH + DURATION_COL_WIDTH + DATE_COL_WIDTH + 6; // +6 for grip handle

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

        // Arrow from parent end to child start
        const fromX = HEADER_OFFSET + parentPosition.left + parentPosition.width - 4;
        const fromY = parentRowIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
        const toX = HEADER_OFFSET + taskPosition.left;
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

  const handleAddNewRow = () => {
    setNewTaskRow(createEmptyNewTask());
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

  const handleRowDragOver = (e: React.DragEvent, taskId: string) => {
    e.preventDefault();
    if (!rowDragSource || rowDragSource === taskId) return;
    
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const isAbove = y < rect.height / 2;
    
    setRowDragOverId(taskId);
    setDropPosition(isAbove ? "above" : "below");
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

    // Get all visible task IDs in order (flattened)
    const flatTaskIds = visibleTasks.map(vt => vt.task.id);
    const sourceIdx = flatTaskIds.indexOf(rowDragSource);
    const targetIdx = flatTaskIds.indexOf(rowDragOverId);
    
    if (sourceIdx === -1 || targetIdx === -1) {
      handleRowDragEnd();
      return;
    }

    // Calculate new order
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
      await onUpdateTask(barDragTaskId, {
        start_date: dragPreview.start,
        end_date: dragPreview.end,
        duration_days: dragPreview.duration,
      });
    }
    
    // Reset all drag state
    setBarDragMode(null);
    setBarDragTaskId(null);
    setBarDragStartX(0);
    setBarDragOriginalStart("");
    setBarDragOriginalEnd("");
    setDragPreview(null);
  }, [barDragTaskId, dragPreview, onUpdateTask]);

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

  const handleUpdateTaskField = async (taskId: string, field: string, value: any) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const updates: Partial<GanttTask> = { [field]: value };

    // Auto-calculate dates when updating
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

  const DatePickerCell = ({ 
    value, 
    onChange, 
    placeholder = "Seleccionar",
    showTaskDates = false,
  }: { 
    value: string | null; 
    onChange: (date: string) => void;
    placeholder?: string;
    showTaskDates?: boolean;
  }) => (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "w-full h-8 justify-start text-left font-normal px-2",
            !value && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-1 h-3 w-3" />
          {value ? format(parseISO(value), "dd/MM/yy") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 z-50 bg-popover" align="start">
        <div className="flex">
          {/* Task dates quick selection */}
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
                    onClick={() => onChange(td.date)}
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
            onSelect={(date) => date && onChange(format(date, "yyyy-MM-dd"))}
            initialFocus
            className="p-3 pointer-events-auto"
          />
        </div>
      </PopoverContent>
    </Popover>
  );

  return (
    <div className="border rounded-lg overflow-hidden bg-background">
      <ScrollArea className="w-full">
        <div className="min-w-fit">
          {/* Month/Year Header */}
          <div className="flex border-b bg-muted/70 sticky top-0 z-30">
            <div className="flex-shrink-0 border-r" style={{ width: 24 + TASK_NAME_WIDTH + DATE_COL_WIDTH + DURATION_COL_WIDTH + DATE_COL_WIDTH }}>
              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                Cronograma
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
                            "flex-shrink-0 text-center text-xs py-1 border-r",
                            isWeekendDay && "bg-muted/80",
                            isHoliday && "bg-red-100 dark:bg-red-900/20",
                            isToday && "bg-primary/10 font-bold"
                          )}
                          style={{ width: DAY_WIDTH }}
                        >
                          <div className="font-medium text-[10px]">
                            {format(day, "d")}
                          </div>
                          <div className="text-muted-foreground text-[8px]">
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
            {/* SVG overlay for dependency arrows - clickable to delete */}
            {dependencyArrows.length > 0 && (
              <svg
                className="absolute inset-0 z-10"
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
                  // Draw a path from parent end to child start
                  const controlOffset = Math.min(30, Math.abs(arrow.toX - arrow.fromX) / 3);
                  
                  // If tasks are on the same row or close, use curved path
                  const pathD = arrow.fromY === arrow.toY
                    ? // Same row - simple curve below
                      `M ${arrow.fromX} ${arrow.fromY} 
                       C ${arrow.fromX + controlOffset} ${arrow.fromY + 20}, 
                         ${arrow.toX - controlOffset} ${arrow.toY + 20}, 
                         ${arrow.toX} ${arrow.toY}`
                    : // Different rows - step path with rounded corners
                      `M ${arrow.fromX} ${arrow.fromY}
                       L ${arrow.fromX + 10} ${arrow.fromY}
                       Q ${arrow.fromX + 15} ${arrow.fromY}, ${arrow.fromX + 15} ${arrow.fromY + (arrow.toY > arrow.fromY ? 5 : -5)}
                       L ${arrow.fromX + 15} ${arrow.toY + (arrow.toY > arrow.fromY ? -5 : 5)}
                       Q ${arrow.fromX + 15} ${arrow.toY}, ${arrow.fromX + 20} ${arrow.toY}
                       L ${arrow.toX - 4} ${arrow.toY}`;
                  
                  return (
                    <g key={arrow.id} className="group/arrow">
                      {/* Invisible wider path for easier clicking */}
                      <path
                        d={pathD}
                        fill="none"
                        stroke="transparent"
                        strokeWidth="12"
                        className="cursor-pointer pointer-events-auto"
                        onClick={() => onRemoveDependency(arrow.id)}
                      />
                      {/* Visible arrow path */}
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
              
              return (
                <div
                  key={task.id}
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
                    rowDragOverId === task.id && dropPosition === "below" && "border-b-2 border-b-primary"
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
                      className="h-7 text-xs border-0 bg-transparent focus:bg-background px-1"
                      onDragStart={(e) => e.stopPropagation()}
                      draggable={false}
                    />
                    {task.dependencies && task.dependencies.length > 0 && (
                      <Link className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    )}
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
                    />
                  </div>

                  {/* Duration */}
                  <div className="flex-shrink-0 border-r flex items-center px-1" style={{ width: DURATION_COL_WIDTH }}>
                    <Input
                      type="number"
                      min={1}
                      value={task.duration_days || 1}
                      onChange={(e) => handleUpdateTaskField(task.id, "duration_days", parseInt(e.target.value) || 1)}
                      className="h-7 text-xs border-0 bg-transparent focus:bg-background text-center w-10 px-1"
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
                    />
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
                      e.stopPropagation();
                      if (dragSource) {
                        handleBarDrop(task.id);
                      }
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
                                getTaskStatusColor(task.status, task.end_date),
                                dragSource === task.id && "opacity-50 ring-2 ring-primary",
                                barDragTaskId === task.id && "ring-2 ring-primary"
                              )}
                              style={{
                                left: position.left,
                                width: Math.max(position.width - 4, 8),
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
                              
                              {/* Progress indicator */}
                              {task.progress > 0 && (
                                <div
                                  className="absolute inset-y-0 left-0 bg-white/30 rounded-l pointer-events-none"
                                  style={{ width: `${task.progress}%` }}
                                />
                              )}
                              
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
                              <p className="text-xs">Progreso: {task.progress}%</p>
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
                  />
                </div>

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
                onClick={handleAddNewRow}
              >
                <div className="flex-shrink-0 w-6" /> {/* Grip handle space */}
                <div className="flex items-center gap-2 px-3 text-muted-foreground">
                  <Plus className="h-4 w-4" />
                  <span className="text-sm">Agregar tarea...</span>
                </div>
              </div>
            )}

            {visibleTasks.length === 0 && !newTaskRow && (
              <div className="p-8 text-center text-muted-foreground">
                Haz clic en "Agregar tarea..." para comenzar
              </div>
            )}
          </div>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}