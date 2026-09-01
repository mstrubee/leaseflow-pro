import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CalendarDays,
  Download,
  Loader2,
  Maximize2,
  Minimize2,
  ExternalLink,
  Eye,
  EyeOff,
  ListFilter,
  ArrowUpDown,
  CheckSquare,
  Square,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useReportsNavigation } from "@/components/reports/ReportsReturnButton";
import { format, parseISO, eachDayOfInterval, differenceInDays, isWeekend, addDays } from "date-fns";
import { es } from "date-fns/locale";
import { GanttTask, Holiday } from "@/hooks/useGantt";
import { getGanttDateRange } from "@/lib/ganttDateUtils";
import { useEconomicIndicators } from "@/hooks/useEconomicIndicators";
import { useSingleCollapsible } from "@/hooks/useCollapsibleState";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getLogoUrls } from "@/hooks/useAppLogos";
import { CompanyLogo } from "@/components/contracts/CompanyLogo";
import { toast } from "sonner";
import { prefetchOn } from "@/lib/routePrefetch";
import { loadBudgetTotals } from "@/lib/budgetTotals";
import { GanttOverviewTimeline } from "@/components/gantt/GanttOverviewTimeline";

type FilterGantt = "all" | "con" | "sin";
type SortBy = "name" | "capex_desc" | "gantt_first" | "no_gantt_first";
type SortBy2 = "none" | "empresa" | "name" | "capex_desc";

interface Disbursement {
  startDate: string;   // start_date of "Obras Civiles"
  midDate: string;     // midpoint between startDate and endDate
  endDate: string;     // end_date of "Habilitación"
  anticipo: number;    // 30% of capexCLP
  pago1: number;       // 50% of capexCLP
  pago2: number;       // 20% of capexCLP
}

interface GanttContractData {
  contractId: string;
  contractName: string;
  companyNames: string[];
  timelineName: string;
  tasks: GanttTask[];
  taskTree: GanttTask[];
  endDate: string | null;
  capexUF: number;
  capexCLP: number;
  surfaceM2: number; // superficie_edificada_local for UF/m² metric
  disbursement: Disbursement | null;
  address: string | null; // calle + número, de contract_addresses
  commune: string | null;
  cebe: string | null; // custom field "CEBE" / "Código"
}

const buildTree = (flat: GanttTask[]): GanttTask[] => {
  const map = new Map<string, GanttTask>();
  flat.forEach((t) => map.set(t.id, { ...t, children: [] }));
  const roots: GanttTask[] = [];
  map.forEach((t) => {
    if (t.parent_id && map.has(t.parent_id)) {
      map.get(t.parent_id)!.children!.push(t);
    } else {
      roots.push(t);
    }
  });
  const sortRec = (arr: GanttTask[]) => {
    arr.sort((a, b) => a.display_order - b.display_order);
    arr.forEach((t) => t.children && sortRec(t.children));
  };
  sortRec(roots);
  return roots;
};

/**
 * Calcula las fechas EFECTIVAS de cada tarea: una hoja usa sus propias fechas;
 * una tarea madre refleja el mínimo inicio y máximo término de sus descendientes
 * (recursivo). Igual que el Gantt editable (getEffectiveDates), garantiza que la
 * madre siempre refleje a sus hijas aunque el valor guardado esté desactualizado.
 */
const computeEffectiveDatesMap = (
  tasks: GanttTask[]
): Map<string, { start: string | null; end: string | null }> => {
  const childrenByParent = new Map<string, GanttTask[]>();
  tasks.forEach((t) => {
    if (t.parent_id) {
      const arr = childrenByParent.get(t.parent_id) || [];
      arr.push(t);
      childrenByParent.set(t.parent_id, arr);
    }
  });
  const memo = new Map<string, { start: string | null; end: string | null }>();
  const compute = (task: GanttTask): { start: string | null; end: string | null } => {
    const cached = memo.get(task.id);
    if (cached) return cached;
    const kids = childrenByParent.get(task.id) || [];
    if (kids.length === 0) {
      const r = { start: task.start_date, end: task.end_date };
      memo.set(task.id, r);
      return r;
    }
    let minStart: string | null = null;
    let maxEnd: string | null = null;
    for (const c of kids) {
      const { start, end } = compute(c);
      if (start && (!minStart || start < minStart)) minStart = start;
      if (end && (!maxEnd || end > maxEnd)) maxEnd = end;
    }
    const r = { start: minStart, end: maxEnd };
    memo.set(task.id, r);
    return r;
  };
  tasks.forEach((t) => compute(t));
  return memo;
};

const flattenTree = (
  tree: GanttTask[],
  level = 0,
  acc: Array<{ task: GanttTask; level: number }> = []
): Array<{ task: GanttTask; level: number }> => {
  tree.forEach((t) => {
    acc.push({ task: t, level });
    if (t.children && t.children.length > 0) flattenTree(t.children, level + 1, acc);
  });
  return acc;
};

