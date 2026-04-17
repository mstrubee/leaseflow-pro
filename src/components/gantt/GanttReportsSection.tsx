import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CalendarDays,
  Download,
  Loader2,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { format, parseISO, eachDayOfInterval, differenceInDays, isWeekend } from "date-fns";
import { es } from "date-fns/locale";
import { GanttTask, Holiday } from "@/hooks/useGantt";
import { getGanttDateRange } from "@/lib/ganttDateUtils";
import { useEconomicIndicators } from "@/hooks/useEconomicIndicators";
import { useSingleCollapsible } from "@/hooks/useCollapsibleState";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getLogoUrls } from "@/hooks/useAppLogos";
import { toast } from "sonner";

interface GanttContractData {
  contractId: string;
  contractName: string;
  timelineName: string;
  tasks: GanttTask[];
  taskTree: GanttTask[];
  endDate: string | null;
  capexUF: number;
  capexCLP: number;
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
function MiniGantt({ taskTree, holidays }: { taskTree: GanttTask[]; holidays: Holiday[] }) {
  const flat = useMemo(() => flattenTree(taskTree), [taskTree]);
  const tasksWithDates = flat.filter((f) => f.task.start_date && f.task.end_date);

  if (tasksWithDates.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        Sin fechas definidas para visualizar
      </div>
    );
  }

  const { minDate, maxDate } = getGanttDateRange(flat.map((f) => f.task));
  const days = eachDayOfInterval({ start: minDate, end: maxDate });
  const totalDays = days.length;

