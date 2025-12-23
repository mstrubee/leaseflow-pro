import { useMemo, useState, useRef, useEffect } from "react";
import { GanttTask } from "@/hooks/useGantt";
import { Holiday, calculateEndDate, calculateStartDate } from "@/lib/ganttDateUtils";
import { getGanttDateRange, getTaskStatusColor, formatGanttDate } from "@/lib/ganttDateUtils";
import { format, differenceInDays, parseISO, eachDayOfInterval, isWeekend } from "date-fns";
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
  onReorderTask,
}: GanttChartProps) {
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [newTaskRow, setNewTaskRow] = useState<NewTaskRow | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  
  // Drag state for creating dependencies (bar drag)
  const [dragSource, setDragSource] = useState<string | null>(null);
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  const [isDraggingBar, setIsDraggingBar] = useState(false);
  
  // Drag state for row reordering
  const [rowDragSource, setRowDragSource] = useState<string | null>(null);
  const [rowDragOverId, setRowDragOverId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<"above" | "below" | null>(null);

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

          {/* Task rows */}
          <div>
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

                    {/* Task bar - draggable for dependencies */}
                    {position.visible && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              draggable
                              onDragStart={(e) => {
                                e.stopPropagation();
                                handleBarDragStart(task.id);
                              }}
                              onDragEnd={(e) => {
                                e.stopPropagation();
                                handleBarDragEnd();
                              }}
                              className={cn(
                                "absolute top-1.5 rounded h-6 cursor-grab active:cursor-grabbing transition-all hover:opacity-80 shadow-sm",
                                getTaskStatusColor(task.status, task.end_date),
                                dragSource === task.id && "opacity-50 ring-2 ring-primary"
                              )}
                              style={{
                                left: position.left,
                                width: Math.max(position.width - 4, 8),
                              }}
                            >
                              {task.progress > 0 && (
                                <div
                                  className="absolute inset-y-0 left-0 bg-white/30 rounded-l"
                                  style={{ width: `${task.progress}%` }}
                                />
                              )}
                              <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white font-medium truncate px-1">
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
                                Arrastra a otra tarea para crear dependencia
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