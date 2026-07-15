import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { GanttTask, OrgMember } from "@/hooks/useGantt";
import { useToast } from "@/hooks/use-toast";
import { Holiday, calculateEndDate, calculateStartDate } from "@/lib/ganttDateUtils";
import { getGanttDateRange, getTaskStatusColor, formatGanttDate } from "@/lib/ganttDateUtils";
import { format, differenceInDays, parseISO, eachDayOfInterval, isWeekend, addDays } from "date-fns";
import { es } from "date-fns/locale";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronDown, ChevronRight, ChevronsUpDown, ChevronsDownUp, Link, Plus, Calendar as CalendarIcon, Trash2, GripVertical, Eye, EyeOff, FileDown, Palette, CornerLeftUp, ZoomIn, ZoomOut, ArrowLeft, ArrowRight } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { DependencyDialog } from "./DependencyDialog";
import { TaskStatusActions, StatusDot } from "./TaskStatusActions";

// Local input that only commits the value on Enter or blur, allowing free typing/erasing.
function DurationInput({
  value,
  onCommit,
  editable = true,
}: {
  value: number;
  onCommit: (n: number) => void;
  editable?: boolean;
}) {
  const [local, setLocal] = useState<string>(String(value ?? 1));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setLocal(String(value ?? 1));
  }, [value, focused]);

  if (!editable) {
    return <span className="text-xs px-1 text-center w-14 truncate">{value ?? 1}</span>;
  }

  const commit = () => {
    const n = parseInt(local);
    if (isNaN(n) || n < 0) {
      onCommit(0);
      setLocal("0");
    } else {
      onCommit(n);
      setLocal(String(n));
    }
  };
  return (
    <Input
      type="number"
      min={0}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      className="h-7 text-xs border-0 bg-transparent focus:bg-background text-center w-14 px-1"
      onDragStart={(e) => e.stopPropagation()}
      draggable={false}
    />
  );
}

