import jsPDF from "jspdf";
import { format, parseISO, eachDayOfInterval, differenceInDays, isWeekend, addDays } from "date-fns";
import { es } from "date-fns/locale";
import { GanttTask, Holiday, OrgMember } from "@/hooks/useGantt";
import { getGanttDateRange } from "@/lib/ganttDateUtils";
import { getLogoUrls } from "@/hooks/useAppLogos";
import { GanttExportColumnKey } from "./ganttExportColumns";

interface ExportOptions {
  contractName: string;
  timelineName: string;
  hideCompleted?: boolean;
  orgMembers?: OrgMember[];
  excludedColumns?: GanttExportColumnKey[];
}

// Completed tasks are highlighted with a green tint, a check icon and a green bar.
const COMPLETED_GREEN: [number, number, number] = [34, 197, 94];
const COMPLETED_GREEN_DARK: [number, number, number] = [21, 128, 61];
const COMPLETED_ROW_TINT: [number, number, number] = [236, 253, 245];
// Start dates moved to the next working day are shown in orange.
const ADJUSTED_ORANGE: [number, number, number] = [180, 90, 0];

const drawCheckMark = (doc: jsPDF, x: number, y: number, size: number) => {
  doc.setDrawColor(255);
  doc.setLineWidth(0.35);
  doc.line(x + size * 0.25, y + size * 0.52, x + size * 0.43, y + size * 0.7);
  doc.line(x + size * 0.43, y + size * 0.7, x + size * 0.76, y + size * 0.32);
};

// Green circle with a white check. (x, y) is the top-left corner of the icon.
const drawCheckIcon = (doc: jsPDF, x: number, y: number, size: number) => {
  doc.setFillColor(...COMPLETED_GREEN);
  doc.circle(x + size / 2, y + size / 2, size / 2, "F");
  drawCheckMark(doc, x, y, size);
};

const drawCompletedLegend = (doc: jsPDF, rightX: number, baselineY: number) => {
  const label = "Tarea completada";
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...COMPLETED_GREEN_DARK);
  doc.text(label, rightX, baselineY, { align: "right" });
  drawCheckIcon(doc, rightX - doc.getTextWidth(label) - 4.5, baselineY - 3, 3.2);
  doc.setTextColor(0);
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

const flattenTree = (
  tree: GanttTask[],
  level = 0,
  acc: Array<{ task: GanttTask; level: number }> = []
): Array<{ task: GanttTask; level: number }> => {
  tree.forEach((t) => {
    acc.push({ task: t, level });
    if (t.children && t.children.length > 0) {
      flattenTree(t.children, level + 1, acc);
    }
  });
  return acc;
};

// Draw the project logo respecting its natural aspect ratio so it never appears stretched.
const drawLogo = (
  doc: jsPDF,
  dataUrl: string,
  x: number,
  y: number,
  maxW: number,
  maxH: number
) => {
  try {
    const props = doc.getImageProperties(dataUrl);
    const ratio = props.width / props.height;
    let w = maxW;
    let h = w / ratio;
    if (h > maxH) {
      h = maxH;
      w = h * ratio;
    }
    doc.addImage(dataUrl, props.fileType || "PNG", x, y, w, h);
  } catch {
    // ignore
  }
};

const isNonWorkingDayDate = (dateStr: string, holidays: Holiday[]): boolean => {
  const d = parseISO(dateStr);
  if (isWeekend(d)) return true;
  return holidays.some((h) => h.date === dateStr);
};

const getNextWorkingDayStr = (dateStr: string, holidays: Holiday[]): string => {
  let d = addDays(parseISO(dateStr), 1);
  while (isWeekend(d) || holidays.some((h) => h.date === format(d, "yyyy-MM-dd"))) {
    d = addDays(d, 1);
  }
  return format(d, "yyyy-MM-dd");
};