const fetchImageAsDataURL = async (url: string): Promise<string | null> => {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

/** Mini Gantt visualization - read-only, compact */
function MiniGantt({
  taskTree,
  holidays,
  selectionMode = false,
  hiddenIds,
  onToggleHidden,
}: {
  taskTree: GanttTask[];
  holidays: Holiday[];
  selectionMode?: boolean;
  hiddenIds?: Set<string>;
  onToggleHidden?: (id: string) => void;
}) {
  const flat = useMemo(() => flattenTree(taskTree), [taskTree]);
  // Fechas efectivas (madres reflejan a sus hijas), consistentes con el Gantt editable.
  const effDates = useMemo(
    () => computeEffectiveDatesMap(flat.map((f) => f.task)),
    [flat]
  );
  const datesOf = (t: GanttTask) =>
    effDates.get(t.id) ?? { start: t.start_date, end: t.end_date };
  const tasksWithDates = flat.filter((f) => {
    const d = datesOf(f.task);
    return d.start && d.end;
  });

  // Visible rows: in selection mode, show ALL rows (so user can re-toggle them).
  // Out of selection mode, prune subtrees whose root is hidden.
  const visibleFlat = useMemo(() => {
    if (selectionMode) return flat;
    if (!hiddenIds || hiddenIds.size === 0) return flat;
    const acc: Array<{ task: GanttTask; level: number }> = [];
    const walk = (nodes: GanttTask[], level: number) => {
      nodes.forEach((t) => {
        if (hiddenIds.has(t.id)) return;
        acc.push({ task: t, level });
        if (t.children && t.children.length > 0) walk(t.children, level + 1);
      });
    };
    walk(taskTree, 0);
    return acc;
  }, [taskTree, flat, hiddenIds, selectionMode]);

  if (tasksWithDates.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        Sin fechas definidas para visualizar
      </div>
    );
  }

  const { minDate, maxDate } = getGanttDateRange(
    flat.map((f) => {
      const d = datesOf(f.task);
      return { start_date: d.start, end_date: d.end };
    })
  );
  const days = eachDayOfInterval({ start: minDate, end: maxDate });
  const totalDays = days.length;

  const CHECK_COL_WIDTH = selectionMode ? 28 : 0;
  const NAME_COL_WIDTH = 220;
  const DATE_COL_WIDTH = 70;
  const DUR_COL_WIDTH = 55;
  const META_WIDTH = CHECK_COL_WIDTH + NAME_COL_WIDTH + DATE_COL_WIDTH * 2 + DUR_COL_WIDTH;
  const DAY_WIDTH = Math.max(2, Math.min(8, 800 / totalDays));
  const ROW_HEIGHT = 22;
  const HEADER_HEIGHT = 28;

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayIdx = days.findIndex((d) => format(d, "yyyy-MM-dd") === todayStr);

  // Month labels
  const monthMarkers: Array<{ label: string; idx: number }> = [];
  let lastMonth = "";
  days.forEach((d, idx) => {
    const m = format(d, "MMM yy", { locale: es });
    if (m !== lastMonth) {
      monthMarkers.push({ label: m, idx });
      lastMonth = m;
    }
  });

  return (
    <div className="border rounded-md overflow-auto bg-background max-h-[400px]">
      <div style={{ width: META_WIDTH + totalDays * DAY_WIDTH, minWidth: "100%" }}>
        {/* Header */}
        <div
          className="flex sticky top-0 z-10 bg-muted border-b"
          style={{ height: HEADER_HEIGHT }}
        >
          {selectionMode && (
            <div
              className="flex items-center justify-center border-r bg-muted"
              style={{ width: CHECK_COL_WIDTH, flexShrink: 0 }}
            />
          )}
          <div
            className="flex items-center px-2 text-xs font-semibold border-r bg-muted"
            style={{ width: NAME_COL_WIDTH, flexShrink: 0 }}
          >
            Tarea
          </div>
          <div
            className="flex items-center justify-center px-1 text-xs font-semibold border-r bg-muted"
            style={{ width: DATE_COL_WIDTH, flexShrink: 0 }}
          >
            Inicio
          </div>
          <div
            className="flex items-center justify-center px-1 text-xs font-semibold border-r bg-muted"
            style={{ width: DUR_COL_WIDTH, flexShrink: 0 }}
          >
            Plazo
          </div>
          <div
            className="flex items-center justify-center px-1 text-xs font-semibold border-r bg-muted"
            style={{ width: DATE_COL_WIDTH, flexShrink: 0 }}
          >
            Término
          </div>
          <div className="relative flex-1" style={{ height: HEADER_HEIGHT }}>
            {monthMarkers.map((m, i) => (
              <div
                key={i}
                className="absolute top-0 h-full border-l border-border/60 px-1 text-[10px] text-muted-foreground"
                style={{ left: m.idx * DAY_WIDTH }}
              >
                {m.label}
              </div>
            ))}
          </div>
        </div>

        {/* Rows */}
        {visibleFlat.map(({ task, level }, rowIdx) => {
          const eff = datesOf(task);
          const startStr = eff.start;
          const endStr = eff.end;
          const hasDates = !!(startStr && endStr);
          let barLeft = 0;
          let barWidth = 0;
          let durDays = 0;
          if (hasDates) {
            const startOffset = differenceInDays(parseISO(startStr!), minDate);
            durDays =
              differenceInDays(parseISO(endStr!), parseISO(startStr!)) + 1;
            barLeft = startOffset * DAY_WIDTH;
            barWidth = Math.max(1, durDays * DAY_WIDTH);
          }

          const progress = task.progress ?? 0;
          // Celeste para tareas no completadas al 100%
          let barColor = "hsl(197, 85%, 65%)";
          if (progress >= 100) barColor = "hsl(142, 71%, 45%)";
          else if (task.status === "delayed") barColor = "hsl(0, 84%, 60%)";

          const isChecked = !(hiddenIds?.has(task.id));

          const dim = selectionMode && !isChecked;

          return (
            <div
              key={task.id}
              className={`flex border-b border-border/40 ${
                rowIdx % 2 === 1 ? "bg-muted/30" : ""
              } ${dim ? "opacity-40" : ""}`}
              style={{ height: ROW_HEIGHT }}
            >
              {selectionMode && (
                <div
                  className="flex items-center justify-center border-r"
                  style={{ width: CHECK_COL_WIDTH, flexShrink: 0 }}
                >
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={() => onToggleHidden?.(task.id)}
                    aria-label={`Mostrar/ocultar ${task.name}`}
                  />
                </div>
              )}
              <div
                className="flex items-center px-2 text-xs border-r truncate"
                style={{
                  width: NAME_COL_WIDTH,
                  flexShrink: 0,
                  paddingLeft: 8 + level * 12,
                }}
                title={task.name}
              >
                {task.name}
              </div>
              <div
                className="flex items-center justify-center text-[10px] border-r text-muted-foreground"
                style={{ width: DATE_COL_WIDTH, flexShrink: 0 }}
              >
                {hasDates ? format(parseISO(startStr!), "dd/MM/yy") : "-"}
              </div>
              <div
                className="flex items-center justify-center text-[10px] border-r text-muted-foreground"
                style={{ width: DUR_COL_WIDTH, flexShrink: 0 }}
              >
                {hasDates ? `${durDays}d` : "-"}
              </div>
              <div
                className="flex items-center justify-center text-[10px] border-r text-muted-foreground"
                style={{ width: DATE_COL_WIDTH, flexShrink: 0 }}
              >
                {hasDates ? format(parseISO(endStr!), "dd/MM/yy") : "-"}
              </div>
              <div className="relative flex-1" style={{ height: ROW_HEIGHT }}>
                {/* Weekend shading */}
                {days.map((d, idx) =>
                  isWeekend(d) ? (
                    <div
                      key={idx}
                      className="absolute top-0 h-full bg-muted/40"
                      style={{ left: idx * DAY_WIDTH, width: DAY_WIDTH }}
                    />
                  ) : null
                )}
                {/* Today line */}
                {todayIdx >= 0 && (
                  <div
                    className="absolute top-0 h-full"
                    style={{
                      left: todayIdx * DAY_WIDTH,
                      width: 1.5,
                      background: "hsl(217, 91%, 60%)",
                    }}
                  />
                )}
                {/* Bar */}
                {hasDates && (
                  <div
                    className="absolute rounded-sm"
                    style={{
                      left: barLeft,
                      width: barWidth,
                      top: 4,
                      height: ROW_HEIGHT - 8,
                      background: barColor,
                    }}
                    title={`${task.name}: ${format(
                      parseISO(startStr!),
                      "dd/MM/yyyy"
                    )} - ${format(parseISO(endStr!), "dd/MM/yyyy")}`}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function GanttReportsSection() {
  const { ufValue } = useEconomicIndicators();
  const { navigateToContractFromReports } = useReportsNavigation();
  const [data, setData] = useState<GanttContractData[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [openCards, setOpenCards] = useState<Set<string>>(new Set());
  const [selectionModeCards, setSelectionModeCards] = useState<Set<string>>(new Set());
  const [hiddenByCard, setHiddenByCard] = useState<Record<string, Set<string>>>({});

  // Filtro, orden y selección para exportar
  const [filterGantt, setFilterGantt] = useState<FilterGantt>("all");
  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [sortBy2, setSortBy2] = useState<SortBy2>("none");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  /** Datos visibles tras aplicar filtro y orden (primario + secundario) */
  const displayData = useMemo(() => {
    let filtered = data;
    if (filterGantt === "con") filtered = data.filter((d) => d.tasks.length > 0);
    if (filterGantt === "sin") filtered = data.filter((d) => d.tasks.length === 0);

    // Clave de empresa: nombres ordenados y unidos; vacío se ordena al final.
    const companyKey = (d: GanttContractData) =>
      d.companyNames.length > 0
        ? d.companyNames.slice().sort().join(" · ").toLowerCase()
        : "￿";

    // Comparador por un criterio; 0 = empate (sin desempate por nombre).
    const compareBy = (a: GanttContractData, b: GanttContractData, crit: SortBy | SortBy2) => {
      switch (crit) {
        case "capex_desc":
          return b.capexUF - a.capexUF;
        case "gantt_first": {
          const aHas = a.tasks.length > 0, bHas = b.tasks.length > 0;
          return aHas === bHas ? 0 : aHas ? -1 : 1;
        }
        case "no_gantt_first": {
          const aNo = a.tasks.length === 0, bNo = b.tasks.length === 0;
          return aNo === bNo ? 0 : aNo ? -1 : 1;
        }
        case "empresa":
          return companyKey(a).localeCompare(companyKey(b));
        case "name":
          return a.contractName.localeCompare(b.contractName);
        default:
          return 0;
      }
    };

    return [...filtered].sort((a, b) => {
      const primary = compareBy(a, b, sortBy);
      if (primary !== 0) return primary;
      const secondary = compareBy(a, b, sortBy2);
      if (secondary !== 0) return secondary;
      return a.contractName.localeCompare(b.contractName);
    });
  }, [data, filterGantt, sortBy, sortBy2]);

  // Helpers de selección para exportar
  const toggleSelected = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectGroup = (group: FilterGantt) => {
    const pool = group === "all" ? displayData : group === "con"
      ? displayData.filter((d) => d.tasks.length > 0)
      : displayData.filter((d) => d.tasks.length === 0);
    setSelectedIds(new Set(pool.map((d) => d.contractId)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  /** Contratos que irán al PDF: los seleccionados (si hay), si no, todos los visibles */
  const exportTarget = useMemo(
    () =>
      selectedIds.size > 0
        ? displayData.filter((d) => selectedIds.has(d.contractId))
        : displayData,
    [displayData, selectedIds]
  );

  const toggleSelectionMode = (id: string) => {
    setSelectionModeCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleHidden = (cardId: string, taskId: string) => {
    setHiddenByCard((prev) => {
      const cur = new Set(prev[cardId] ?? []);
      if (cur.has(taskId)) cur.delete(taskId);
      else cur.add(taskId);
      return { ...prev, [cardId]: cur };
    });
  };

  const { isOpen: isSectionOpen, setIsOpen: setSectionOpen } = useSingleCollapsible(
    "reports-gantt-section",
    false
  );

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ufValue]);

  const loadData = async () => {
    setLoading(true);
    try {
      const currentYear = new Date().getFullYear();

      // 1) Punto de partida: TODOS los contratos con capex en el año actual,
      //    independientemente de si tienen Gantt, tareas o estado de autorización.
      const { data: budgets, error: bErr } = await supabase
        .from("contract_budgets")
        .select("id, contract_id, year, amount_uf")
        .eq("budget_type", "capex")
        .eq("year", currentYear);
      if (bErr) throw bErr;

      if (!budgets || budgets.length === 0) {
        setData([]);
        return;
      }

      // Un presupuesto por contrato (primero encontrado)
      const budgetByContract = new Map<string, { id: string; amount_uf: number | null }>();
      (budgets || []).forEach((b) => {
        if (!budgetByContract.has(b.contract_id))
          budgetByContract.set(b.contract_id, { id: b.id, amount_uf: b.amount_uf });
      });
      const contractIds = Array.from(budgetByContract.keys());

      // 2) Datos del contrato (nombre, superficie, verificar no eliminado)
      const { data: contractRows, error: cErr } = await supabase
        .from("contracts")
        .select("id, name, deleted_at, comite_gp_status, superficie_edificada_local")
        .in("id", contractIds);
      if (cErr) throw cErr;

      const contractMap = new Map<string, any>();
      (contractRows || [])
        // Excluir eliminados y contratos rechazados en Comité GP
        .filter((c: any) => !c.deleted_at && c.comite_gp_status !== "Rechazada")
        .forEach((c: any) => contractMap.set(c.id, c));

      // 2b) Empresas asociadas a cada contrato (para mostrar su logo/logos)
      const { data: companyRows } = await supabase
        .from("contract_companies")
        .select("contract_id, companies (name)")
        .in("contract_id", contractIds);
      const companiesByContract = new Map<string, string[]>();
      (companyRows || []).forEach((cc: any) => {
        const name = cc.companies?.name;
        if (!name) return;
        const list = companiesByContract.get(cc.contract_id) || [];
        list.push(name);
        companiesByContract.set(cc.contract_id, list);
      });

      // 2c) Dirección/comuna (contract_addresses) y CEBE (custom field) de cada
      //     contrato, para mostrarlos junto al nombre en la lista.
      const { data: addressRows } = await supabase
        .from("contract_addresses")
        .select("contract_id, street, number, commune")
        .in("contract_id", contractIds);
      const addressByContract = new Map<string, { address: string | null; commune: string | null }>();
      (addressRows || []).forEach((a: any) => {
        if (addressByContract.has(a.contract_id)) return; // primera dirección encontrada
        const streetPart = [a.street, a.number].filter(Boolean).join(" ");
        addressByContract.set(a.contract_id, {
          address: streetPart || null,
          commune: a.commune || null,
        });
      });

      const { data: cebeFields } = await supabase
        .from("contract_custom_fields")
        .select("id, field_name")
        .in("field_name", ["cebe", "codigo", "CEBE", "Codigo", "Código"])
        .eq("is_active", true);
      const cebeField = cebeFields?.find((f: any) => f.field_name.toLowerCase() === "cebe");
      const cebeByContract = new Map<string, string>();
      if (cebeField) {
        const { data: cebeVals } = await supabase
          .from("contract_custom_field_values")
          .select("contract_id, field_id, field_value")
          .in("contract_id", contractIds)
          .eq("field_id", cebeField.id);
        (cebeVals || []).forEach((v: any) => {
          if (v.field_value) cebeByContract.set(v.contract_id, v.field_value);
        });
      }

      // 3) Timelines de Gantt (opcionales — un contrato puede no tenerlos).
      //    Solo el cronograma PRINCIPAL (category = 'general') — el de
      //    mantenciones (category = 'maintenance', creado desde /maintenance)
      //    vive en la misma tabla pero no corresponde a esta vista.
      const { data: timelines, error: tlErr } = await supabase
        .from("gantt_timelines")
        .select("id, name, contract_id, is_priority")
        .in("contract_id", contractIds)
        .eq("category", "general")
        .order("is_priority", { ascending: false })
        .order("created_at", { ascending: false });
      if (tlErr) throw tlErr;

      // El cronograma PRINCIPAL de cada contrato (o el más reciente si no lo hay)
      const timelineByContract = new Map<string, { id: string; name: string }>();
      (timelines || []).forEach((t: any) => {
        if (!timelineByContract.has(t.contract_id))
          timelineByContract.set(t.contract_id, { id: t.id, name: t.name });
      });
      const timelineIds = Array.from(timelineByContract.values()).map((t) => t.id);

      // 4) Tareas de Gantt (paginado; puede quedar vacío si no hay timelines)
      let allTasks: any[] = [];
      if (timelineIds.length > 0) {
        const PAGE = 1000;
        let from = 0;
        let more = true;
        while (more) {
          const { data: page, error } = await supabase
            .from("gantt_tasks")
            .select("*")
            .in("timeline_id", timelineIds)
            .order("display_order")
            .range(from, from + PAGE - 1);
          if (error) throw error;
          allTasks = allTasks.concat(page || []);
          more = (page?.length || 0) === PAGE;
          from += PAGE;
        }
      }

      // 5) Totales de capex (misma lógica que Control de Presupuesto)
      const budgetIds = Array.from(budgetByContract.values()).map((b) => b.id);
      const totals = await loadBudgetTotals(budgetIds, ufValue || 0);

      const currentUF = ufValue || 0;
      const capexByContract = new Map<string, number>();
      budgetByContract.forEach((budget, contractId) => {
        const total = totals.get(budget.id);
        const fromTree = total ? total.grand : 0;
        capexByContract.set(contractId, fromTree > 0 ? fromTree : budget.amount_uf || 0);
      });

      // 6) Ensamblar resultado — incluye TODOS los contratos con capex,
      //    con o sin Gantt, con o sin tareas.
      const result: GanttContractData[] = [];
      for (const contractId of contractIds) {
        const contract = contractMap.get(contractId);
        if (!contract) continue; // contrato eliminado o no encontrado

        const capexUF = capexByContract.get(contractId) || 0;
        if (capexUF <= 0) continue; // sin monto de capex real, omitir

        const timeline = timelineByContract.get(contractId);
        const tasks = timeline
          ? (allTasks.filter((t: any) => t.timeline_id === timeline.id) as GanttTask[])
          : [];
        const taskTree = tasks.length > 0 ? buildTree(tasks) : [];

        // Fechas efectivas (madres reflejan a sus hijas) para todo el contrato.
        const effMap = computeEffectiveDatesMap(tasks);
        const effOf = (t: GanttTask) =>
          effMap.get(t.id) ?? { start: t.start_date, end: t.end_date };

        const endDates = tasks
          .map((t) => effOf(t).end)
          .filter(Boolean) as string[];
        const endDate =
          endDates.length > 0
            ? endDates.reduce((max, d) => (d > max ? d : max), endDates[0])
            : null;

        const capexCLP = capexUF * currentUF;

        // Disbursement: based on "Obras Civiles" start and "Habilitación" end
        let disbursement: Disbursement | null = null;
        const obrasCiviles = tasks.find(
          (t) => t.name.trim().toLowerCase() === "obras civiles"
        );
        const habilitacion = tasks.find(
          (t) => t.name.trim().toLowerCase() === "habilitación"
        );
        const obrasStart = obrasCiviles ? effOf(obrasCiviles).start : null;
        const habilEnd = habilitacion ? effOf(habilitacion).end : null;
        if (obrasStart && habilEnd && capexCLP > 0) {
          const start = parseISO(obrasStart);
          const end = parseISO(habilEnd);
          const midDay = addDays(start, Math.round(differenceInDays(end, start) / 2));
          disbursement = {
            startDate: obrasStart,
            midDate: format(midDay, "yyyy-MM-dd"),
            endDate: habilEnd,
            anticipo: Math.round(capexCLP * 0.30),
            pago1: Math.round(capexCLP * 0.50),
            pago2: Math.round(capexCLP * 0.20),
          };
        }

        result.push({
          contractId,
          contractName: contract.name,
          companyNames: companiesByContract.get(contractId) || [],
          timelineName: timeline?.name ?? "",
          tasks,
          taskTree,
          endDate,
          capexUF,
          capexCLP,
          surfaceM2: Number(contract.superficie_edificada_local) || 0,
          disbursement,
          address: addressByContract.get(contractId)?.address ?? null,
          commune: addressByContract.get(contractId)?.commune ?? null,
          cebe: cebeByContract.get(contractId) ?? null,
        });
      }

      result.sort((a, b) => a.contractName.localeCompare(b.contractName));
      setData(result);
    } catch (e: any) {
      console.error("Error loading Gantt reports:", e);
      toast.error("No se pudieron cargar las cartas Gantt");
    } finally {
      setLoading(false);
    }
  };

  const toggleCard = (id: string) => {
    setOpenCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setOpenCards(new Set(displayData.map((d) => d.contractId)));
  const collapseAll = () => setOpenCards(new Set());

  const formatUF = (n: number) =>
    new Intl.NumberFormat("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(
      Math.round(n)
    );
  const formatCLP = (n: number) =>
    new Intl.NumberFormat("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(
      Math.round(n)
    );
  const formatUFm2 = (n: number) =>
    new Intl.NumberFormat("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const exportPDF = async () => {
    if (exportTarget.length === 0) {
      toast.info("No hay contratos para exportar");
      return;
    }
    setExporting(true);
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Header logo
      const logos = await getLogoUrls();
      const logoData = await fetchImageAsDataURL(logos.dashboard_header);

      const drawHeader = (subtitle?: string) => {
        if (logoData) {
          try {
            doc.addImage(logoData, "PNG", 10, 8, 40, 12);
          } catch {
            // ignore
          }
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.text("Informe General de Cartas Gantt", pageWidth / 2, 14, { align: "center" });
        if (subtitle) {
          doc.setFontSize(9);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(80);
          doc.text(subtitle, pageWidth / 2, 20, { align: "center" });
        }
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text(
          `Generado: ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: es })}`,
          pageWidth - 10,
          14,
          { align: "right" }
        );
        doc.setTextColor(0);
      };

      // ==== Page 1: Summary table ====
      drawHeader(`${exportTarget.length} contrato(s)`);
      autoTable(doc, {
        startY: 28,
        head: [["Contrato", "Línea de Tiempo", "Fecha Término", "Tareas", "CAPEX (UF)", "CAPEX (CLP)", "UF/m²"]],
        body: exportTarget.map((d) => [
          d.contractName,
          d.timelineName || "Sin carta Gantt",
          d.endDate ? format(parseISO(d.endDate), "dd/MM/yyyy") : "—",
          d.tasks.length > 0 ? String(d.tasks.length) : "—",
          d.capexUF > 0 ? formatUF(d.capexUF) : "—",
          d.capexCLP > 0 ? `$${formatCLP(d.capexCLP)}` : "—",
          d.capexUF > 0 && d.surfaceM2 > 0 ? formatUFm2(d.capexUF / d.surfaceM2) : "—",
        ]),
        styles: { fontSize: 8, cellPadding: 1.5 },
        headStyles: { fillColor: [59, 130, 246], textColor: 255 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 65 },
          1: { cellWidth: 55 },
          2: { cellWidth: 28, halign: "center" },
          3: { cellWidth: 18, halign: "center" },
          4: { cellWidth: 30, halign: "right" },
          5: { cellWidth: 40, halign: "right" },
          6: { cellWidth: 22, halign: "right" },
        },
      });

      // ==== One page per contract with mini Gantt drawn natively in PDF ====
      for (const item of exportTarget) {
        doc.addPage();
        drawHeader(item.contractName);

        // CAPEX + end date info
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(60);
        const infoY = 26;
        doc.text(`Línea de Tiempo: ${item.timelineName || "Sin carta Gantt"}`, 10, infoY);
        doc.text(
          `Fecha Término: ${item.endDate ? format(parseISO(item.endDate), "dd/MM/yyyy") : "—"}`,
          pageWidth / 2,
          infoY,
          { align: "center" }
        );
        const capexLabel = item.capexUF > 0
          ? `UF ${formatUF(item.capexUF)} / $${formatCLP(item.capexCLP)}${item.surfaceM2 > 0 ? ` · ${formatUFm2(item.capexUF / item.surfaceM2)} UF/m²` : ""}`
          : "—";
        doc.text(
          `CAPEX Total: ${capexLabel}`,
          pageWidth - 10,
          infoY,
          { align: "right" }
        );
        doc.setTextColor(0);

        const hiddenIds = hiddenByCard[item.contractId];
        const flat: Array<{ task: GanttTask; level: number }> = [];
        const walkPrune = (nodes: GanttTask[], level: number) => {
          nodes.forEach((t) => {
            if (hiddenIds && hiddenIds.has(t.id)) return;
            flat.push({ task: t, level });
            if (t.children && t.children.length > 0) walkPrune(t.children, level + 1);
          });
        };
        walkPrune(item.taskTree, 0);
        // Fechas efectivas (madres reflejan a sus hijas) para el PDF.
        const pdfEff = computeEffectiveDatesMap(flat.map((f) => f.task));
        const pdfDatesOf = (t: GanttTask) =>
          pdfEff.get(t.id) ?? { start: t.start_date, end: t.end_date };
        if (
          flat.length === 0 ||
          !flat.some((f) => {
            const d = pdfDatesOf(f.task);
            return d.start && d.end;
          })
        ) {
          doc.setFontSize(10);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(120);
          doc.text("Sin tareas con fechas definidas", pageWidth / 2, 50, { align: "center" });
          continue;
        }

        const { minDate, maxDate } = getGanttDateRange(
          flat.map((f) => {
            const d = pdfDatesOf(f.task);
            return { start_date: d.start, end_date: d.end };
          })
        );
        const days = eachDayOfInterval({ start: minDate, end: maxDate });
        const totalDays = days.length;

        const chartTop = 32;
        const chartLeft = 10;
        const nameColWidth = 70;
        const dateColWidth = 18;
        const durColWidth = 14;
        const metaWidth = nameColWidth + dateColWidth * 2 + durColWidth;
        const availableWidth = pageWidth - chartLeft * 2 - metaWidth;
        const dayWidth = Math.max(0.5, availableWidth / totalDays);
        const rowHeight = 4.8;
        const headerHeight = 6;
        const totalRowWidth = metaWidth + totalDays * dayWidth;

        // Header bar
        doc.setFillColor(240, 240, 245);
        doc.rect(chartLeft, chartTop, totalRowWidth, headerHeight, "F");
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(20);
        doc.text("Tarea", chartLeft + 2, chartTop + 4);
        doc.text("Inicio", chartLeft + nameColWidth + dateColWidth / 2, chartTop + 4, {
          align: "center",
        });
        doc.text(
          "Plazo",
          chartLeft + nameColWidth + dateColWidth + durColWidth / 2,
          chartTop + 4,
          { align: "center" }
        );
        doc.text(
          "Término",
          chartLeft + nameColWidth + dateColWidth + durColWidth + dateColWidth / 2,
          chartTop + 4,
          { align: "center" }
        );

        // Month markers (above the bar area)
        doc.setFontSize(6);
        doc.setFont("helvetica", "normal");
        let lastMonth = "";
        days.forEach((d, idx) => {
          const m = format(d, "MMM yy", { locale: es });
          if (m !== lastMonth) {
            const x = chartLeft + metaWidth + idx * dayWidth;
            doc.setDrawColor(180);
            doc.line(x, chartTop, x, chartTop + headerHeight);
            doc.text(m, x + 1, chartTop + 4);
            lastMonth = m;
          }
        });

        const todayStr = format(new Date(), "yyyy-MM-dd");
        const todayIdx = days.findIndex((d) => format(d, "yyyy-MM-dd") === todayStr);

        let y = chartTop + headerHeight;
        const maxRows = Math.floor((pageHeight - y - 12) / rowHeight);
        const rowsToDraw = flat.slice(0, maxRows);

        rowsToDraw.forEach(({ task, level }, rowIdx) => {
          if (rowIdx % 2 === 1) {
            doc.setFillColor(250, 250, 252);
            doc.rect(chartLeft, y, totalRowWidth, rowHeight, "F");
          }
          // weekend shading (only over the bar area)
          days.forEach((d, idx) => {
            if (isWeekend(d)) {
              doc.setFillColor(235, 235, 238);
              doc.rect(chartLeft + metaWidth + idx * dayWidth, y, dayWidth, rowHeight, "F");
            }
          });

          // Task name
          doc.setFontSize(6);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(20);
          const indent = level * 2.5;
          const nameMaxChars = Math.floor((nameColWidth - 4 - indent) / 1.2);
          const displayName =
            task.name.length > nameMaxChars
              ? task.name.slice(0, nameMaxChars - 1) + "…"
              : task.name;
          doc.text(displayName, chartLeft + 2 + indent, y + rowHeight - 1.5);

          // Date / duration columns (fechas efectivas)
          const eff = pdfDatesOf(task);
          const startStr = eff.start;
          const endStr = eff.end;
          const hasDates = !!(startStr && endStr);
          const dur = hasDates
            ? differenceInDays(parseISO(endStr!), parseISO(startStr!)) + 1
            : 0;
          doc.setTextColor(90);
          doc.text(
            hasDates ? format(parseISO(startStr!), "dd/MM/yy") : "-",
            chartLeft + nameColWidth + dateColWidth / 2,
            y + rowHeight - 1.5,
            { align: "center" }
          );
          doc.text(
            hasDates ? `${dur}d` : "-",
            chartLeft + nameColWidth + dateColWidth + durColWidth / 2,
            y + rowHeight - 1.5,
            { align: "center" }
          );
          doc.text(
            hasDates ? format(parseISO(endStr!), "dd/MM/yy") : "-",
            chartLeft + nameColWidth + dateColWidth + durColWidth + dateColWidth / 2,
            y + rowHeight - 1.5,
            { align: "center" }
          );
          doc.setTextColor(20);

          // Bar — colors aligned with on-screen MiniGantt
          if (hasDates) {
            const startOffset = differenceInDays(parseISO(startStr!), minDate);
            const x = chartLeft + metaWidth + startOffset * dayWidth;
            const w = Math.max(0.4, dur * dayWidth);
            const progress = task.progress ?? 0;
            if (progress >= 100)
              doc.setFillColor(34, 197, 94); // verde - completada
            else if (task.status === "delayed")
              doc.setFillColor(239, 68, 68); // rojo - atrasada
            else doc.setFillColor(125, 211, 252); // celeste - no completada al 100%
            doc.rect(x, y + 0.8, w, rowHeight - 1.6, "F");
          }

          y += rowHeight;
        });

        // Today vertical line
        if (todayIdx >= 0) {
          const todayX = chartLeft + (nameColWidth + 18 * 2 + 14) + todayIdx * dayWidth + dayWidth / 2;
          doc.setDrawColor(59, 130, 246);
          doc.setLineWidth(0.4);
          doc.line(todayX, chartTop, todayX, y);
        }

        if (flat.length > maxRows) {
          doc.setFontSize(7);
          doc.setTextColor(120);
          doc.text(
            `(${flat.length - maxRows} tarea(s) adicional(es) no mostradas por espacio)`,
            chartLeft,
            y + 4
          );
          doc.setTextColor(0);
        }
      }

      // Footer page numbers
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(120);
        doc.text(`Página ${i} de ${pageCount}`, pageWidth - 10, pageHeight - 5, { align: "right" });
      }

      doc.save(`Cartas_Gantt_General_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`);
      toast.success("PDF generado");
    } catch (e: any) {
      console.error(e);
      toast.error("Error al generar el PDF");
    } finally {
      setExporting(false);
    }
  };

  // ── Derived counts para badges ─────────────────────────────────────────────
  const countCon = data.filter((d) => d.tasks.length > 0).length;
  const countSin = data.filter((d) => d.tasks.length === 0).length;

  /** Proyectos con Gantt y fecha de término, para la línea de tiempo general. */
  const timelineProjects = useMemo(
    () =>
      data
        .filter((d) => d.tasks.length > 0 && d.endDate)
        .map((d) => ({
          contractId: d.contractId,
          contractName: d.contractName,
          companyNames: d.companyNames,
          endDate: d.endDate as string,
          capexUF: d.capexUF,
        })),
    [data]
  );
  const allVisibleOpen =
    displayData.length > 0 && displayData.every((d) => openCards.has(d.contractId));

  return (
    <Collapsible open={isSectionOpen} onOpenChange={setSectionOpen}>
      <Card className="mt-6">
        <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
          <div className="flex items-center justify-between gap-2">
            <CollapsibleTrigger asChild>
              <div className="flex items-center gap-2 flex-1">
                {isSectionOpen ? (
                  <ChevronDown className="h-5 w-5" />
                ) : (
                  <ChevronRight className="h-5 w-5" />
                )}
                <CalendarDays className="h-5 w-5" />
                <CardTitle>Cartas Gantt - Vista General</CardTitle>
                {!loading && (
                  <span className="text-sm text-muted-foreground ml-2">
                    ({data.length} contrato{data.length !== 1 ? "s" : ""})
                  </span>
                )}
              </div>
            </CollapsibleTrigger>
            {isSectionOpen && !loading && data.length > 0 && (
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={allVisibleOpen ? collapseAll : expandAll}
                >
                  {allVisibleOpen ? (
                    <><Minimize2 className="h-3 w-3 mr-1" />Colapsar</>
                  ) : (
                    <><Maximize2 className="h-3 w-3 mr-1" />Expandir</>
                  )}
                </Button>
                <Button variant="default" size="sm" onClick={exportPDF} disabled={exporting}>
                  {exporting ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Download className="h-3 w-3 mr-1" />
                  )}
                  PDF
                  {selectedIds.size > 0 ? (
                    <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">
                      {selectedIds.size}
                    </Badge>
                  ) : (
                    <span className="ml-1 text-xs opacity-70">({exportTarget.length})</span>
                  )}
                </Button>
              </div>
            )}
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : data.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No hay contratos con CAPEX registrado para el año en curso.
              </div>
            ) : (
              <div className="space-y-3">

                <GanttOverviewTimeline
                  projects={timelineProjects}
                  onSelect={(contractId) => navigateToContractFromReports(contractId, "gantt")}
                />

                {/* ── Barra de filtro / orden / selección ──────────────────── */}
                <div className="flex flex-wrap items-center gap-2 pb-2 border-b">

                  {/* Filtro */}
                  <div className="flex items-center gap-1.5">
                    <ListFilter className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground font-medium">Filtrar:</span>
                    {(
                      [
                        { key: "all", label: `Todos (${data.length})` },
                        { key: "con", label: `Con Gantt (${countCon})` },
                        { key: "sin", label: `Sin Gantt (${countSin})` },
                      ] as { key: FilterGantt; label: string }[]
                    ).map(({ key, label }) => (
                      <Button
                        key={key}
                        variant={filterGantt === key ? "default" : "outline"}
                        size="sm"
                        className="h-7 px-2.5 text-xs"
                        onClick={() => setFilterGantt(key)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>

                  <div className="w-px h-5 bg-border mx-1" />

                  {/* Orden */}
                  <div className="flex items-center gap-1.5">
                    <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground font-medium">Ordenar:</span>
                    <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
                      <SelectTrigger className="h-7 w-44 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="name">Nombre (A→Z)</SelectItem>
                        <SelectItem value="capex_desc">CAPEX (mayor a menor)</SelectItem>
                        <SelectItem value="gantt_first">Con Gantt primero</SelectItem>
                        <SelectItem value="no_gantt_first">Sin Gantt primero</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Orden secundario (acumulativo) */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground font-medium">luego:</span>
                    <Select value={sortBy2} onValueChange={(v) => setSortBy2(v as SortBy2)}>
                      <SelectTrigger className="h-7 w-40 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin orden secundario</SelectItem>
                        <SelectItem value="empresa">Empresa (A→Z)</SelectItem>
                        <SelectItem value="name">Nombre (A→Z)</SelectItem>
                        <SelectItem value="capex_desc">CAPEX (mayor a menor)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="w-px h-5 bg-border mx-1" />

                  {/* Selección para exportar */}
                  <div className="flex items-center gap-1.5 ml-auto flex-wrap">
                    <span className="text-xs text-muted-foreground font-medium">Seleccionar para PDF:</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() => selectGroup("all")}
                    >
                      <CheckSquare className="h-3 w-3" />
                      Todos
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() => selectGroup("con")}
                    >
                      Con Gantt
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() => selectGroup("sin")}
                    >
                      Sin Gantt
                    </Button>
                    {selectedIds.size > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1 text-muted-foreground"
                        onClick={clearSelection}
                      >
                        <Square className="h-3 w-3" />
                        Ninguno
                      </Button>
                    )}
                    {selectedIds.size > 0 && (
                      <span className="text-xs font-medium text-primary">
                        {selectedIds.size} seleccionado{selectedIds.size !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>

                {/* ── Lista de contratos ────────────────────────────────────── */}
                {displayData.length === 0 ? (
                  <div className="text-center py-6 text-sm text-muted-foreground">
                    Sin resultados para el filtro aplicado.
                  </div>
                ) : (
                  displayData.map((item) => {
                    const isOpen = openCards.has(item.contractId);
                    const isSelected = selectedIds.has(item.contractId);
                    return (
                      <Card
                        key={item.contractId}
                        className={`overflow-hidden transition-colors ${isSelected ? "ring-1 ring-primary/40 bg-primary/[0.02]" : ""}`}
                      >
                        <CardHeader
                          className="py-3 px-4 cursor-pointer hover:bg-muted/40 transition-colors"
                          onClick={() => toggleCard(item.contractId)}
                        >
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              {/* Checkbox de selección para PDF */}
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSelected(item.contractId);
                                }}
                                className="flex-shrink-0"
                              >
                                <Checkbox
                                  checked={isSelected}
                                  aria-label={`Seleccionar ${item.contractName}`}
                                  className="pointer-events-none"
                                />
                              </div>
                              {isOpen ? (
                                <ChevronUp className="h-4 w-4 flex-shrink-0" />
                              ) : (
                                <ChevronDown className="h-4 w-4 flex-shrink-0 rotate-[-90deg]" />
                              )}
                              {item.companyNames.length > 0 && (
                                <CompanyLogo
                                  companyNames={item.companyNames}
                                  size="sm"
                                  className="flex-shrink-0"
                                />
                              )}
                              <div className="min-w-0">
                                <div className="font-semibold text-sm truncate">
                                  {item.contractName}
                                </div>
                                {(item.address || item.commune || item.cebe) && (
                                  <div className="text-[11px] text-muted-foreground truncate">
                                    {[item.address, item.commune].filter(Boolean).join(", ")}
                                    {item.cebe && <> {item.address || item.commune ? "· " : ""}CEBE: {item.cebe}</>}
                                  </div>
                                )}
                                <div className="text-xs text-muted-foreground">
                                  {item.tasks.length === 0 ? (
                                    <span className="italic text-amber-600">Sin carta Gantt cargada</span>
                                  ) : (
                                    <>
                                      {item.timelineName && <>{item.timelineName} · </>}
                                      {item.tasks.length} tarea{item.tasks.length !== 1 ? "s" : ""} · Fecha
                                      término:{" "}
                                      <span className="font-medium text-foreground">
                                        {item.endDate
                                          ? format(parseISO(item.endDate), "dd/MM/yyyy")
                                          : "—"}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            {item.disbursement && (
                              <div className="hidden lg:flex items-center gap-4 text-xs border-l pl-4 mr-2">
                                <div className="text-center">
                                  <div className="text-muted-foreground mb-0.5">Anticipo (30%)</div>
                                  <div className="font-medium">${formatCLP(item.disbursement.anticipo)} + IVA</div>
                                  <div className="text-[10px] text-muted-foreground">{format(parseISO(item.disbursement.startDate), "dd/MM/yyyy")}</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-muted-foreground mb-0.5">Estado Pago 1 (50%)</div>
                                  <div className="font-medium">${formatCLP(item.disbursement.pago1)}</div>
                                  <div className="text-[10px] text-muted-foreground">{format(parseISO(item.disbursement.midDate), "dd/MM/yyyy")}</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-muted-foreground mb-0.5">Estado Pago 2 (20%)</div>
                                  <div className="font-medium">${formatCLP(item.disbursement.pago2)} + IVA</div>
                                  <div className="text-[10px] text-muted-foreground">{format(parseISO(item.disbursement.endDate), "dd/MM/yyyy")}</div>
                                </div>
                              </div>
                            )}
                            <div className="flex items-center gap-3">
                              <div className="text-right text-xs">
                                <div className="text-muted-foreground">CAPEX Total</div>
                                <div className="font-semibold text-sm">
                                  {item.capexUF > 0 ? (
                                    <>
                                      UF {formatUF(item.capexUF)}
                                      <span className="text-muted-foreground font-normal ml-1">
                                        / ${formatCLP(item.capexCLP)}
                                      </span>
                                    </>
                                  ) : (
                                    <span className="text-muted-foreground">Sin CAPEX</span>
                                  )}
                                </div>
                                {item.capexUF > 0 && item.surfaceM2 > 0 && (
                                  <div className="text-[11px] text-muted-foreground font-normal">
                                    {formatUFm2(item.capexUF / item.surfaceM2)} UF/m²
                                  </div>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSelectionMode(item.contractId);
                                }}
                                title="Seleccionar líneas a ocultar en la vista"
                              >
                                {selectionModeCards.has(item.contractId) ? (
                                  <EyeOff className="h-3.5 w-3.5" />
                                ) : (
                                  <Eye className="h-3.5 w-3.5" />
                                )}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1"
                                {...prefetchOn("ContractDetail")}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigateToContractFromReports(item.contractId, "gantt");
                                }}
                                title="Ir al proyecto"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                Ir al proyecto
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        {isOpen && (
                          <CardContent className="pt-0 pb-3 px-3">
                            {item.tasks.length === 0 ? (
                              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground italic">
                                Este contrato no tiene carta Gantt registrada. El CAPEX está
                                asignado pero aún no se ha cargado la planificación de obras.
                              </div>
                            ) : (
                              <MiniGantt
                                taskTree={item.taskTree}
                                holidays={[]}
                                selectionMode={selectionModeCards.has(item.contractId)}
                                hiddenIds={hiddenByCard[item.contractId]}
                                onToggleHidden={(taskId) => toggleHidden(item.contractId, taskId)}
                              />
                            )}
                          </CardContent>
                        )}
                      </Card>
                    );
                  })
                )}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
