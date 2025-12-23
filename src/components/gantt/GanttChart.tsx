import { useMemo, useState } from "react";
import { GanttTask } from "@/hooks/useGantt";
import { Holiday } from "@/lib/ganttDateUtils";
import { getGanttDateRange, getTaskStatusColor, formatGanttDate } from "@/lib/ganttDateUtils";
import { format, addDays, differenceInDays, parseISO, eachDayOfInterval, isWeekend } from "date-fns";
import { es } from "date-fns/locale";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronDown, ChevronRight, Link } from "lucide-react";
import { cn } from "@/lib/utils";

interface GanttChartProps {
  tasks: GanttTask[];
  taskTree: GanttTask[];
  holidays: Array<{ date: string; name: string }>;
  onUpdateTask: (taskId: string, updates: Partial<GanttTask>) => Promise<void>;
  onAddDependency: (taskId: string, dependsOnTaskId: string) => Promise<void>;
  onRemoveDependency: (dependencyId: string) => Promise<void>;
}

const DAY_WIDTH = 30;
const ROW_HEIGHT = 36;
const TASK_NAME_WIDTH = 250;

export function GanttChart({
  tasks,
  taskTree,
  holidays,
  onUpdateTask,
}: GanttChartProps) {
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

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

  return (
    <div className="border rounded-lg overflow-hidden">
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
                No hay tareas aún. Agrega tareas desde la pestaña "Lista de Tareas".
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
                      <span className="truncate text-sm" title={task.name}>
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
    </div>
  );
}