function TaskNameInput({
  taskId,
  value,
  completed,
  onCommit,
}: {
  taskId: string;
  value: string;
  completed: boolean;
  onCommit: (newValue: string) => void;
}) {
  const [local, setLocal] = useState(value);
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setLocal(value);
  }, [value, taskId]);

  return (
    <Input
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onFocus={() => { focusedRef.current = true; }}
      onBlur={() => {
        focusedRef.current = false;
        if (local !== value) onCommit(local);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setLocal(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={cn(
        "h-7 text-xs border-0 bg-transparent focus:bg-background px-1",
        completed && "line-through text-muted-foreground"
      )}
      onDragStart={(e) => e.stopPropagation()}
      draggable={false}
    />
  );
}


// % de avance implícito por fecha: días transcurridos / duración total, entre
// un start y un end dados. Compartido por "Avance Real" (fechas ACTUALES,
// que cambian con Reprog./cascada) y "Avance Prog." (fechas de BASELINE,
// fijas desde que la tarea nació).
function computeDateProgress(start_date: string | null, end_date: string | null): number {
  if (!start_date || !end_date) return 0;
  const start = parseISO(start_date).getTime();
  const end = parseISO(end_date).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const now = today.getTime();
  if (now <= start) return 0;
  if (now >= end) return 100;
  const total = end - start;
  if (total <= 0) return 0;
  return Math.round(((now - start) / total) * 100);
}

// "% Avance Real": usa las fechas ACTUALES de la tarea (las que cambian con
// Reprog., arrastre de barra o cascada de dependencias).
function computeAutoProgress(task: GanttTask): number {
  return computeDateProgress(task.start_date, task.end_date);
}

// "% Avance Prog.": usa las fechas de BASELINE (el plan original, congelado
// desde que la tarea nació y nunca modificado después).
function computeBaselineProgress(task: GanttTask): number {
  return computeDateProgress(task.baseline_start_date, task.baseline_end_date);
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
  suffix,
}: {
  value: string | null;
  onChange: (date: string) => void;
  placeholder?: string;
  showTaskDates?: boolean;
  taskDates?: Array<{ date: string; taskName: string; type: "start" | "end" }>;
  editable?: boolean;
  suffix?: React.ReactNode;
}) => {
  const [open, setOpen] = useState(false);

  // Non-editable: show plain text
  if (!editable) {
    return (
      <div className="flex flex-col items-center justify-center px-2">
        <span className="text-xs text-muted-foreground truncate">
          {value ? format(parseISO(value), "dd/MM/yy") : "—"}
        </span>
        {suffix}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          className="w-full h-full flex flex-col items-center justify-center cursor-pointer select-none hover:bg-muted/40 rounded"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
          title="Doble clic para editar"
        >
          <span className={cn("text-xs px-2 truncate", !value && "text-muted-foreground")}>
            {value ? format(parseISO(value), "dd/MM/yy") : placeholder}
          </span>
          {suffix}
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
  orgMembers?: OrgMember[];
  onUpdateTask: (taskId: string, updates: Partial<GanttTask>, options?: { skipPropagation?: boolean; breakDependencies?: boolean }) => Promise<Map<string, Partial<GanttTask>> | void>;
  onAddTask: (name: string, parentId?: string | null, options?: Partial<GanttTask>) => Promise<any>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onUndoDelete?: () => Promise<void>;
  onAddDependency: (taskId: string, dependsOnTaskId: string, options?: { dep_type?: "start" | "end"; lag_days?: number; lag_type?: "calendar" | "business" }) => Promise<void>;
  onRemoveDependency: (dependencyId: string) => Promise<void>;
  onUpdateDependency?: (dependencyId: string, updates: { dep_type?: "start" | "end"; lag_days?: number; lag_type?: "calendar" | "business" }) => Promise<void>;
  onDiscardTask?: (taskId: string) => Promise<void>;
  onRestoreTask?: (taskId: string) => Promise<void>;
  getDescendantCount?: (taskId: string) => number;
  onReorderTask: (taskId: string, newIndex: number, siblingIds: string[]) => Promise<void>;
  isAdmin?: boolean;
  /** Usuarios con permiso de ver: pueden reprogramar (columna Reprog.) */
  canReprogram?: boolean;
  /** Usuarios con permiso de ver: pueden marcar tareas como completadas */
  canComplete?: boolean;
  onExportPDF?: (hideCompleted: boolean, mode: "all" | "separate" | "selected", selectedParentIds?: string[]) => void;
  rentStartDate?: string | null;
  /** Fila-resumen no editable arriba de todas las tareas, con la fecha de
   *  inicio/término de todo el cronograma — solo para cronogramas "general"
   *  (no se pasa en "Cronogramas de Mantenciones"). */
  showSummaryRow?: boolean;
}

const BASE_DAY_WIDTH = 30;
const ZOOM_LEVELS = [25, 50, 75, 100] as const;
type ZoomLevel = (typeof ZOOM_LEVELS)[number];
const ROW_HEIGHT = 40;
const TASK_NAME_WIDTH = 450;
const INDEX_COL_WIDTH = 40;
const RESPONSIBLE_COL_WIDTH = 180;
const DATE_COL_WIDTH = 140;
const DURATION_COL_WIDTH = 110;
const REPROG_COL_WIDTH = 72;
const PROGRESS_COL_WIDTH = 80;
const PROGRESS_REAL_COL_WIDTH = 90;

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
  orgMembers = [],
  onUpdateTask,
  onAddTask,
  onDeleteTask,
  onUndoDelete,
  onAddDependency,
  onRemoveDependency,
  onUpdateDependency,
  onDiscardTask,
  onRestoreTask,
  getDescendantCount,
  onReorderTask,
  isAdmin = false,
  canReprogram = false,
  canComplete = false,
  onExportPDF,
  rentStartDate,
  showSummaryRow = false,
}: GanttChartProps) {
  const { toast } = useToast();
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const didInitExpandRef = useRef(false);
  const [newTaskRow, setNewTaskRow] = useState<NewTaskRow | null>(null);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>(100);
  const DAY_WIDTH = BASE_DAY_WIDTH * (zoomLevel / 100);
  const [taskNameColWidth, setTaskNameColWidth] = useState(TASK_NAME_WIDTH);
  const [colSelectMode, setColSelectMode] = useState(false);
  const [colPending, setColPending] = useState<Set<string>>(new Set());
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
  const cw = useCallback((key: string, width: number) => hiddenCols.has(key) ? 0 : width, [hiddenCols]);
  const [reprogValues, setReprogValues] = useState<Map<string, string>>(new Map());
  // Fecha de término ANTES de la primera reprogramación de la sesión — se guarda
  // una sola vez por tarea (no se sobreescribe en reprogramaciones sucesivas) para
  // poder mostrar "(fecha antigua) ±N días" tanto en la tarea editada como en
  // cualquier dependiente que se haya movido en cascada.
  const [reprogOldEnd, setReprogOldEnd] = useState<Map<string, string>>(new Map());
  // La columna "Término" se ensancha mientras haya alguna reprogramación activa
  // en la sesión, para que "(fecha antigua) ±N días" entre completo — el ancho
  // normal (140px) lo recorta. Vuelve al ancho normal cuando no hay nada que mostrar.
  const endColWidth = reprogOldEnd.size > 0 ? DATE_COL_WIDTH + 60 : DATE_COL_WIDTH;
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportMode, setExportMode] = useState<"all" | "separate" | "selected">("all");
  const [exportSelectedIds, setExportSelectedIds] = useState<Set<string>>(new Set());
  const [depViewTaskId, setDepViewTaskId] = useState<string | null>(null);
  const [depViewMode, setDepViewMode] = useState<"predecessors" | "successors">("predecessors");
  const [depPopoverTaskId, setDepPopoverTaskId] = useState<string | null>(null);
  // Dependency line selected by clicking it in the bar chart (highlights the
  // predecessor + dependent tasks).
  const [selectedDependencyId, setSelectedDependencyId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [hideWeekends, setHideWeekends] = useState(false);
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

  // State for "change parent" dialog
  const [parentDialogTaskId, setParentDialogTaskId] = useState<string | null>(null);
  const [parentDialogValue, setParentDialogValue] = useState<string>("__root__");
  
  const ganttAreaRef = useRef<HTMLDivElement>(null);

  const { minDate, maxDate } = useMemo(() => getGanttDateRange(tasks), [tasks]);

  const allDays = useMemo(() => {
    // Safety guard: never try to render an unbounded number of day columns.
    // If the data ever contains corrupted/impossible dates, cap the rendered
    // window so the browser can't run out of memory and freeze (gray screen).
    const MAX_SPAN_DAYS = 365 * 8; // ~8 years is far beyond any real schedule
    const span = differenceInDays(maxDate, minDate);
    const safeMax = span > MAX_SPAN_DAYS ? addDays(minDate, MAX_SPAN_DAYS) : maxDate;
    return eachDayOfInterval({ start: minDate, end: safeMax });
  }, [minDate, maxDate]);

  const days = useMemo(() => {
    if (!hideWeekends) return allDays;
    return allDays.filter((d) => !isWeekend(d));
  }, [allDays, hideWeekends]);

  // Map yyyy-MM-dd → visible column index. For hidden weekend dates returns null.
  const dateIndexMap = useMemo(() => {
    const m = new Map<string, number>();
    days.forEach((d, idx) => m.set(format(d, "yyyy-MM-dd"), idx));
    return m;
  }, [days]);

  // Resolve any calendar date to a visible column. Weekend dates snap to nearest visible day.
  const resolveVisibleIndex = useCallback(
    (dateStr: string, mode: "start" | "end"): number => {
      const direct = dateIndexMap.get(dateStr);
      if (direct !== undefined) return direct;
      // Weekend (or out-of-range): snap forward for start, backward for end
      let d = parseISO(dateStr);
      const step = mode === "start" ? 1 : -1;
      for (let i = 0; i < 7; i++) {
        d = addDays(d, step);
        const idx = dateIndexMap.get(format(d, "yyyy-MM-dd"));
        if (idx !== undefined) return idx;
      }
      return 0;
    },
    [dateIndexMap]
  );

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

  // Deshacer la última eliminación con Ctrl+Z (PC) / Cmd+Z (Mac).
  // No interferir cuando se está escribiendo en un campo de texto.
  useEffect(() => {
    if (!onUndoDelete || !isAdmin) return;
    const onKey = (e: KeyboardEvent) => {
      const isUndo = (e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "z" || e.key === "Z");
      if (!isUndo) return;
      const el = document.activeElement;
      const tag = el?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement | null)?.isContentEditable;
      if (typing) return; // dejar que el navegador deshaga el texto
      e.preventDefault();
      onUndoDelete();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onUndoDelete, isAdmin]);

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

  // Set robusto de IDs que son "madre" derivado del arreglo plano (no del árbol anidado),
  // para que una tarea con hijas siempre se trate como madre aunque task.children esté stale.
  const parentTaskIds = useMemo(
    () => new Set(tasks.map((t) => t.parent_id).filter(Boolean) as string[]),
    [tasks]
  );

  // Default view: collapsed — mark as initialized once tasks arrive so subsequent
  // updates (date edits, completion toggles, etc.) preserve the user's state.
  useEffect(() => {
    if (!didInitExpandRef.current && allParentTaskIds.length > 0) {
      didInitExpandRef.current = true;
    }
  }, [allParentTaskIds]);

  const allExpanded = allParentTaskIds.length > 0 && allParentTaskIds.every((id) => expandedTasks.has(id));

  // ── Expansión progresiva (un nivel por clic, con rebote en los extremos) ──
  // Memoria de dirección por clave (id de la línea madre, o "__all__" para el botón global).
  const expandDirRef = useRef<Map<string, "expand" | "collapse">>(new Map());

  // Parents (líneas madre) que son hijas directas de `id`.
  const childParentsOf = useCallback(
    (id: string) => tasks.filter((t) => t.parent_id === id && parentTaskIds.has(t.id)).map((t) => t.id),
    [tasks, parentTaskIds]
  );

  // Todas las madres del subárbol de `rootId` (incluye rootId si es madre).
  const subtreeParents = useCallback(
    (rootId: string): string[] => {
      const res: string[] = [];
      const rec = (id: string) => {
        if (!parentTaskIds.has(id)) return;
        res.push(id);
        childParentsOf(id).forEach(rec);
      };
      rec(rootId);
      return res;
    },
    [parentTaskIds, childParentsOf]
  );

  // Frontera de expansión: madres visibles (ancestros expandidos) que aún están colapsadas.
  const computeFrontier = useCallback(
    (set: Set<string>, roots: string[]): string[] => {
      const frontier: string[] = [];
      const rec = (id: string) => {
        if (!parentTaskIds.has(id)) return;
        if (!set.has(id)) { frontier.push(id); return; } // colapsada → frontera, no seguir
        childParentsOf(id).forEach(rec);
      };
      roots.forEach(rec);
      return frontier;
    },
    [parentTaskIds, childParentsOf]
  );

  // Nivel más profundo actualmente expandido: madres expandidas sin descendiente-madre expandida.
  const computeDeepestExpanded = useCallback(
    (set: Set<string>, roots: string[]): string[] => {
      const deepest: string[] = [];
      const seen = new Set<string>();
      roots.forEach((r) => subtreeParents(r).forEach((id) => {
        if (seen.has(id) || !set.has(id)) return;
        seen.add(id);
        const hasExpandedDesc = subtreeParents(id).some((d) => d !== id && set.has(d));
        if (!hasExpandedDesc) deepest.push(id);
      }));
      return deepest;
    },
    [subtreeParents]
  );

  const progressiveToggle = useCallback(
    (roots: string[], key: string) => {
      setExpandedTasks((prev) => {
        const next = new Set(prev);
        const frontier = computeFrontier(next, roots);
        const anyExpanded = roots.some((r) => subtreeParents(r).some((id) => next.has(id)));
        const fullyExpanded = frontier.length === 0;
        const fullyCollapsed = !anyExpanded;

        let dir = expandDirRef.current.get(key) ?? "expand";
        if (fullyCollapsed) dir = "expand";
        else if (fullyExpanded) dir = "collapse";

        if (dir === "expand") {
          frontier.forEach((id) => next.add(id));
        } else {
          computeDeepestExpanded(next, roots).forEach((id) => next.delete(id));
        }

        // Fijar dirección para el próximo clic (rebote en extremos).
        const frontierAfter = computeFrontier(next, roots);
        const anyExpandedAfter = roots.some((r) => subtreeParents(r).some((id) => next.has(id)));
        if (frontierAfter.length === 0) expandDirRef.current.set(key, "collapse");
        else if (!anyExpandedAfter) expandDirRef.current.set(key, "expand");
        else expandDirRef.current.set(key, dir);

        return next;
      });
    },
    [computeFrontier, computeDeepestExpanded, subtreeParents]
  );

  const toggleExpand = (taskId: string) => progressiveToggle([taskId], taskId);

  const rootParentIds = useMemo(
    () => taskTree.filter((t) => t.children && t.children.length > 0).map((t) => t.id),
    [taskTree]
  );

  // Botón "Expandir/Contraer Todo": expande o colapsa TODO de una sola vez.
  const toggleExpandAllFull = () => {
    setExpandedTasks(allExpanded ? new Set() : new Set(allParentTaskIds));
  };

  // Botón "Expandir/Comprimir Niveles": progresivo, un nivel por clic (con rebote).
  const toggleExpandAll = () => progressiveToggle(rootParentIds, "__all__");

  // Bulk toggle: convert ALL task durations to business or calendar days, recalculating end_date.
  const tasksWithDuration = tasks.filter((t) => t.start_date && (t.duration_days ?? 0) > 0);
  const allBusiness =
    tasksWithDuration.length > 0 && tasksWithDuration.every((t) => t.duration_type === "business");
  const someBusiness = tasksWithDuration.some((t) => t.duration_type === "business");
  const businessChecked: boolean | "indeterminate" = allBusiness
    ? true
    : someBusiness
      ? "indeterminate"
      : false;
  const [bulkTypeRunning, setBulkTypeRunning] = useState(false);

  const handleBulkDurationType = async (toBusiness: boolean) => {
    const newType: "calendar" | "business" = toBusiness ? "business" : "calendar";
    const targets = tasks.filter(
      (t) => t.start_date && (t.duration_days ?? 0) > 0 && t.duration_type !== newType
    );
    if (targets.length === 0) return;
    setBulkTypeRunning(true);
    try {
      // Process sequentially to avoid hammering Supabase; skipPropagation per task.
      for (const t of targets) {
        const newEnd = calculateEndDate(t.start_date!, t.duration_days, newType, holidays);
        await onUpdateTask(
          t.id,
          { duration_type: newType, end_date: format(newEnd, "yyyy-MM-dd") },
          { skipPropagation: true }
        );
      }
    } finally {
      setBulkTypeRunning(false);
    }
  };

  type VisibleEntry =
    | { task: GanttTask; level: number; isNewRow?: false }
    | { task: null; level: number; isNewRow: true };

  const visibleTasks = useMemo(() => {
    const result: VisibleEntry[] = [];

    const addTasks = (tasks: GanttTask[], level: number, parentId: string | null) => {
      tasks.forEach((task) => {
        if (hideCompleted && task.status === "completed") return;
        result.push({ task, level });
        const hasVisibleChildren =
          task.children && task.children.length > 0 && expandedTasks.has(task.id);
        if (hasVisibleChildren) {
          addTasks(task.children!, level + 1, task.id);
        } else if (newTaskRow && newTaskRow.parent_id === task.id) {
          // Parent expanded but has no children yet — insert directly after parent.
          result.push({ task: null, level: level + 1, isNewRow: true });
        }
      });
      // After the last sibling in this group, inject the new row if it belongs here.
      if (newTaskRow && newTaskRow.parent_id === parentId && parentId !== null) {
        result.push({ task: null, level, isNewRow: true });
      }
    };

    addTasks(taskTree, 0, null);
    // Root-level new row goes at the very end (existing behaviour).
    if (newTaskRow && newTaskRow.parent_id === null) {
      result.push({ task: null, level: 0, isNewRow: true });
    }
    return result;
  }, [taskTree, expandedTasks, hideCompleted, newTaskRow]);

  // Map task IDs to their row index for arrow drawing
  const taskRowIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    visibleTasks.forEach((entry, idx) => {
      if (!entry.isNewRow) map.set(entry.task.id, idx);
    });
    return map;
  }, [visibleTasks]);

  // Fechas efectivas: una línea madre abarca de la hija más temprana a la más tardía
  // (recursivo). Una hoja usa sus propias fechas. Garantiza que la madre siempre
  // refleje a sus hijas aunque el valor guardado esté desactualizado.
  const getEffectiveDates = useCallback((task: GanttTask): { start: string | null; end: string | null } => {
    const children = tasks.filter((t) => t.parent_id === task.id);
    if (children.length === 0) return { start: task.start_date, end: task.end_date };
    let minStart: string | null = null;
    let maxEnd: string | null = null;
    for (const c of children) {
      const { start, end } = getEffectiveDates(c);
      if (start && (!minStart || start < minStart)) minStart = start;
      if (end && (!maxEnd || end > maxEnd)) maxEnd = end;
    }
    return { start: minStart, end: maxEnd };
  }, [tasks]);

  // Get task position - uses dragPreview for the task being dragged
  const getTaskPosition = useCallback((task: GanttTask) => {
    // Use preview state if this task is being dragged
    const isBeingDragged = barDragTaskId === task.id && dragPreview;
    const eff = getEffectiveDates(task);
    const startDateStr = isBeingDragged ? dragPreview.start : eff.start;
    const endDateStr = isBeingDragged ? dragPreview.end : eff.end;
    
    if (!startDateStr || !endDateStr) {
      return { left: 0, width: 0, visible: false };
    }

    const startIdx = resolveVisibleIndex(startDateStr, "start");
    const endIdx = resolveVisibleIndex(endDateStr, "end");
    const left = startIdx * DAY_WIDTH;
    const width = Math.max(1, endIdx - startIdx + 1) * DAY_WIDTH;

    return {
      left,
      width,
      visible: true,
    };
  }, [barDragTaskId, dragPreview, resolveVisibleIndex, getEffectiveDates, DAY_WIDTH]);

  // Fecha de inicio/término de TODO el cronograma (rollup de las raíces del
  // árbol) — para la fila-resumen no editable de arriba (showSummaryRow).
  const { overallStart, overallEnd } = useMemo(() => {
    let minStart: string | null = null;
    let maxEnd: string | null = null;
    for (const t of taskTree) {
      const eff = getEffectiveDates(t);
      if (eff.start && (!minStart || eff.start < minStart)) minStart = eff.start;
      if (eff.end && (!maxEnd || eff.end > maxEnd)) maxEnd = eff.end;
    }
    return { overallStart: minStart, overallEnd: maxEnd };
  }, [taskTree, getEffectiveDates]);

  const summaryPosition = useMemo(() => {
    if (!overallStart || !overallEnd) return { left: 0, width: 0, visible: false };
    const startIdx = resolveVisibleIndex(overallStart, "start");
    const endIdx = resolveVisibleIndex(overallEnd, "end");
    return { left: startIdx * DAY_WIDTH, width: Math.max(1, endIdx - startIdx + 1) * DAY_WIDTH, visible: true };
  }, [overallStart, overallEnd, resolveVisibleIndex, DAY_WIDTH]);

  // Ancho total del bloque de columnas fijas (excluye columnas ocultas).
  const headerOffset = useMemo(() => {
    const get = (key: string, w: number) => hiddenCols.has(key) ? 0 : w;
    return 6 + get("index", INDEX_COL_WIDTH) + taskNameColWidth +
      get("responsible", RESPONSIBLE_COL_WIDTH) +
      get("start", DATE_COL_WIDTH) + get("duration", DURATION_COL_WIDTH) +
      get("end", endColWidth) + get("reprog", REPROG_COL_WIDTH) + get("progress", PROGRESS_COL_WIDTH) +
      get("progressReal", PROGRESS_REAL_COL_WIDTH);
  }, [hiddenCols, taskNameColWidth, endColWidth]);

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

    visibleTasks.forEach(({ task }, rowIdx) => {
      if (!task || !task.dependencies || task.dependencies.length === 0) return;

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
        const fromX = headerOffset + parentPosition.left + parentPosition.width + 8;
        const fromY = parentRowIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
        const toX = headerOffset + taskPosition.left + Math.min(Math.max(taskPosition.width / 2, 10), 24);
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
  }, [visibleTasks, taskRowIndexMap, tasks, getTaskPosition, headerOffset]);

  // Resolve the currently selected dependency line into its predecessor/dependent.
  const selectedDependency = useMemo(() => {
    if (!selectedDependencyId) return null;
    const arrow = dependencyArrows.find((a) => a.id === selectedDependencyId);
    if (!arrow) return null;
    const predecessor = tasks.find((t) => t.id === arrow.parentTaskId) || null;
    const dependent = tasks.find((t) => t.id === arrow.childTaskId) || null;
    return { predecessorId: arrow.parentTaskId, dependentId: arrow.childTaskId, predecessor, dependent };
  }, [selectedDependencyId, dependencyArrows, tasks]);


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
      // Cerrar el formulario tras guardar (no reabrir una línea nueva automáticamente)
      setNewTaskRow(null);
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
    if (!isAdmin) { e.preventDefault(); return; } // solo editores reordenan tareas
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", taskId);
    setRowDragSource(taskId);
  };

  // Sync all ancestors' dates to encompass their children (min start / max end)
  const syncAncestorsDates = async (
    startParentId: string | null,
    overrides: Map<string, { start_date?: string | null; end_date?: string | null; parent_id?: string | null }> = new Map(),
    excludeIds: Set<string> = new Set()
  ) => {
    let currentParentId = startParentId;
    while (currentParentId) {
      const parent = tasks.find((t) => t.id === currentParentId);
      if (!parent) break;
      const allTasks = tasks
        .filter((t) => !excludeIds.has(t.id))
        .map((t) => {
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
    const flatTaskIds = visibleTasks.filter(vt => vt.task).map(vt => vt.task!.id);
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

    if (!isAdmin) return; // solo editores pueden mover/redimensionar plazos
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
      const newStart = dragPreview.start;
      const newEnd = dragPreview.end;

      await onUpdateTask(barDragTaskId, {
        start_date: newStart,
        end_date: newEnd,
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

    // When dependencies are broken (skipPropagation), the engine does NOT roll up
    // ancestors, so do it here. Otherwise onUpdateTask already rolls up parents
    // and cascades dependents (including tasks that depend on parent tasks).
    if (task.parent_id && options?.skipPropagation) {
      await syncAncestorsDates(
        task.parent_id,
        new Map([
          [
            taskId,
            {
              start_date: updates.start_date ?? task.start_date,
              end_date: updates.end_date ?? task.end_date,
            },
          ],
        ])
      );
    }
  };

  const handleUpdateTaskField = async (taskId: string, field: string, value: any) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    // Líneas madre (con hijas): inicio/plazo/término se calculan automáticamente
    // desde las hijas → no se permiten editar por ninguna vía.
    if (
      (field === "start_date" || field === "end_date" || field === "duration_days") &&
      tasks.some((t) => t.parent_id === taskId)
    ) {
      return;
    }

    // Solo preguntar si esta tarea DEPENDE de otra (entrante): editar su fecha
    // manualmente entra en conflicto con su predecesora → ofrecer romper/mantener.
    // Si solo tiene DEPENDIENTES (salientes), no se pregunta: se mueven en cascada
    // automáticamente (es el comportamiento esperado de una dependencia).
    if ((field === "start_date" || field === "end_date") && value) {
      const incoming = hasIncomingDependencies(taskId);
      if (incoming) {
        setPendingDateEdit({
          taskId,
          field: field as "start_date" | "end_date",
          newDate: value,
          hasOutgoing: hasOutgoingDependents(taskId),
          hasIncoming: incoming,
        });
        return;
      }
    }

    const updates: Partial<GanttTask> = { [field]: value };
    // Nota: duration_days puede ser 0 (línea que no consume tiempo), por eso se
    // comprueba con `!= null` en vez de un chequeo booleano (0 es falsy en JS).
    if (field === "start_date" && value && task.duration_days != null) {
      const endDate = calculateEndDate(value, task.duration_days, task.duration_type as "calendar" | "business", holidays);
      updates.end_date = format(endDate, "yyyy-MM-dd");
    } else if (field === "end_date" && value && task.duration_days != null) {
      const startDate = calculateStartDate(value, task.duration_days, task.duration_type as "calendar" | "business", holidays);
      updates.start_date = format(startDate, "yyyy-MM-dd");
    } else if (field === "duration_days" && task.start_date && value >= 0) {
      const endDate = calculateEndDate(task.start_date, value, task.duration_type as "calendar" | "business", holidays);
      updates.end_date = format(endDate, "yyyy-MM-dd");
    } else if (field === "duration_type" && task.start_date && task.duration_days >= 0) {
      const endDate = calculateEndDate(task.start_date, task.duration_days, value as "calendar" | "business", holidays);
      updates.end_date = format(endDate, "yyyy-MM-dd");
    }

    const cascade = await onUpdateTask(taskId, updates);

    // Al asignar responsable a una línea madre, las hijas SIN responsable heredan
    // el mismo por defecto (cada una puede editarse después).
    if (field === "responsible_member_id" && value) {
      const collectDesc = (pid: string): GanttTask[] => {
        const direct = tasks.filter((t) => t.parent_id === pid);
        return direct.flatMap((c) => [c, ...collectDesc(c.id)]);
      };
      const inherit = collectDesc(taskId).filter((c) => !c.responsible_member_id);
      for (const c of inherit) {
        await onUpdateTask(c.id, { responsible_member_id: value } as Partial<GanttTask>);
      }
    }

    // onUpdateTask now rolls up ancestor (parent) dates and cascades any task that
    // depends on those parents, so an explicit syncAncestorsDates call here would
    // be redundant and could clobber the engine's result with stale data.
    return cascade;
  };

  // Aplica el delta ingresado en la columna "Reprog." a la fecha de término de
  // una tarea y registra, tanto para ella como para cada dependiente que se
  // mueva en cascada, la fecha de término ANTES del cambio — para poder mostrar
  // "(fecha antigua) ±N días" debajo de la nueva fecha en ambos casos.
  //
  // Llama a onUpdateTask DIRECTAMENTE (no a handleUpdateTaskField): esta última
  // pregunta "romper/mantener" cuando la tarea tiene una dependencia entrante,
  // porque un cambio de fecha manual vía el date-picker podría ser accidental.
  // Reprog. es lo opuesto — una reprogramación explícita que SIEMPRE debe
  // aplicarse y cascadear, sin preguntar.
  const commitReprogDelta = async (task: GanttTask) => {
    const delta = parseInt(reprogValues.get(task.id) ?? "0", 10);
    setReprogValues(prev => new Map(prev).set(task.id, "0"));
    if (isNaN(delta) || delta === 0 || !task.end_date) return;

    try {
      const newEnd = format(addDays(parseISO(task.end_date), delta), "yyyy-MM-dd");
      const updates: Partial<GanttTask> = { end_date: newEnd };
      if (task.duration_days != null) {
        const newStart = calculateStartDate(newEnd, task.duration_days, task.duration_type as "calendar" | "business", holidays);
        updates.start_date = format(newStart, "yyyy-MM-dd");
      }
      const cascade = await onUpdateTask(task.id, updates);

      setReprogOldEnd(prev => {
        const next = new Map(prev);
        if (!next.has(task.id)) next.set(task.id, task.end_date!);
        if (cascade) {
          for (const [id, upd] of cascade) {
            if (id === task.id || upd.end_date === undefined || next.has(id)) continue;
            const original = tasks.find(t => t.id === id);
            if (original?.end_date) next.set(id, original.end_date);
          }
        }
        return next;
      });
    } catch (err) {
      toast({ variant: "destructive", title: "Error al reprogramar", description: err instanceof Error ? err.message : String(err) });
    }
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

  const hierarchicalLabels = useMemo(() => {
    const map = new Map<string, string>();
    const walk = (tasks: GanttTask[], prefix: string) => {
      tasks.forEach((task, idx) => {
        const label = prefix ? `${prefix}.${idx + 1}` : `${idx + 1}`;
        map.set(task.id, label);
        if (task.children && task.children.length > 0) {
          walk(task.children, label);
        }
      });
    };
    walk(taskTree, "");
    return map;
  }, [taskTree]);

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

  // Color de la RAMA: color del ancestro de más alto nivel que tenga color
  // asignado (la fila raíz del grupo, ej. "1"). Así todas las madres anidadas
  // (1.3, 1.3.x, …) comparten el color de su grupo de primer nivel y no el de
  // un ancestro cercano ni un color propio mal asignado.
  const getBranchRootColor = useCallback((task: GanttTask): string | null => {
    let node: GanttTask | undefined = task;
    let topColor: string | null = task.color ?? null;
    while (node?.parent_id && taskById.has(node.parent_id)) {
      node = taskById.get(node.parent_id);
      if (node?.color) topColor = node.color; // el más alto gana
    }
    return topColor;
  }, [taskById]);

  // Progreso efectivo: una línea madre muestra el progreso agregado de sus hijas
  // (promedio ponderado por duración); una hoja usa su progreso manual o automático.
  const getEffectiveProgress = useCallback((task: GanttTask): number => {
    const children = tasks.filter((t) => t.parent_id === task.id);
    if (children.length === 0) {
      return task.progress && task.progress > 0 ? task.progress : computeAutoProgress(task);
    }
    let totalW = 0;
    let acc = 0;
    for (const c of children) {
      const w = c.duration_days && c.duration_days > 0 ? c.duration_days : 1;
      totalW += w;
      acc += w * getEffectiveProgress(c);
    }
    return totalW > 0 ? Math.round(acc / totalW) : 0;
  }, [tasks]);

  // "% Avance Prog.": progreso según el PLAN ORIGINAL (fechas de baseline,
  // que nunca cambian). Rollup ponderado por duración para líneas madre.
  // Siempre de solo lectura — no se edita manualmente.
  const getEffectiveScheduledProgress = useCallback((task: GanttTask): number => {
    const children = tasks.filter((t) => t.parent_id === task.id);
    if (children.length === 0) {
      return computeBaselineProgress(task);
    }
    let totalW = 0;
    let acc = 0;
    for (const c of children) {
      const w = c.duration_days && c.duration_days > 0 ? c.duration_days : 1;
      totalW += w;
      acc += w * getEffectiveScheduledProgress(c);
    }
    return totalW > 0 ? Math.round(acc / totalW) : 0;
  }, [tasks]);

  // "% Avance Real": progreso según las fechas ACTUALES (las que cambian con
  // Reprog., arrastre de barra o cascada de dependencias). También de solo
  // lectura — refleja directamente el estado vigente del cronograma.
  const getEffectiveCurrentProgress = useCallback((task: GanttTask): number => {
    const children = tasks.filter((t) => t.parent_id === task.id);
    if (children.length === 0) {
      return computeAutoProgress(task);
    }
    let totalW = 0;
    let acc = 0;
    for (const c of children) {
      const w = c.duration_days && c.duration_days > 0 ? c.duration_days : 1;
      totalW += w;
      acc += w * getEffectiveCurrentProgress(c);
    }
    return totalW > 0 ? Math.round(acc / totalW) : 0;
  }, [tasks]);

  const handleSetColor = async (taskId: string, color: string | null) => {
    await onUpdateTask(taskId, { color } as Partial<GanttTask>, { skipPropagation: true });
    // Propagar el color a TODAS las líneas de nivel inferior (hijas, nietas, etc.),
    // sin importar si tienen hijas propias. Todas adoptan el mismo color.
    const collectDescendants = (parentId: string): GanttTask[] => {
      const direct = tasks.filter((t) => t.parent_id === parentId);
      return direct.flatMap((c) => [c, ...collectDescendants(c.id)]);
    };
    const descendants = collectDescendants(taskId);
    for (const d of descendants) {
      if (d.color !== color) {
        await onUpdateTask(d.id, { color } as Partial<GanttTask>, { skipPropagation: true });
      }
    }
  };

  // Open dialog to change parent
  const openParentDialog = (taskId: string) => {
    const t = tasks.find((x) => x.id === taskId);
    setParentDialogTaskId(taskId);
    setParentDialogValue(t?.parent_id ?? "__root__");
  };

  // Apply parent change from dialog
  const handleChangeParent = async () => {
    if (!parentDialogTaskId) return;
    const sourceTask = tasks.find((t) => t.id === parentDialogTaskId);
    if (!sourceTask) return;
    const newParentId = parentDialogValue === "__root__" ? null : parentDialogValue;
    if (newParentId === sourceTask.parent_id) {
      setParentDialogTaskId(null);
      return;
    }
    // Prevent setting a descendant as parent
    if (newParentId) {
      const isDescendant = (ancestorId: string, candidateId: string): boolean => {
        let current = tasks.find((t) => t.id === candidateId);
        while (current?.parent_id) {
          if (current.parent_id === ancestorId) return true;
          current = tasks.find((t) => t.id === current!.parent_id);
        }
        return false;
      };
      if (newParentId === parentDialogTaskId || isDescendant(parentDialogTaskId, newParentId)) {
        setParentDialogTaskId(null);
        return;
      }
    }
    const oldParentId = sourceTask.parent_id;
    const newParent = newParentId ? tasks.find((t) => t.id === newParentId) : null;
    const updates: Partial<GanttTask> = { parent_id: newParentId };
    if (!sourceTask.color && newParent?.color) {
      updates.color = newParent.color;
    }
    await onUpdateTask(parentDialogTaskId, updates, { skipPropagation: true });
    if (newParentId) await syncAncestorsDates(newParentId);
    if (oldParentId && oldParentId !== newParentId) await syncAncestorsDates(oldParentId);
    setParentDialogTaskId(null);
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
      {selectedDependency && (
        <div className="flex items-center flex-wrap gap-x-4 gap-y-1 border-b bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs">
          <span className="font-semibold text-amber-700 dark:text-amber-400">Dependencia seleccionada</span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-500" />
            <span className="text-muted-foreground">Precedente:</span>
            <span className="font-medium">{selectedDependency.predecessor?.name ?? "—"}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-violet-500" />
            <span className="text-muted-foreground">Dependiente:</span>
            <span className="font-medium">{selectedDependency.dependent?.name ?? "—"}</span>
          </span>
          <button
            type="button"
            className="ml-auto text-muted-foreground hover:text-foreground underline"
            onClick={() => setSelectedDependencyId(null)}
          >
            Limpiar selección
          </button>
        </div>
      )}
      <style>{`
        .gantt-scroll::-webkit-scrollbar { height: 16px; width: 12px; }
        .gantt-scroll::-webkit-scrollbar-track { background: hsl(var(--muted)); }
        .gantt-scroll::-webkit-scrollbar-thumb {
          background: hsl(var(--muted-foreground));
          border-radius: 8px;
          border: 3px solid hsl(var(--muted));
        }
        .gantt-scroll::-webkit-scrollbar-thumb:hover { background: hsl(var(--foreground)); }
        .gantt-scroll::-webkit-scrollbar-corner { background: hsl(var(--muted)); }
        .gantt-scroll { scrollbar-width: auto; scrollbar-color: hsl(var(--muted-foreground)) hsl(var(--muted)); }
      `}</style>
      <div className="gantt-scroll w-full h-[75vh] overflow-auto">
        <div className="min-w-fit">
          {/* Month/Year Header */}
          <div className="flex border-b bg-muted/70 sticky top-0 z-30">
            <div className="flex-shrink-0 border-r sticky left-0 z-[31] bg-muted" style={{ width: 18 + headerOffset }}>
              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground flex items-center justify-between gap-1 flex-wrap">
                <div className="flex items-center gap-2">
                  <span>Cronograma</span>
                  {allParentTaskIds.length > 0 && (
                    <>
                      <Button
                        size="sm"
                        className="h-6 px-2 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                        onClick={toggleExpandAllFull}
                        title={allExpanded ? "Contraer todo (todos los niveles)" : "Expandir todo (todos los niveles)"}
                      >
                        {allExpanded ? (
                          <><ChevronsDownUp className="h-3 w-3 mr-1" />Contraer Todo</>
                        ) : (
                          <><ChevronsUpDown className="h-3 w-3 mr-1" />Expandir Todo</>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs"
                        onClick={toggleExpandAll}
                        title={allExpanded ? "Comprimir un nivel por clic" : "Expandir un nivel por clic"}
                      >
                        {allExpanded ? (
                          <><ChevronDown className="h-3 w-3 mr-1" />Comprimir Niveles</>
                        ) : (
                          <><ChevronRight className="h-3 w-3 mr-1" />Expandir Niveles</>
                        )}
                      </Button>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant={colSelectMode ? "default" : "outline"}
                    className="h-6 px-2 text-xs"
                    onClick={() => { setColSelectMode(v => !v); setColPending(new Set()); }}
                    title="Seleccionar columnas para ocultar"
                  >
                    Columnas
                  </Button>
                  {colSelectMode && (
                    <Button
                      size="sm"
                      className="h-6 px-2 text-xs"
                      disabled={colPending.size === 0}
                      onClick={() => {
                        setHiddenCols(prev => new Set([...prev, ...colPending]));
                        setColSelectMode(false);
                        setColPending(new Set());
                      }}
                    >
                      Ocultar seleccionadas
                    </Button>
                  )}
                  {!colSelectMode && hiddenCols.size > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs text-muted-foreground"
                      onClick={() => setHiddenCols(new Set())}
                      title="Restaurar todas las columnas ocultas"
                    >
                      Mostrar todo
                    </Button>
                  )}
                  <label
                    className={cn(
                      "flex items-center gap-1.5 h-6 px-2 text-xs rounded border bg-background cursor-pointer select-none",
                      bulkTypeRunning && "opacity-60 pointer-events-none"
                    )}
                    title="Convierte todos los plazos de la columna Días a días hábiles (excluye fines de semana y feriados). Desmarcar para volver a días corridos."
                  >
                    <Checkbox
                      checked={businessChecked}
                      onCheckedChange={(v) => handleBulkDurationType(v === true)}
                      disabled={bulkTypeRunning || tasksWithDuration.length === 0}
                      className="h-3.5 w-3.5"
                    />
                    <span>Días hábiles</span>
                  </label>
                  <label
                    className="flex items-center gap-1.5 h-6 px-2 text-xs rounded border bg-background cursor-pointer select-none"
                    title="Oculta sábados y domingos en la grilla del Gantt (no modifica las fechas de las tareas)."
                  >
                    <Checkbox
                      checked={hideWeekends}
                      onCheckedChange={(v) => setHideWeekends(v === true)}
                      className="h-3.5 w-3.5"
                    />
                    <span>Ocultar fines de semana</span>
                  </label>
                  {/* Zoom controls */}
                  <div className="flex items-center gap-0.5 border rounded h-6 px-1 bg-background">
                    <button
                      className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted disabled:opacity-40"
                      onClick={() => setZoomLevel(prev => {
                        const idx = ZOOM_LEVELS.indexOf(prev);
                        return idx > 0 ? ZOOM_LEVELS[idx - 1] : prev;
                      })}
                      disabled={zoomLevel === ZOOM_LEVELS[0]}
                      title="Reducir zoom"
                    >
                      <ZoomOut className="h-3 w-3" />
                    </button>
                    <span className="text-xs w-8 text-center tabular-nums">{zoomLevel}%</span>
                    <button
                      className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted disabled:opacity-40"
                      onClick={() => setZoomLevel(prev => {
                        const idx = ZOOM_LEVELS.indexOf(prev);
                        return idx < ZOOM_LEVELS.length - 1 ? ZOOM_LEVELS[idx + 1] : prev;
                      })}
                      disabled={zoomLevel === ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
                      title="Aumentar zoom"
                    >
                      <ZoomIn className="h-3 w-3" />
                    </button>
                  </div>
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
                      onClick={() => { setExportMode("all"); setExportSelectedIds(new Set()); setExportDialogOpen(true); }}
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
            <div className="flex sticky left-0 z-[21] bg-muted flex-shrink-0">
            <div className="flex-shrink-0 w-6" /> {/* Grip handle space */}
            <div
              className="flex-shrink-0 border-r overflow-hidden font-medium text-xs"
              style={{ width: cw("index", INDEX_COL_WIDTH) }}
            >
              {cw("index", INDEX_COL_WIDTH) > 0 && (
                colSelectMode ? (
                  <div
                    className="flex items-center justify-center h-full gap-1 px-2 py-2 cursor-pointer select-none"
                    onClick={() => setColPending(prev => { const n = new Set(prev); n.has("index") ? n.delete("index") : n.add("index"); return n; })}
                  >
                    <Checkbox checked={colPending.has("index")} className="h-3 w-3 pointer-events-none" />
                    <span>#</span>
                  </div>
                ) : (
                  <div className="text-center px-2 py-2">#</div>
                )
              )}
            </div>
            <div className="relative flex-shrink-0 border-r px-2 py-2 font-medium text-xs" style={{ width: taskNameColWidth - 6 }}>
              Tarea
              <div
                className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/40 active:bg-primary/60"
                onMouseDown={(e) => {
                  e.preventDefault();
                  const startX = e.clientX;
                  const startWidth = taskNameColWidth;
                  const onMove = (ev: MouseEvent) => {
                    const delta = ev.clientX - startX;
                    setTaskNameColWidth(Math.max(150, startWidth + delta));
                  };
                  const onUp = () => {
                    window.removeEventListener("mousemove", onMove);
                    window.removeEventListener("mouseup", onUp);
                  };
                  window.addEventListener("mousemove", onMove);
                  window.addEventListener("mouseup", onUp);
                }}
              />
            </div>
            <div
              className="flex-shrink-0 border-r overflow-hidden font-medium text-xs"
              style={{ width: cw("responsible", RESPONSIBLE_COL_WIDTH) }}
            >
              {cw("responsible", RESPONSIBLE_COL_WIDTH) > 0 && (
                colSelectMode ? (
                  <div
                    className="flex items-center justify-center h-full gap-1 px-2 py-2 cursor-pointer select-none"
                    onClick={() => setColPending(prev => { const n = new Set(prev); n.has("responsible") ? n.delete("responsible") : n.add("responsible"); return n; })}
                  >
                    <Checkbox checked={colPending.has("responsible")} className="h-3 w-3 pointer-events-none" />
                    <span>Responsable</span>
                  </div>
                ) : (
                  <div className="text-center px-2 py-2">Responsable</div>
                )
              )}
            </div>
            <div
              className="flex-shrink-0 border-r overflow-hidden font-medium text-xs"
              style={{ width: cw("start", DATE_COL_WIDTH) }}
            >
              {cw("start", DATE_COL_WIDTH) > 0 && (
                colSelectMode ? (
                  <div
                    className="flex items-center justify-center h-full gap-1 px-2 py-2 cursor-pointer select-none"
                    onClick={() => setColPending(prev => { const n = new Set(prev); n.has("start") ? n.delete("start") : n.add("start"); return n; })}
                  >
                    <Checkbox checked={colPending.has("start")} className="h-3 w-3 pointer-events-none" />
                    <span>Inicio</span>
                  </div>
                ) : (
                  <div className="text-center px-2 py-2">Inicio</div>
                )
              )}
            </div>
            <div
              className="flex-shrink-0 border-r overflow-hidden font-medium text-xs"
              style={{ width: cw("duration", DURATION_COL_WIDTH) }}
            >
              {cw("duration", DURATION_COL_WIDTH) > 0 && (
                colSelectMode ? (
                  <div
                    className="flex items-center justify-center h-full gap-1 px-2 py-2 cursor-pointer select-none"
                    onClick={() => setColPending(prev => { const n = new Set(prev); n.has("duration") ? n.delete("duration") : n.add("duration"); return n; })}
                  >
                    <Checkbox checked={colPending.has("duration")} className="h-3 w-3 pointer-events-none" />
                    <span>Plazo</span>
                  </div>
                ) : (
                  <div className="text-center px-2 py-2">Plazo</div>
                )
              )}
            </div>
            <div
              className="flex-shrink-0 border-r overflow-hidden font-medium text-xs"
              style={{ width: cw("end", endColWidth) }}
            >
              {cw("end", endColWidth) > 0 && (
                colSelectMode ? (
                  <div
                    className="flex items-center justify-center h-full gap-1 px-2 py-2 cursor-pointer select-none"
                    onClick={() => setColPending(prev => { const n = new Set(prev); n.has("end") ? n.delete("end") : n.add("end"); return n; })}
                  >
                    <Checkbox checked={colPending.has("end")} className="h-3 w-3 pointer-events-none" />
                    <span>Término</span>
                  </div>
                ) : (
                  <div className="text-center px-2 py-2">Término</div>
                )
              )}
            </div>
            <div
              className="flex-shrink-0 border-r overflow-hidden font-medium text-xs"
              style={{ width: cw("reprog", REPROG_COL_WIDTH) }}
            >
              {cw("reprog", REPROG_COL_WIDTH) > 0 && (
                colSelectMode ? (
                  <div
                    className="flex items-center justify-center h-full gap-1 px-2 py-2 cursor-pointer select-none"
                    onClick={() => setColPending(prev => { const n = new Set(prev); n.has("reprog") ? n.delete("reprog") : n.add("reprog"); return n; })}
                  >
                    <Checkbox checked={colPending.has("reprog")} className="h-3 w-3 pointer-events-none" />
                    <span title="Reprogramación">Reprog.</span>
                  </div>
                ) : (
                  <div className="text-center px-2 py-2" title="Reprogramación">Reprog.</div>
                )
              )}
            </div>
            <div
              className="flex-shrink-0 border-r overflow-hidden font-medium text-xs"
              style={{ width: cw("progress", PROGRESS_COL_WIDTH) }}
            >
              {cw("progress", PROGRESS_COL_WIDTH) > 0 && (
                colSelectMode ? (
                  <div
                    className="flex items-center justify-center h-full gap-1 px-2 py-2 cursor-pointer select-none"
                    onClick={() => setColPending(prev => { const n = new Set(prev); n.has("progress") ? n.delete("progress") : n.add("progress"); return n; })}
                  >
                    <Checkbox checked={colPending.has("progress")} className="h-3 w-3 pointer-events-none" />
                    <span>% Avance Prog.</span>
                  </div>
                ) : (
                  <div className="text-center px-2 py-2">% Avance Prog.</div>
                )
              )}
            </div>
            <div
              className="flex-shrink-0 border-r overflow-hidden font-medium text-xs"
              style={{ width: cw("progressReal", PROGRESS_REAL_COL_WIDTH) }}
            >
              {cw("progressReal", PROGRESS_REAL_COL_WIDTH) > 0 && (
                colSelectMode ? (
                  <div
                    className="flex items-center justify-center h-full gap-1 px-2 py-2 cursor-pointer select-none"
                    onClick={() => setColPending(prev => { const n = new Set(prev); n.has("progressReal") ? n.delete("progressReal") : n.add("progressReal"); return n; })}
                  >
                    <Checkbox checked={colPending.has("progressReal")} className="h-3 w-3 pointer-events-none" />
                    <span>% Avance Real</span>
                  </div>
                ) : (
                  <div className="text-center px-2 py-2">% Avance Real</div>
                )
              )}
            </div>
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
              return (
                <div
                  className="absolute top-0 pointer-events-none z-[5] bg-primary/10 border-l border-r border-primary/40"
                  style={{
                    left: headerOffset + todayIdx * DAY_WIDTH,
                    width: DAY_WIDTH,
                    height: visibleTasks.length * ROW_HEIGHT + ROW_HEIGHT,
                  }}
                />
              );
            })()}
            {/* Rent start date vertical marker - dashed red line */}
            {(() => {
              if (!rentStartDate) return null;
              const idx = days.findIndex((d) => format(d, "yyyy-MM-dd") === rentStartDate);
              if (idx < 0) return null;
              const totalHeight = visibleTasks.length * ROW_HEIGHT + ROW_HEIGHT;
              const formatted = format(new Date(rentStartDate + "T00:00:00"), "dd/MM/yyyy");
              return (
                <div
                  className="absolute top-0 pointer-events-none z-[6] group"
                  style={{
                    left: headerOffset + idx * DAY_WIDTH + DAY_WIDTH / 2 - 1,
                    width: 2,
                    height: totalHeight,
                    borderLeft: "2px dashed hsl(var(--destructive))",
                  }}
                  title={`Inicio pago de renta — ${formatted}`}
                >
                  <span className="absolute -top-4 left-1 text-[10px] font-semibold text-destructive whitespace-nowrap bg-background/80 px-1 rounded">
                    Inicio renta
                  </span>
                </div>
              );
            })()}
            {/* Week separators (Fri→Mon) when weekends are hidden */}
            {hideWeekends && (() => {
              const totalHeight = visibleTasks.length * ROW_HEIGHT + ROW_HEIGHT;
              const seps: number[] = [];
              for (let i = 0; i < days.length - 1; i++) {
                if (days[i].getDay() === 5 && days[i + 1].getDay() === 1) seps.push(i + 1);
              }
              return seps.map((sepIdx) => (
                <div
                  key={`wk-sep-${sepIdx}`}
                  className="absolute top-0 pointer-events-none z-[6]"
                  style={{
                    left: headerOffset + sepIdx * DAY_WIDTH + 11,
                    width: 2,
                    height: totalHeight,
                    background: "hsl(var(--foreground))",
                  }}
                />
              ));
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
                  <marker
                    id="arrowhead-selected"
                    markerWidth="9"
                    markerHeight="7"
                    refX="7"
                    refY="3.5"
                    orient="auto"
                  >
                    <polygon
                      points="0 0, 9 3.5, 0 7"
                      className="fill-amber-500"
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
                  
                  const isSelected = selectedDependencyId === arrow.id;
                  const midX = (arrow.fromX + arrow.toX) / 2;
                  const midY = (arrow.fromY + arrow.toY) / 2;
                  return (
                    <g key={arrow.id} className="group/arrow">
                      {/* Wide invisible hit area — click anywhere on the line to select */}
                      <path
                        d={pathD}
                        fill="none"
                        stroke="transparent"
                        strokeWidth="20"
                        className="cursor-pointer [pointer-events:stroke]"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDependencyId((prev) => (prev === arrow.id ? null : arrow.id));
                        }}
                      />
                      {/* Visible arrow path */}
                      <path
                        d={pathD}
                        fill="none"
                        className={cn(
                          "transition-colors pointer-events-none",
                          isSelected
                            ? "stroke-amber-500"
                            : "stroke-primary group-hover/arrow:stroke-amber-500",
                        )}
                        strokeWidth={isSelected ? "3.5" : "2"}
                        markerEnd={isSelected ? "url(#arrowhead-selected)" : "url(#arrowhead)"}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {/* Delete handle — visible only when the dependency is selected */}
                      {isSelected && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <g
                                className="cursor-pointer pointer-events-auto"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRemoveDependency(arrow.id);
                                  setSelectedDependencyId(null);
                                }}
                              >
                                <circle
                                  cx={midX}
                                  cy={midY}
                                  r="9"
                                  className="fill-background stroke-destructive"
                                  strokeWidth="1.5"
                                />
                                <line x1={midX - 3.5} y1={midY - 3.5} x2={midX + 3.5} y2={midY + 3.5} className="stroke-destructive pointer-events-none" strokeWidth="1.75" />
                                <line x1={midX + 3.5} y1={midY - 3.5} x2={midX - 3.5} y2={midY + 3.5} className="stroke-destructive pointer-events-none" strokeWidth="1.75" />
                              </g>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">Eliminar dependencia</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </g>
                  );
                })}
              </svg>
            )}

            {/* Fila-resumen no editable: fecha de inicio/término de todo el
                cronograma, arriba de todas las tareas (solo cronogramas
                "general" — no aplica a Cronogramas de Mantenciones). */}
            {showSummaryRow && (
              <div className="flex border-b-2 border-border bg-muted/40" style={{ height: ROW_HEIGHT }}>
                <div className="flex sticky left-0 z-[15] bg-muted/40 flex-shrink-0">
                  <div className="flex-shrink-0 w-6" />
                  <div className="flex-shrink-0 border-r overflow-hidden" style={{ width: cw("index", INDEX_COL_WIDTH) }} />
                  <div className="flex-shrink-0 border-r px-2 flex items-center font-semibold text-xs truncate" style={{ width: taskNameColWidth }}>
                    Cronograma completo
                  </div>
                  <div className="flex-shrink-0 border-r overflow-hidden" style={{ width: cw("responsible", RESPONSIBLE_COL_WIDTH) }} />
                  <div className="flex-shrink-0 border-r overflow-hidden flex items-center justify-center font-medium text-xs" style={{ width: cw("start", DATE_COL_WIDTH) }}>
                    {overallStart ? format(parseISO(overallStart), "dd/MM/yy") : "—"}
                  </div>
                  <div className="flex-shrink-0 border-r overflow-hidden" style={{ width: cw("duration", DURATION_COL_WIDTH) }} />
                  <div className="flex-shrink-0 border-r overflow-hidden flex items-center justify-center font-medium text-xs" style={{ width: cw("end", endColWidth) }}>
                    {overallEnd ? format(parseISO(overallEnd), "dd/MM/yy") : "—"}
                  </div>
                  <div className="flex-shrink-0 border-r overflow-hidden" style={{ width: cw("reprog", REPROG_COL_WIDTH) }} />
                  <div className="flex-shrink-0 border-r overflow-hidden" style={{ width: cw("progress", PROGRESS_COL_WIDTH) }} />
                  <div className="flex-shrink-0 border-r overflow-hidden" style={{ width: cw("progressReal", PROGRESS_REAL_COL_WIDTH) }} />
                </div>
                <div className="relative flex-1" style={{ width: totalDays * DAY_WIDTH }}>
                  <div className="absolute inset-0 flex pointer-events-none">
                    {days.map((day, idx) => (
                      <div key={idx} className="flex-shrink-0 border-r h-full" style={{ width: DAY_WIDTH }} />
                    ))}
                  </div>
                  {summaryPosition.visible && (
                    <div
                      className="absolute top-3 h-3.5 rounded-full bg-foreground/60 pointer-events-none"
                      style={{ left: summaryPosition.left, width: Math.max(summaryPosition.width - 4, 8) }}
                      title={`${overallStart ? format(parseISO(overallStart), "dd/MM/yyyy") : ""} → ${overallEnd ? format(parseISO(overallEnd), "dd/MM/yyyy") : ""}`}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Task rows */}
            {visibleTasks.map((entry, rowIdx) => {
              if (entry.isNewRow) {
                const indent = 4 + entry.level * 12;
                return (
                  <div
                    key="new-task-row"
                    className="flex border-b bg-primary/5"
                    style={{ height: ROW_HEIGHT }}
                    onKeyDown={handleKeyDown}
                  >
                    <div className="flex sticky left-0 z-[15] bg-primary/5 flex-shrink-0">
                    <div className="flex-shrink-0 w-6" />
                    <div className="flex-shrink-0 border-r overflow-hidden" style={{ width: cw("index", INDEX_COL_WIDTH) }} />
                    <div className="flex-shrink-0 border-r px-1 flex items-center gap-1" style={{ width: taskNameColWidth - 6, paddingLeft: indent }}>
                      <span className="w-4 flex-shrink-0" />
                      <Input
                        ref={nameInputRef}
                        value={newTaskRow!.name}
                        onChange={(e) => handleNewTaskChange("name", e.target.value)}
                        placeholder="Nombre de la tarea..."
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="flex-shrink-0 border-r overflow-hidden" style={{ width: cw("responsible", RESPONSIBLE_COL_WIDTH) }} />
                    <div className="flex-shrink-0 border-r overflow-hidden flex items-center justify-center" style={{ width: cw("start", DATE_COL_WIDTH) }}>
                      <DatePickerCell
                        value={newTaskRow!.start_date || null}
                        onChange={(date) => handleNewTaskChange("start_date", date)}
                        placeholder="Inicio"
                        showTaskDates={true}
                        taskDates={taskDates}
                      />
                    </div>
                    <div className="flex-shrink-0 border-r overflow-hidden flex items-center px-1 gap-1" style={{ width: cw("duration", DURATION_COL_WIDTH) }}>
                      <Input
                        type="number"
                        min={1}
                        value={newTaskRow!.duration_days}
                        onChange={(e) => handleNewTaskChange("duration_days", parseInt(e.target.value) || 1)}
                        className="h-7 text-xs w-10 text-center"
                      />
                      <Select
                        value={newTaskRow!.duration_type}
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
                    <div className="flex-shrink-0 border-r overflow-hidden flex items-center justify-center" style={{ width: cw("end", endColWidth) }}>
                      <DatePickerCell
                        value={newTaskRow!.end_date || null}
                        onChange={(date) => handleNewTaskChange("end_date", date)}
                        placeholder="Término"
                        showTaskDates={true}
                        taskDates={taskDates}
                      />
                    </div>
                    <div className="flex-shrink-0 border-r overflow-hidden" style={{ width: cw("reprog", REPROG_COL_WIDTH) }} />
                    <div className="flex-shrink-0 border-r overflow-hidden" style={{ width: cw("progress", PROGRESS_COL_WIDTH) }} />
                    <div className="flex-shrink-0 border-r overflow-hidden" style={{ width: cw("progressReal", PROGRESS_REAL_COL_WIDTH) }} />
                    </div>
                    <div className="flex items-center px-2 gap-2">
                      <Button size="sm" className="h-7 text-xs" onClick={handleSaveNewTask} disabled={!newTaskRow!.name.trim() || isSaving}>
                        {isSaving ? "..." : "Agregar"}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setNewTaskRow(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                );
              }
              const { task, level } = entry;
              // Robusto: una tarea es "madre" si CUALQUIER tarea la referencia como padre
              // en el arreglo plano, aunque el árbol anidado (task.children) esté desactualizado.
              // Así su inicio/plazo/término siempre se derivan de las hijas y un duration_days
              // corrupto nunca vuelve a dibujarla como hoja (2013/2050).
              const hasChildren = parentTaskIds.has(task.id) || !!(task.children && task.children.length > 0);
              const isDiscarded = task.status === "discarded";
              const isExpanded = expandedTasks.has(task.id);
              const position = getTaskPosition(task);
              const effective = getEffectiveColor(task);
              const rowNumber = rowIdx + 1;
              // Solo las líneas madre (las que muestran chevron, es decir, con hijas)
              // se colorean: fondo con el color de SU GRUPO de primer nivel (raíz de
              // la rama) al 70% de transparencia (mezcla con blanco → lightenHex 0.7)
              // y texto en negrita, desde "#" hasta "% Avance". Las hojas NO se colorean.
              const branchColor = hasChildren ? getBranchRootColor(task) : null;
              const depBg = branchColor ? lightenHex(branchColor, 0.7) : null;

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
                        task.status === "completed" && "bg-muted/30",
                        isDiscarded && "bg-muted/20 opacity-60",
                        hasChildren && "font-bold"
                      )}
                      style={{ height: ROW_HEIGHT }}
                    >
                  {/* Columnas fijas congeladas en el scroll horizontal */}
                  <div
                    className="flex sticky left-0 z-[15] flex-shrink-0 bg-background"
                    style={depBg ? { backgroundColor: depBg } : undefined}
                  >
                  {/* Drag handle */}
                  <div className="flex-shrink-0 flex items-center justify-center w-6 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                  </div>

                  {/* Row number — con marco del color de la línea (padre: su color; hija: tono más claro) */}
                  <div
                    className="flex-shrink-0 border-r overflow-hidden flex items-center justify-center"
                    style={{ width: cw("index", INDEX_COL_WIDTH) }}
                  >
                    <span
                      className="inline-flex items-center justify-center text-[11px] font-semibold rounded min-w-[22px] h-5 px-1"
                      style={
                        effective.color
                          ? { border: `${hasChildren ? 4 : 2}px solid ${effective.color}`, backgroundColor: `${effective.color}1a`, color: "#374151" }
                          : { color: "#9ca3af" }
                      }
                    >
                      {hierarchicalLabels.get(task.id) ?? ""}
                    </span>
                  </div>

                  {/* Task name */}
                  <div
                    className="flex-shrink-0 border-r px-1 flex items-center gap-1 overflow-hidden"
                    style={{ width: taskNameColWidth - 6, paddingLeft: 4 + level * 12 }}
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
                    <StatusDot status={task.status} className="flex-shrink-0" />
                    {isAdmin ? (
                      <TaskNameInput
                        taskId={task.id}
                        value={task.name}
                        completed={task.status === "completed" || isDiscarded}
                        onCommit={(newValue) => handleUpdateTaskField(task.id, "name", newValue)}
                      />
                    ) : (
                      <span
                        className={cn(
                          "flex-1 h-7 text-xs px-1 flex items-center truncate",
                          (task.status === "completed" || isDiscarded) && "line-through text-muted-foreground"
                        )}
                        title={task.name}
                      >
                        {task.name}
                      </span>
                    )}
                    {/* Red: predecessor indicator */}
                    {!hasChildren && task.dependencies && task.dependencies.length > 0 && (
                      <button
                        type="button"
                        className="flex-shrink-0 rounded hover:bg-red-100 p-0.5"
                        title="Ver predecesoras"
                        onClick={(e) => { e.stopPropagation(); setDepViewTaskId(task.id); setDepViewMode("predecessors"); }}
                      >
                        <ArrowLeft className="h-3 w-3 text-red-500" />
                      </button>
                    )}

                    {/* Chain link button (only for non-parent tasks): abre el editor de dependencias (modal XL) */}
                    {!hasChildren && isAdmin && (
                      <button
                        type="button"
                        className={cn(
                          "flex-shrink-0 rounded hover:bg-muted p-0.5",
                          !(task.dependencies && task.dependencies.length > 0) && "opacity-0 group-hover:opacity-100"
                        )}
                        title={task.dependencies && task.dependencies.length > 0 ? "Ver/editar dependencias" : "Agregar dependencia"}
                        onClick={(e) => { e.stopPropagation(); setDepPopoverTaskId(task.id); }}
                      >
                        <Link className="h-3 w-3 text-muted-foreground" />
                      </button>
                    )}

                    {/* Green: successor indicator */}
                    {!hasChildren && tasks.some(t => t.dependencies?.some(d => d.depends_on_task_id === task.id)) && (
                      <button
                        type="button"
                        className="flex-shrink-0 rounded hover:bg-green-100 p-0.5"
                        title="Ver sucesoras"
                        onClick={(e) => { e.stopPropagation(); setDepViewTaskId(task.id); setDepViewMode("successors"); }}
                      >
                        <ArrowRight className="h-3 w-3 text-green-500" />
                      </button>
                    )}
                    {(isAdmin || canComplete) && (
                      <TaskStatusActions
                        task={task}
                        canComplete={isAdmin || canComplete}
                        canDiscard={isAdmin && !!onDiscardTask && !!onRestoreTask}
                        onToggleComplete={toggleTaskCompleted}
                        onDiscard={(id) => onDiscardTask!(id)}
                        onRestore={(id) => onRestoreTask!(id)}
                        descendantCount={getDescendantCount?.(task.id) ?? 0}
                        size="sm"
                      />
                    )}
                    {isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 flex-shrink-0"
                      onClick={() => handleAddNewRow(task.id)}
                      title="Agregar tarea hija"
                    >
                      <Plus className="h-3 w-3 text-primary" />
                    </Button>
                    )}
                    {isAdmin && task.parent_id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 flex-shrink-0"
                        title="Subir un nivel jerárquico"
                        onClick={async () => {
                          const parent = tasks.find((t) => t.id === task.parent_id);
                          const newParentId = parent?.parent_id ?? null;
                          const oldParentId = task.parent_id;
                          await onUpdateTask(task.id, { parent_id: newParentId }, { skipPropagation: true });
                          if (oldParentId) {
                            await syncAncestorsDates(oldParentId);
                          }
                          if (newParentId) {
                            await syncAncestorsDates(newParentId);
                          }
                        }}
                      >
                        <CornerLeftUp className="h-3 w-3 text-primary" />
                      </Button>
                    )}
                    {isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 flex-shrink-0"
                      onClick={async () => {
                        if (!window.confirm(
                          hasChildren
                            ? `¿Eliminar "${task.name}" y todas sus subtareas? Podrás deshacerlo con Ctrl+Z (Cmd+Z).`
                            : `¿Eliminar "${task.name}"? Podrás deshacerlo con Ctrl+Z (Cmd+Z).`,
                        )) return;
                        const parentId = task.parent_id;
                        // Collect this task and all descendants to exclude from sync
                        const collectIds = (id: string): string[] => {
                          const direct = tasks.filter((t) => t.parent_id === id).map((t) => t.id);
                          return [id, ...direct.flatMap(collectIds)];
                        };
                        const excludeIds = new Set(collectIds(task.id));
                        if (parentId) {
                          // Sync first (using current state minus deleted) then delete
                          await syncAncestorsDates(parentId, new Map(), excludeIds);
                        }
                        await onDeleteTask(task.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                    )}
                  </div>

                  {/* Responsable */}
                  <div
                    className="flex-shrink-0 border-r overflow-hidden flex items-center px-1"
                    style={{ width: cw("responsible", RESPONSIBLE_COL_WIDTH) }}
                  >
                    {isAdmin ? (
                      <SearchableSelect
                        value={task.responsible_member_id ?? ""}
                        onValueChange={(v) =>
                          handleUpdateTaskField(task.id, "responsible_member_id", v || null)
                        }
                        options={[
                          { value: "", label: "Sin asignar" },
                          ...orgMembers.map((m) => ({
                            value: m.id,
                            label: m.position ? `${m.name} — ${m.position}` : m.name,
                          })),
                        ]}
                        placeholder="Sin asignar"
                        searchPlaceholder="Buscar persona..."
                        triggerClassName="h-7 text-xs"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground truncate px-1">
                        {orgMembers.find((m) => m.id === task.responsible_member_id)?.name ?? "Sin asignar"}
                      </span>
                    )}
                  </div>

                  <div className="flex-shrink-0 border-r overflow-hidden flex items-center justify-center" style={{ width: cw("start", DATE_COL_WIDTH) }}>
                    {/* Líneas madre: inicio/plazo/término se calculan desde las hijas (no editables) */}
                    <DatePickerCell
                      value={hasChildren ? getEffectiveDates(task).start : task.start_date}
                      onChange={(date) => handleUpdateTaskField(task.id, "start_date", date)}
                      placeholder="Inicio"
                      editable={isAdmin && !hasChildren}
                    />
                  </div>

                  {/* Duration */}
                  <div className="flex-shrink-0 border-r overflow-hidden flex items-center px-1" style={{ width: cw("duration", DURATION_COL_WIDTH) }}>
                    {hasChildren ? (
                      <span className="text-xs px-1 text-muted-foreground" title="Calculado según las líneas hijas">
                        {(() => {
                          const { start, end } = getEffectiveDates(task);
                          return start && end
                            ? Math.max(1, Math.round((parseISO(end).getTime() - parseISO(start).getTime()) / 86400000) + 1)
                            : "—";
                        })()}
                      </span>
                    ) : (
                      <DurationInput
                        value={task.duration_days ?? 1}
                        onCommit={(n) => handleUpdateTaskField(task.id, "duration_days", n)}
                        editable={isAdmin}
                      />
                    )}
                    <span
                      className={cn(
                        "text-[10px]",
                        !hasChildren && task.duration_days === 0 ? "text-amber-600 font-medium" : "text-muted-foreground"
                      )}
                      title={!hasChildren && task.duration_days === 0 ? "Sin plazo: no consume tiempo" : undefined}
                    >
                      {!hasChildren && task.duration_days === 0 ? "sin plazo" : (task.duration_type === "business" ? "háb" : "días")}
                    </span>
                  </div>

                  {/* End date */}
                  <div className="flex-shrink-0 border-r overflow-hidden flex items-center justify-center" style={{ width: cw("end", endColWidth) }}>
                    <DatePickerCell
                      value={hasChildren ? getEffectiveDates(task).end : task.end_date}
                      onChange={(date) => handleUpdateTaskField(task.id, "end_date", date)}
                      placeholder="Término"
                      editable={isAdmin && !hasChildren}
                      suffix={(() => {
                        const oldEnd = reprogOldEnd.get(task.id);
                        if (!oldEnd || !task.end_date) return null;
                        const delta = differenceInDays(parseISO(task.end_date), parseISO(oldEnd));
                        if (delta === 0) return null;
                        return (
                          <span className="text-[10px] font-bold text-red-500 leading-none whitespace-nowrap">
                            ({format(parseISO(oldEnd), "dd/MM/yy")}) {delta > 0 ? "+" : ""}{delta} días
                          </span>
                        );
                      })()}
                    />
                  </div>

                  {/* Reprog */}
                  <div className="flex-shrink-0 border-r overflow-hidden flex items-center justify-center px-1" style={{ width: cw("reprog", REPROG_COL_WIDTH) }}>
                    {!hasChildren && (isAdmin || canReprogram) && (
                      <input
                        type="number"
                        value={reprogValues.get(task.id) ?? "0"}
                        onChange={(e) => {
                          const v = e.target.value;
                          setReprogValues(prev => new Map(prev).set(task.id, v));
                        }}
                        onKeyDown={async (e) => {
                          if (e.key === "Enter") await commitReprogDelta(task);
                        }}
                        onBlur={async () => { await commitReprogDelta(task); }}
                        className="h-7 text-xs w-14 text-center border border-gray-200 rounded px-1 focus:outline-none focus:border-amber-400"
                        title="Días de reprogramación (positivo = atrasa, negativo = adelanta). Arrastra dependientes en cascada."
                      />
                    )}
                  </div>

                  {/* % Avance Prog. — de solo lectura: según el PLAN ORIGINAL (fechas
                      de baseline, fijas desde que la tarea nació). */}
                  <div className="flex-shrink-0 border-r overflow-hidden flex items-center justify-center px-1" style={{ width: cw("progress", PROGRESS_COL_WIDTH) }}>
                    <span className="text-xs text-muted-foreground" title="Avance esperado según el plan original (no editable)">
                      {getEffectiveScheduledProgress(task)}%
                    </span>
                  </div>

                  {/* % Avance Real — de solo lectura: según las fechas ACTUALES
                      (las que cambian con Reprog., arrastre o cascada). Alimenta
                      la línea real de la Curva S. */}
                  <div className="flex-shrink-0 border-r overflow-hidden flex items-center justify-center px-1" style={{ width: cw("progressReal", PROGRESS_REAL_COL_WIDTH) }}>
                    <span className="text-xs text-muted-foreground" title="Avance según las fechas vigentes hoy (no editable) — cambia con Reprog.">
                      {getEffectiveCurrentProgress(task)}%
                    </span>
                  </div>
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
                                barDragTaskId === task.id && "ring-2 ring-primary",
                                selectedDependency?.predecessorId === task.id && "ring-2 ring-amber-500 ring-offset-1",
                                selectedDependency?.dependentId === task.id && "ring-2 ring-violet-500 ring-offset-1"
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
                                const effectiveProgress = getEffectiveProgress(task);
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
                                {position.width > 60 ? task.name : (hierarchicalLabels.get(task.id) ?? "")}
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
                              <p className="text-xs">Progreso: {hasChildren ? `${getEffectiveProgress(task)}% (hijas)` : (task.progress && task.progress > 0 ? `${task.progress}% (manual)` : `${computeAutoProgress(task)}% (auto)`)}</p>
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
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      className="text-xs"
                      onClick={() => openParentDialog(task.id)}
                    >
                      Cambiar tarea padre…
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}

            {/* Add task button row */}
            {!newTaskRow && (
              <div
                className="flex items-center border-b hover:bg-muted/20 cursor-pointer transition-colors"
                style={{ height: ROW_HEIGHT }}
                onClick={() => handleAddNewRow(null)}
              >
                <div className="flex-shrink-0 w-6" /> {/* Grip handle space */}
                <div className="flex-shrink-0" style={{ width: INDEX_COL_WIDTH }} />
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
      </div>

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

      {/* Change parent dialog */}
      <Dialog open={!!parentDialogTaskId} onOpenChange={(o) => { if (!o) setParentDialogTaskId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar tarea padre</DialogTitle>
            <DialogDescription>
              Selecciona la nueva tarea padre. Elige "(Sin padre)" para convertirla en tarea raíz.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {(() => {
              const currentTask = tasks.find((t) => t.id === parentDialogTaskId);
              const isDescendantOf = (ancestorId: string, candidateId: string): boolean => {
                let current = tasks.find((t) => t.id === candidateId);
                while (current?.parent_id) {
                  if (current.parent_id === ancestorId) return true;
                  current = tasks.find((t) => t.id === current!.parent_id);
                }
                return false;
              };
              const options = [
                { value: "__root__", label: "(Sin padre — tarea raíz)" },
                ...tasks
                  .filter((t) =>
                    parentDialogTaskId
                      ? t.id !== parentDialogTaskId && !isDescendantOf(parentDialogTaskId, t.id)
                      : true
                  )
                  .map((t) => ({ value: t.id, label: t.name })),
              ];
              return (
                <>
                  <p className="text-xs text-muted-foreground mb-2">
                    Tarea: <strong>{currentTask?.name}</strong>
                  </p>
                  <SearchableSelect
                    value={parentDialogValue}
                    onValueChange={setParentDialogValue}
                    options={options}
                    placeholder="Buscar tarea padre..."
                    searchPlaceholder="Escribe para buscar..."
                  />
                </>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setParentDialogTaskId(null)}>
              Cancelar
            </Button>
            <Button onClick={handleChangeParent}>Aplicar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dependency view dialog */}
      {depViewTaskId && (
        <Dialog open={!!depViewTaskId} onOpenChange={(open) => !open && setDepViewTaskId(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {depViewMode === "predecessors" ? "Predecesoras" : "Sucesoras"} de "{tasks.find(t=>t.id===depViewTaskId)?.name}"
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-2 p-2">
              {depViewMode === "predecessors" && (() => {
                const task = tasks.find(t => t.id === depViewTaskId);
                if (!task?.dependencies?.length) return <p className="text-sm text-muted-foreground">Sin predecesoras</p>;
                return task.dependencies.map(dep => {
                  const predTask = tasks.find(t => t.id === dep.depends_on_task_id);
                  if (!predTask) return null;
                  const isGhost = predTask.status === "discarded";
                  return (
                    <div key={dep.id} className={cn("flex items-center gap-2 p-2 border rounded bg-muted/30", isGhost && "opacity-50 border-dashed")}>
                      <div className={cn("flex-1 p-2 rounded text-sm font-medium", isGhost ? "bg-muted border border-dashed line-through text-muted-foreground" : "bg-red-50 border border-red-200")}>
                        {predTask.name}{isGhost && " (descartada)"}
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 p-2 bg-blue-50 border border-blue-200 rounded text-sm font-medium">{task.name}</div>
                      <span className="text-xs text-muted-foreground">{(dep as any).dep_type === "start" ? "al inicio" : "al término"}{(dep as any).lag_days ? ` +${(dep as any).lag_days}d` : ""}</span>
                    </div>
                  );
                });
              })()}
              {depViewMode === "successors" && (() => {
                const task = tasks.find(t => t.id === depViewTaskId);
                const isSourceGhost = task?.status === "discarded";
                const successors = tasks.filter(t => t.dependencies?.some(d => d.depends_on_task_id === depViewTaskId));
                if (!successors.length) return <p className="text-sm text-muted-foreground">Sin sucesoras</p>;
                return successors.map(sucTask => {
                  const dep = sucTask.dependencies?.find(d => d.depends_on_task_id === depViewTaskId);
                  return (
                    <div key={sucTask.id} className={cn("flex items-center gap-2 p-2 border rounded bg-muted/30", isSourceGhost && "opacity-50 border-dashed")}>
                      <div className={cn("flex-1 p-2 rounded text-sm font-medium", isSourceGhost ? "bg-muted border border-dashed line-through text-muted-foreground" : "bg-blue-50 border border-blue-200")}>
                        {task?.name}{isSourceGhost && " (descartada)"}
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 p-2 bg-green-50 border border-green-200 rounded text-sm font-medium">{sucTask.name}</div>
                      <span className="text-xs text-muted-foreground">{(dep as any)?.dep_type === "start" ? "al inicio" : "al término"}{(dep as any)?.lag_days ? ` +${(dep as any).lag_days}d` : ""}</span>
                    </div>
                  );
                });
              })()}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Editor de dependencias (modal XL con explorador jerárquico) */}
      <DependencyDialog
        open={!!depPopoverTaskId}
        onOpenChange={(open) => setDepPopoverTaskId(open ? depPopoverTaskId : null)}
        selectedTask={tasks.find((t) => t.id === depPopoverTaskId) ?? null}
        allTasks={tasks}
        onAddDependency={onAddDependency}
        onRemoveDependency={onRemoveDependency}
        onUpdateDependency={onUpdateDependency}
        onUpdateTask={async (taskId, updates) => { await onUpdateTask(taskId, updates); }}
      />

      {/* Export PDF dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Exportar cronograma PDF</DialogTitle>
          </DialogHeader>

          <RadioGroup value={exportMode} onValueChange={(v) => setExportMode(v as typeof exportMode)} className="gap-3 py-2">
            <div className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/40" onClick={() => setExportMode("all")}>
              <RadioGroupItem value="all" id="exp-all" className="mt-0.5" />
              <Label htmlFor="exp-all" className="cursor-pointer flex flex-col gap-0.5">
                <span className="font-medium">Todo el cronograma</span>
                <span className="text-xs text-muted-foreground">Un PDF con todas las líneas del cronograma</span>
              </Label>
            </div>

            <div className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/40" onClick={() => setExportMode("separate")}>
              <RadioGroupItem value="separate" id="exp-sep" className="mt-0.5" />
              <Label htmlFor="exp-sep" className="cursor-pointer flex flex-col gap-0.5">
                <span className="font-medium">PDF por línea padre</span>
                <span className="text-xs text-muted-foreground">Un PDF separado por cada línea padre, incluyendo sus hijas y descendientes</span>
              </Label>
            </div>

            <div className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/40" onClick={() => setExportMode("selected")}>
              <RadioGroupItem value="selected" id="exp-sel" className="mt-0.5" />
              <Label htmlFor="exp-sel" className="cursor-pointer flex flex-col gap-0.5">
                <span className="font-medium">Líneas padre seleccionadas</span>
                <span className="text-xs text-muted-foreground">Elige qué líneas padre exportar, con sus hijas y descendientes</span>
              </Label>
            </div>
          </RadioGroup>

          {exportMode === "selected" && (
            <div className="border rounded-lg max-h-52 overflow-y-auto">
              <div className="p-2 border-b bg-muted/40 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Líneas padre</span>
                <button
                  className="text-xs text-blue-600 hover:underline"
                  onClick={() => setExportSelectedIds(new Set(taskTree.map(t => t.id)))}
                >
                  Seleccionar todas
                </button>
              </div>
              {taskTree.map(parent => (
                <label
                  key={parent.id}
                  className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/30 cursor-pointer"
                >
                  <Checkbox
                    checked={exportSelectedIds.has(parent.id)}
                    onCheckedChange={(checked) =>
                      setExportSelectedIds(prev => {
                        const n = new Set(prev);
                        checked ? n.add(parent.id) : n.delete(parent.id);
                        return n;
                      })
                    }
                  />
                  <span className="text-sm truncate">{parent.name}</span>
                </label>
              ))}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setExportDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={exportMode === "selected" && exportSelectedIds.size === 0}
              onClick={() => {
                setExportDialogOpen(false);
                onExportPDF?.(hideCompleted, exportMode, exportMode === "selected" ? Array.from(exportSelectedIds) : undefined);
              }}
            >
              <FileDown className="h-3.5 w-3.5 mr-1.5" />
              Exportar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}