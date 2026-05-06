import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO, eachDayOfInterval, differenceInDays, isWeekend } from "date-fns";
import { es } from "date-fns/locale";
import { GanttTask, Holiday, OrgMember } from "@/hooks/useGantt";
import { getGanttDateRange } from "@/lib/ganttDateUtils";
import { getLogoUrls } from "@/hooks/useAppLogos";

interface ExportOptions {
  contractName: string;
  timelineName: string;
  hideCompleted?: boolean;
  orgMembers?: OrgMember[];
}

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

export async function exportGanttToPDF(
  taskTree: GanttTask[],
  allTasks: GanttTask[],
  holidays: Holiday[],
  options: ExportOptions
) {
  const { contractName, timelineName, hideCompleted = false, orgMembers = [] } = options;

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

  // ===== Page 1: 4 columns + Gantt =====
  const chartTop = 30;
  const chartLeft = 10;
  // Column widths (mm)
  const COL = {
    name: 60,
    responsible: 35,
    start: 20,
    duration: 18,
    end: 20,
  };
  const tableLeftWidth =
    COL.name + COL.responsible + COL.start + COL.duration + COL.end;

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
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255);
  let cx = chartLeft;
  doc.text("Tarea", cx + 2, chartTop + 5.5);
  cx += COL.name;
  doc.text("Responsable", cx + 2, chartTop + 5.5);
  cx += COL.responsible;
  doc.text("Inicio", cx + COL.start / 2, chartTop + 5.5, { align: "center" });
  cx += COL.start;
  doc.text("Plazo", cx + COL.duration / 2, chartTop + 5.5, { align: "center" });
  cx += COL.duration;
  doc.text("Término", cx + COL.end / 2, chartTop + 5.5, { align: "center" });

  // Column separators
  doc.setDrawColor(255);
  doc.setLineWidth(0.2);
  let sep = chartLeft + COL.name;
  [COL.responsible, COL.start, COL.duration, COL.end].forEach((w, i) => {
    doc.line(sep, chartTop, sep, chartTop + headerHeight);
    sep += w;
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
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255);
    let cx2 = chartLeft;
    doc.text("Tarea (cont.)", cx2 + 2, y + 5.5);
    cx2 += COL.name;
    doc.text("Responsable", cx2 + 2, y + 5.5);
    cx2 += COL.responsible;
    doc.text("Inicio", cx2 + COL.start / 2, y + 5.5, { align: "center" });
    cx2 += COL.start;
    doc.text("Plazo", cx2 + COL.duration / 2, y + 5.5, { align: "center" });
    cx2 += COL.duration;
    doc.text("Término", cx2 + COL.end / 2, y + 5.5, { align: "center" });
    doc.setTextColor(0);
    y += headerHeight;
  };

  flat.forEach(({ task, level }) => {
    if (rowsOnPage >= maxRowsPerPage) {
      doc.addPage();
      y = 12;
      rowsOnPage = 0;
      drawRowHeader();
    }

    // Row background (alternating)
    if (rowsOnPage % 2 === 1) {
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
    let sx = chartLeft + COL.name;
    [COL.responsible, COL.start, COL.duration, COL.end].forEach((w) => {
      doc.line(sx, y, sx, y + rowHeight);
      sx += w;
    });
    if (hasDates) {
      doc.line(ganttLeft, y, ganttLeft, y + rowHeight);
    }

    // Cell text
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(20);

    // Task name with indent
    const indent = level * 2.5;
    const nameMaxChars = Math.floor((COL.name - 4 - indent) / 1.4);
    const displayName =
      task.name.length > nameMaxChars
        ? task.name.slice(0, nameMaxChars - 1) + "…"
        : task.name;
    if (level === 0) doc.setFont("helvetica", "bold");
    doc.text(displayName, chartLeft + 2 + indent, y + rowHeight - 2);
    doc.setFont("helvetica", "normal");

    // Responsible
    let rx = chartLeft + COL.name + 2;
    const member = task.responsible_member_id ? memberById.get(task.responsible_member_id) : null;
    const respName = member?.name ?? "—";
    const respMaxChars = Math.floor((COL.responsible - 4) / 1.4);
    const respDisplay = respName.length > respMaxChars ? respName.slice(0, respMaxChars - 1) + "…" : respName;
    doc.text(respDisplay, rx, y + rowHeight - 2);

    // Start
    let dx = chartLeft + COL.name + COL.responsible;
    doc.text(
      task.start_date ? format(parseISO(task.start_date), "dd/MM/yy") : "—",
      dx + COL.start / 2,
      y + rowHeight - 2,
      { align: "center" }
    );
    dx += COL.start;

    // Duration
    doc.text(
      `${task.duration_days} ${task.duration_type === "business" ? "h" : "d"}`,
      dx + COL.duration / 2,
      y + rowHeight - 2,
      { align: "center" }
    );
    dx += COL.duration;

    // End
    doc.text(
      task.end_date ? format(parseISO(task.end_date), "dd/MM/yy") : "—",
      dx + COL.end / 2,
      y + rowHeight - 2,
      { align: "center" }
    );

    // Bar
    if (hasDates && task.start_date && task.end_date) {
      const startOffset = differenceInDays(parseISO(task.start_date), minDate);
      const dur = differenceInDays(parseISO(task.end_date), parseISO(task.start_date)) + 1;
      const x = ganttLeft + startOffset * dayWidth;
      const w = Math.max(0.5, dur * dayWidth);

      // Color
      const hex = (task as any).color as string | null;
      if (hex && /^#[0-9a-f]{6}$/i.test(hex)) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        doc.setFillColor(r, g, b);
      } else if (task.status === "completed") doc.setFillColor(34, 197, 94);
      else if (task.status === "in_progress") doc.setFillColor(59, 130, 246);
      else if (task.status === "delayed") doc.setFillColor(239, 68, 68);
      else doc.setFillColor(148, 163, 184);

      doc.rect(x, y + 1.2, w, rowHeight - 2.4, "F");
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

  // ===== Page 2: full table, no Gantt, larger text =====
  doc.addPage();
  if (logoData) drawLogo(doc, logoData, 10, 6, 40, 14);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(0);
  doc.text("Detalle de Tareas", pageWidth / 2, 14, { align: "center" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(contractName, pageWidth / 2, 20, { align: "center" });
  doc.setTextColor(0);

  const statusLabel: Record<string, string> = {
    pending: "Pendiente",
    in_progress: "En curso",
    completed: "Completada",
    delayed: "Atrasada",
  };

  const tableRows = flat.map(({ task, level }, idx) => [
    String(idx + 1),
    "  ".repeat(level) + task.name,
    task.responsible_member_id
      ? memberById.get(task.responsible_member_id)?.name ?? "—"
      : "—",
    task.start_date ? format(parseISO(task.start_date), "dd/MM/yyyy") : "—",
    `${task.duration_days} ${task.duration_type === "business" ? "háb." : "días"}`,
    task.end_date ? format(parseISO(task.end_date), "dd/MM/yyyy") : "—",
    statusLabel[task.status] || task.status,
    `${task.progress || 0}%`,
  ]);

  autoTable(doc, {
    startY: 26,
    head: [["#", "Tarea", "Responsable", "Inicio", "Plazo", "Término", "Estado", "Progreso"]],
    body: tableRows,
    styles: { fontSize: 11, cellPadding: 3 },
    headStyles: { fillColor: [59, 130, 246], textColor: 255, fontSize: 11 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      1: { cellWidth: 90 },
      2: { cellWidth: 50 },
      3: { cellWidth: 28, halign: "center" },
      4: { cellWidth: 24, halign: "center" },
      5: { cellWidth: 28, halign: "center" },
      6: { cellWidth: 28, halign: "center" },
      7: { cellWidth: 20, halign: "center" },
    },
    margin: { left: 10, right: 10 },
  });

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