  const NAME_COL_WIDTH = 220;
  const DATE_COL_WIDTH = 70;
  const DUR_COL_WIDTH = 55;
  const META_WIDTH = NAME_COL_WIDTH + DATE_COL_WIDTH * 2 + DUR_COL_WIDTH;
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
        {flat.map(({ task, level }, rowIdx) => {
          const hasDates = task.start_date && task.end_date;
          let barLeft = 0;
          let barWidth = 0;
          let durDays = 0;
          if (hasDates) {
            const startOffset = differenceInDays(parseISO(task.start_date!), minDate);
            durDays =
              differenceInDays(parseISO(task.end_date!), parseISO(task.start_date!)) + 1;
            barLeft = startOffset * DAY_WIDTH;
            barWidth = Math.max(1, durDays * DAY_WIDTH);
          }

          const progress = task.progress ?? 0;
          // Celeste para tareas no completadas al 100%
          let barColor = "hsl(197, 85%, 65%)";
          if (progress >= 100) barColor = "hsl(142, 71%, 45%)";
          else if (task.status === "delayed") barColor = "hsl(0, 84%, 60%)";

          return (
            <div
              key={task.id}
              className={`flex border-b border-border/40 ${
                rowIdx % 2 === 1 ? "bg-muted/30" : ""
              }`}
              style={{ height: ROW_HEIGHT }}
            >
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
                {hasDates ? format(parseISO(task.start_date!), "dd/MM/yy") : "-"}
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
                {hasDates ? format(parseISO(task.end_date!), "dd/MM/yy") : "-"}
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
                      parseISO(task.start_date!),
                      "dd/MM/yyyy"
                    )} - ${format(parseISO(task.end_date!), "dd/MM/yyyy")}`}
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
  const [data, setData] = useState<GanttContractData[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [openCards, setOpenCards] = useState<Set<string>>(new Set());

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
      // 1) Load all timelines with contract names
      const { data: timelines, error: tlErr } = await supabase
        .from("gantt_timelines")
        .select("id, name, contract_id, contracts(name, deleted_at)")
        .order("created_at", { ascending: false });

      if (tlErr) throw tlErr;

      const validTimelines = (timelines || []).filter(
        (t: any) => t.contracts && !t.contracts.deleted_at
      );

      if (validTimelines.length === 0) {
        setData([]);
        return;
      }

      const timelineIds = validTimelines.map((t: any) => t.id);
      const contractIds = validTimelines.map((t: any) => t.contract_id);

      // 2) Load all tasks for these timelines (paginated to avoid 1000-row limit)
      let allTasks: any[] = [];
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

      // 3) Load CAPEX budgets for those contracts - usar el presupuesto más reciente del contrato
      const { data: budgets, error: bErr } = await supabase
        .from("contract_budgets")
        .select("contract_id, year, amount_uf, updated_at")
        .eq("budget_type", "capex")
        .order("year", { ascending: false })
        .order("updated_at", { ascending: false })
        .in("contract_id", contractIds);
      if (bErr) throw bErr;

      // Espejar solo el presupuesto CAPEX vigente/más reciente, sin sumar años
      const capexByContract = new Map<string, number>();
      (budgets || []).forEach((b) => {
        if (!capexByContract.has(b.contract_id)) {
          capexByContract.set(b.contract_id, b.amount_uf || 0);
        }
      });

      const currentUF = ufValue || 0;

      // 4) Assemble per-timeline data
      const result: GanttContractData[] = validTimelines.flatMap((tl: any) => {
        const tasks = allTasks.filter((t) => t.timeline_id === tl.id) as GanttTask[];
        // Excluir líneas de tiempo sin tareas (no tienen Gantt cargada)
        if (tasks.length === 0) return [];
        const taskTree = buildTree(tasks);
        // End date = max end_date of all tasks
        const endDates = tasks.map((t) => t.end_date).filter(Boolean) as string[];
        const endDate =
          endDates.length > 0
            ? endDates.reduce((max, d) => (d > max ? d : max), endDates[0])
            : null;
        const capexUF = capexByContract.get(tl.contract_id) || 0;
        return [{
          contractId: tl.contract_id,
          contractName: tl.contracts.name,
          timelineName: tl.name,
          tasks,
          taskTree,
          endDate,
          capexUF,
          capexCLP: capexUF * currentUF,
        }];
      });

      // Sort by contract name
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

  const expandAll = () => setOpenCards(new Set(data.map((d) => d.contractId)));
  const collapseAll = () => setOpenCards(new Set());

  const formatUF = (n: number) =>
    new Intl.NumberFormat("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(
      Math.round(n)
    );
  const formatCLP = (n: number) =>
    new Intl.NumberFormat("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(
      Math.round(n)
    );

  const exportPDF = async () => {
    if (data.length === 0) {
      toast.info("No hay cartas Gantt para exportar");
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
      drawHeader(`${data.length} contrato(s)`);
      autoTable(doc, {
        startY: 28,
        head: [["Contrato", "Línea de Tiempo", "Fecha Término", "Tareas", "CAPEX (UF)", "CAPEX (CLP)"]],
        body: data.map((d) => [
          d.contractName,
          d.timelineName,
          d.endDate ? format(parseISO(d.endDate), "dd/MM/yyyy") : "—",
          String(d.tasks.length),
          d.capexUF > 0 ? formatUF(d.capexUF) : "—",
          d.capexCLP > 0 ? `$${formatCLP(d.capexCLP)}` : "—",
        ]),
        styles: { fontSize: 8, cellPadding: 1.5 },
        headStyles: { fillColor: [59, 130, 246], textColor: 255 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 70 },
          1: { cellWidth: 60 },
          2: { cellWidth: 30, halign: "center" },
          3: { cellWidth: 20, halign: "center" },
          4: { cellWidth: 35, halign: "right" },
          5: { cellWidth: 45, halign: "right" },
        },
      });

      // ==== One page per contract with mini Gantt drawn natively in PDF ====
      for (const item of data) {
        doc.addPage();
        drawHeader(item.contractName);

        // CAPEX + end date info
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(60);
        const infoY = 26;
        doc.text(`Línea de Tiempo: ${item.timelineName}`, 10, infoY);
        doc.text(
          `Fecha Término: ${item.endDate ? format(parseISO(item.endDate), "dd/MM/yyyy") : "—"}`,
          pageWidth / 2,
          infoY,
          { align: "center" }
        );
        doc.text(
          `CAPEX Total: ${item.capexUF > 0 ? `UF ${formatUF(item.capexUF)} / $${formatCLP(item.capexCLP)}` : "—"}`,
          pageWidth - 10,
          infoY,
          { align: "right" }
        );
        doc.setTextColor(0);

        const flat = flattenTree(item.taskTree);
        if (flat.length === 0 || !flat.some((f) => f.task.start_date && f.task.end_date)) {
          doc.setFontSize(10);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(120);
          doc.text("Sin tareas con fechas definidas", pageWidth / 2, 50, { align: "center" });
          continue;
        }

        const { minDate, maxDate } = getGanttDateRange(flat.map((f) => f.task));
        const days = eachDayOfInterval({ start: minDate, end: maxDate });
        const totalDays = days.length;

        const chartTop = 32;
        const chartLeft = 10;
        const nameColWidth = 60;
        const availableWidth = pageWidth - chartLeft * 2 - nameColWidth;
        const dayWidth = Math.max(0.6, availableWidth / totalDays);
        const rowHeight = 4.5;
        const headerHeight = 6;

        // Header bar
        doc.setFillColor(240, 240, 245);
        doc.rect(chartLeft, chartTop, nameColWidth + totalDays * dayWidth, headerHeight, "F");
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.text("Tarea", chartLeft + 2, chartTop + 4);

        // Month markers
        doc.setFontSize(6);
        doc.setFont("helvetica", "normal");
        let lastMonth = "";
        days.forEach((d, idx) => {
          const m = format(d, "MMM yy", { locale: es });
          if (m !== lastMonth) {
            const x = chartLeft + nameColWidth + idx * dayWidth;
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
            doc.rect(chartLeft, y, nameColWidth + totalDays * dayWidth, rowHeight, "F");
          }
          // weekend shading
          days.forEach((d, idx) => {
            if (isWeekend(d)) {
              doc.setFillColor(235, 235, 238);
              doc.rect(chartLeft + nameColWidth + idx * dayWidth, y, dayWidth, rowHeight, "F");
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
          doc.text(displayName, chartLeft + 2 + indent, y + rowHeight - 1.3);

          // Bar
          if (task.start_date && task.end_date) {
            const startOffset = differenceInDays(parseISO(task.start_date), minDate);
            const dur = differenceInDays(parseISO(task.end_date), parseISO(task.start_date)) + 1;
            const x = chartLeft + nameColWidth + startOffset * dayWidth;
            const w = Math.max(0.4, dur * dayWidth);
            if (task.status === "completed") doc.setFillColor(34, 197, 94);
            else if (task.status === "in_progress") doc.setFillColor(59, 130, 246);
            else if (task.status === "delayed") doc.setFillColor(239, 68, 68);
            else doc.setFillColor(148, 163, 184);
            doc.rect(x, y + 0.8, w, rowHeight - 1.6, "F");
          }

          y += rowHeight;
        });

        // Today vertical line
        if (todayIdx >= 0) {
          const todayX = chartLeft + nameColWidth + todayIdx * dayWidth + dayWidth / 2;
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
                <Button variant="outline" size="sm" onClick={expandAll}>
                  <Maximize2 className="h-3 w-3 mr-1" />
                  Expandir todos
                </Button>
                <Button variant="outline" size="sm" onClick={collapseAll}>
                  <Minimize2 className="h-3 w-3 mr-1" />
                  Colapsar todos
                </Button>
                <Button variant="default" size="sm" onClick={exportPDF} disabled={exporting}>
                  {exporting ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Download className="h-3 w-3 mr-1" />
                  )}
                  PDF General
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
                No hay cartas Gantt registradas en ningún contrato.
              </div>
            ) : (
              <div className="space-y-3">
                {data.map((item) => {
                  const isOpen = openCards.has(item.contractId);
                  return (
                    <Card key={item.contractId} className="overflow-hidden">
                      <CardHeader
                        className="py-3 px-4 cursor-pointer hover:bg-muted/40 transition-colors"
                        onClick={() => toggleCard(item.contractId)}
                      >
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {isOpen ? (
                              <ChevronUp className="h-4 w-4 flex-shrink-0" />
                            ) : (
                              <ChevronDown className="h-4 w-4 flex-shrink-0 rotate-[-90deg]" />
                            )}
                            <div className="min-w-0">
                              <div className="font-semibold text-sm truncate">
                                {item.contractName}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {item.timelineName} · {item.tasks.length} tareas · Fecha término:{" "}
                                <span className="font-medium text-foreground">
                                  {item.endDate
                                    ? format(parseISO(item.endDate), "dd/MM/yyyy")
                                    : "—"}
                                </span>
                              </div>
                            </div>
                          </div>
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
                          </div>
                        </div>
                      </CardHeader>
                      {isOpen && (
                        <CardContent className="pt-0 pb-3 px-3">
                          <MiniGantt taskTree={item.taskTree} holidays={[]} />
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