export async function exportGanttToPDF(
  taskTree: GanttTask[],
  allTasks: GanttTask[],
  holidays: Holiday[],
  options: ExportOptions
) {
  const { contractName, timelineName, hideCompleted = false, orgMembers = [], excludedColumns = [] } = options;
  const excluded = new Set<GanttExportColumnKey>(excludedColumns);

  const memberById = new Map(orgMembers.map((m) => [m.id, m]));

  // Map for ancestor color lookup (children inherit lightened parent color)
  const taskById = new Map(allTasks.map((t) => [t.id, t]));
  const lightenHex = (hex: string, amount: number): string => {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const lr = Math.round(r + (255 - r) * amount);
    const lg = Math.round(g + (255 - g) * amount);
    const lb = Math.round(b + (255 - b) * amount);
    return `#${lr.toString(16).padStart(2, "0")}${lg.toString(16).padStart(2, "0")}${lb.toString(16).padStart(2, "0")}`;
  };
  const getEffectiveColor = (task: GanttTask): string | null => {
    if (task.color) return task.color;
    let current = task.parent_id ? taskById.get(task.parent_id) : null;
    while (current) {
      if (current.color) return lightenHex(current.color, 0.5);
      current = current.parent_id ? taskById.get(current.parent_id) : null;
    }
    return null;
  };

  // Filter completed if requested
  const filterTree = (nodes: GanttTask[]): GanttTask[] => {
    return nodes
      .filter((n) => !hideCompleted || n.status !== "completed")
      .map((n) => ({ ...n, children: n.children ? filterTree(n.children) : [] }));
  };
  const filteredTree = filterTree(taskTree);
  const flat = flattenTree(filteredTree);
  const filteredFlat = flat.map((f) => f.task);
  const hasCompleted = flat.some((f) => f.task.status === "completed");

  // Build map of tasks whose start_date falls on a non-working day → shifted to next working day
  const effectiveDateMap = new Map<string, string>();
  filteredFlat.forEach((task) => {
    if (task.start_date && isNonWorkingDayDate(task.start_date, holidays)) {
      effectiveDateMap.set(task.id, getNextWorkingDayStr(task.start_date, holidays));
    }
  });

  // Start/end dates actually drawn for a task (shifted when the start falls on a non-working day)
  const getEffectiveDates = (task: GanttTask) => {
    const adjusted = effectiveDateMap.has(task.id);
    const start = effectiveDateMap.get(task.id) ?? task.start_date;
    const shiftDays =
      adjusted && task.start_date && start ? differenceInDays(parseISO(start), parseISO(task.start_date)) : 0;
    const end =
      task.end_date && shiftDays > 0
        ? format(addDays(parseISO(task.end_date), shiftDays), "yyyy-MM-dd")
        : task.end_date;
    return { start, end, adjusted };
  };

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // ===== Header with logo =====
  const logos = await getLogoUrls();
  const logoData = await fetchImageAsDataURL(logos.dashboard_header);
  if (logoData) {
    drawLogo(doc, logoData, 10, 6, 40, 14);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Cronograma de Proyecto", pageWidth / 2, 12, { align: "center" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(contractName, pageWidth / 2, 18, { align: "center" });
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(timelineName, pageWidth / 2, 23, { align: "center" });
  doc.text(
    `Generado: ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: es })}`,
    pageWidth - 10,
    12,
    { align: "right" }
  );
  doc.setTextColor(0);
  if (hasCompleted) drawCompletedLegend(doc, pageWidth - 10, 27);

  // ===== Page 1: table columns + Gantt =====
  const chartTop = 30;
  const chartLeft = 10;
  // Column widths (mm). Excluded columns free up space for the Gantt area.
  const NAME_COL_WIDTH = 60;
  const chartColumns = (
    [
      { key: "responsible", label: "Responsable", width: 35, align: "left" },
      { key: "start", label: "Inicio", width: 20, align: "center" },
      { key: "duration", label: "Plazo", width: 18, align: "center" },
      { key: "end", label: "Término", width: 20, align: "center" },
    ] as const
  ).filter((c) => !excluded.has(c.key));
  const tableLeftWidth = NAME_COL_WIDTH + chartColumns.reduce((sum, c) => sum + c.width, 0);

  const chartCellText = (
    task: GanttTask,
    key: (typeof chartColumns)[number]["key"],
    width: number,
    effStart: string | null,
    effEnd: string | null
  ): string => {
    switch (key) {
      case "responsible": {
        const name = (task.responsible_member_id && memberById.get(task.responsible_member_id)?.name) || "—";
        const maxChars = Math.floor((width - 4) / 1.4);
        return name.length > maxChars ? name.slice(0, maxChars - 1) + "…" : name;
      }
      case "start":
        return effStart ? format(parseISO(effStart), "dd/MM/yy") : "—";
      case "duration":
        return `${task.duration_days} ${task.duration_type === "business" ? "h" : "d"}`;
      case "end":
        return effEnd ? format(parseISO(effEnd), "dd/MM/yy") : "—";
    }
  };

  const hasDates = filteredFlat.some((t) => t.start_date && t.end_date);
  const { minDate, maxDate } = hasDates
    ? getGanttDateRange(filteredFlat)
    : { minDate: new Date(), maxDate: new Date() };
  const days = hasDates ? eachDayOfInterval({ start: minDate, end: maxDate }) : [];
  const totalDays = days.length || 1;

  const ganttLeft = chartLeft + tableLeftWidth;
  const ganttWidth = pageWidth - ganttLeft - chartLeft;
  const dayWidth = hasDates ? Math.max(0.6, ganttWidth / totalDays) : 0;

  const rowHeight = 6;
  const headerHeight = 8;

  // Header row backgrounds
  doc.setFillColor(59, 130, 246);
  doc.rect(chartLeft, chartTop, tableLeftWidth + (hasDates ? totalDays * dayWidth : 0), headerHeight, "F");

  // Header text (white)
  const drawHeaderLabels = (top: number, nameLabel: string) => {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255);
    let cx = chartLeft;
    doc.text(nameLabel, cx + 2, top + 5.5);
    cx += NAME_COL_WIDTH;
    chartColumns.forEach((col) => {
      if (col.align === "center") {
        doc.text(col.label, cx + col.width / 2, top + 5.5, { align: "center" });
      } else {
        doc.text(col.label, cx + 2, top + 5.5);
      }
      cx += col.width;
    });
  };
  drawHeaderLabels(chartTop, "Tarea");

  // Column separators
  doc.setDrawColor(255);
  doc.setLineWidth(0.2);
  let sep = chartLeft + NAME_COL_WIDTH;
  chartColumns.forEach((col) => {
    doc.line(sep, chartTop, sep, chartTop + headerHeight);
    sep += col.width;
  });

  // Month markers in Gantt header
  if (hasDates) {
    doc.setFontSize(6);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255);
    let lastMonth = "";
    days.forEach((day, idx) => {
      const monthKey = format(day, "MMM yy", { locale: es });
      if (monthKey !== lastMonth) {
        const x = ganttLeft + idx * dayWidth;
        doc.setDrawColor(255);
        doc.line(x, chartTop, x, chartTop + headerHeight);
        doc.text(monthKey, x + 1, chartTop + 5.5);
        lastMonth = monthKey;
      }
    });
  }
  doc.setTextColor(0);

  // Today marker
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayIdx = hasDates ? days.findIndex((d) => format(d, "yyyy-MM-dd") === todayStr) : -1;

  // Rows
  let y = chartTop + headerHeight;
  const maxRowsPerPage = Math.floor((pageHeight - y - 12) / rowHeight);
  let rowsOnPage = 0;

  const drawRowHeader = () => {
    doc.setFillColor(59, 130, 246);
    doc.rect(chartLeft, y, tableLeftWidth + (hasDates ? totalDays * dayWidth : 0), headerHeight, "F");
    drawHeaderLabels(y, "Tarea (cont.)");
    doc.setTextColor(0);
    y += headerHeight;
  };

  flat.forEach(({ task, level }) => {
    const { start: effStart, end: effEnd, adjusted: startAdjusted } = getEffectiveDates(task);

    if (rowsOnPage >= maxRowsPerPage) {
      doc.addPage();
      y = 12;
      rowsOnPage = 0;
      drawRowHeader();
    }

    const isCompleted = task.status === "completed";

    // Row background (green tint for completed tasks, otherwise alternating)
    if (isCompleted) {
      doc.setFillColor(...COMPLETED_ROW_TINT);
      doc.rect(chartLeft, y, tableLeftWidth + (hasDates ? totalDays * dayWidth : 0), rowHeight, "F");
    } else if (rowsOnPage % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(chartLeft, y, tableLeftWidth + (hasDates ? totalDays * dayWidth : 0), rowHeight, "F");
    }

    // Weekend shading in Gantt area
    if (hasDates) {
      days.forEach((day, idx) => {
        if (isWeekend(day)) {
          doc.setFillColor(235, 235, 238);
          doc.rect(ganttLeft + idx * dayWidth, y, dayWidth, rowHeight, "F");
        }
      });
    }

    // Cell separators
    doc.setDrawColor(220);
    doc.setLineWidth(0.1);
    let sx = chartLeft + NAME_COL_WIDTH;
    chartColumns.forEach((col) => {
      doc.line(sx, y, sx, y + rowHeight);
      sx += col.width;
    });
    if (hasDates) {
      doc.line(ganttLeft, y, ganttLeft, y + rowHeight);
    }

    // Cell text
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    if (isCompleted) doc.setTextColor(...COMPLETED_GREEN_DARK);
    else doc.setTextColor(20);

    // Task name with indent (completed tasks get a check icon before the name)
    const indent = level * 2.5;
    const iconOffset = isCompleted ? 4 : 0;
    if (isCompleted) drawCheckIcon(doc, chartLeft + 2 + indent, y + (rowHeight - 3) / 2, 3);
    const nameMaxChars = Math.floor((NAME_COL_WIDTH - 4 - indent - iconOffset) / 1.4);
    const displayName =
      task.name.length > nameMaxChars
        ? task.name.slice(0, nameMaxChars - 1) + "…"
        : task.name;
    if (level === 0) doc.setFont("helvetica", "bold");
    doc.text(displayName, chartLeft + 2 + indent + iconOffset, y + rowHeight - 2);
    doc.setFont("helvetica", "normal");

    // Remaining columns (an adjusted start date is shown in orange)
    let dx = chartLeft + NAME_COL_WIDTH;
    chartColumns.forEach((col) => {
      const text = chartCellText(task, col.key, col.width, effStart, effEnd);
      const highlight = col.key === "start" && startAdjusted;
      if (highlight) doc.setTextColor(...ADJUSTED_ORANGE);
      if (col.align === "center") {
        doc.text(text, dx + col.width / 2, y + rowHeight - 2, { align: "center" });
      } else {
        doc.text(text, dx + 2, y + rowHeight - 2);
      }
      if (highlight) {
        if (isCompleted) doc.setTextColor(...COMPLETED_GREEN_DARK);
        else doc.setTextColor(20);
      }
      dx += col.width;
    });

    // Bar
    if (hasDates && effStart && effEnd) {
      const startOffset = differenceInDays(parseISO(effStart), minDate);
      const dur = differenceInDays(parseISO(effEnd), parseISO(effStart)) + 1;
      const x = ganttLeft + startOffset * dayWidth;
      const w = Math.max(0.5, dur * dayWidth);

      // Color (children inherit a lightened version of their parent's color).
      // Completed tasks are always green so they stand out from the rest.
      const hex = getEffectiveColor(task);
      if (isCompleted) {
        doc.setFillColor(...COMPLETED_GREEN);
      } else if (hex && /^#[0-9a-f]{6}$/i.test(hex)) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        doc.setFillColor(r, g, b);
      } else if (task.status === "in_progress") doc.setFillColor(59, 130, 246);
      else if (task.status === "delayed") doc.setFillColor(239, 68, 68);
      else doc.setFillColor(148, 163, 184);

      doc.rect(x, y + 1.2, w, rowHeight - 2.4, "F");

      if (isCompleted) {
        // Dark outline + white check inside the bar (when it is wide enough)
        doc.setDrawColor(...COMPLETED_GREEN_DARK);
        doc.setLineWidth(0.3);
        doc.rect(x, y + 1.2, w, rowHeight - 2.4, "S");
        if (w >= 4) drawCheckMark(doc, x + 0.6, y + (rowHeight - 3) / 2, 3);
      }
    }

    y += rowHeight;
    rowsOnPage++;
  });

  // Today vertical line across chart
  if (hasDates && todayIdx >= 0) {
    const todayX = ganttLeft + todayIdx * dayWidth + dayWidth / 2;
    doc.setDrawColor(59, 130, 246);
    doc.setLineWidth(0.4);
    doc.line(todayX, chartTop, todayX, y);
  }

  // Footnote for start dates shifted to the next working day (only if "Inicio" is exported)
  if (effectiveDateMap.size > 0 && !excluded.has("start")) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...ADJUSTED_ORANGE);
    doc.text(
      "Inicio en naranja: ajustado al siguiente día hábil (la fecha original caía en fin de semana o feriado)",
      chartLeft,
      Math.min(y + 5, pageHeight - 12)
    );
    doc.setTextColor(0);
  }

  // Footer page numbers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - 10, pageHeight - 5, { align: "right" });
  }

  const filename = `Cronograma_${contractName.replace(/[^\w-]/g, "_")}_${format(
    new Date(),
    "yyyyMMdd"
  )}.pdf`;
  doc.save(filename);
}
