import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO, eachDayOfInterval, differenceInDays, isWeekend } from "date-fns";
import { es } from "date-fns/locale";
import { GanttTask, Holiday } from "@/hooks/useGantt";
import { getGanttDateRange } from "@/lib/ganttDateUtils";
import { getLogoUrls } from "@/hooks/useAppLogos";

interface ExportOptions {
  contractName: string;
  timelineName: string;
  hideCompleted?: boolean;
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

export async function exportGanttToPDF(
  taskTree: GanttTask[],
  allTasks: GanttTask[],
  holidays: Holiday[],
  options: ExportOptions
) {
  const { contractName, timelineName, hideCompleted = false } = options;

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
    try {
      doc.addImage(logoData, "PNG", 10, 8, 40, 12);
    } catch {
      // ignore
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Cronograma de Proyecto", pageWidth / 2, 14, { align: "center" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(contractName, pageWidth / 2, 20, { align: "center" });
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(timelineName, pageWidth / 2, 25, { align: "center" });
  doc.text(
    `Generado: ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: es })}`,
    pageWidth - 10,
    14,
    { align: "right" }
  );
  doc.setTextColor(0);

  // ===== Visual Gantt =====
  if (filteredFlat.some((t) => t.start_date && t.end_date)) {
    const { minDate, maxDate } = getGanttDateRange(filteredFlat);
    const days = eachDayOfInterval({ start: minDate, end: maxDate });
    const totalDays = days.length;

    const chartTop = 32;
    const chartLeft = 10;
    const nameColWidth = 60;
    const availableWidth = pageWidth - chartLeft * 2 - nameColWidth;
    const dayWidth = Math.max(0.8, availableWidth / totalDays);
    const rowHeight = 5.5;
    const headerHeight = 6;

    // Header row
    doc.setFillColor(240, 240, 245);
    doc.rect(chartLeft, chartTop, nameColWidth + totalDays * dayWidth, headerHeight, "F");
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("Tarea", chartLeft + 2, chartTop + 4);

    // Month markers
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    let lastMonth = "";
    days.forEach((day, idx) => {
      const monthKey = format(day, "MMM yy", { locale: es });
      if (monthKey !== lastMonth) {
        const x = chartLeft + nameColWidth + idx * dayWidth;
        doc.setDrawColor(180);
        doc.line(x, chartTop, x, chartTop + headerHeight);
        doc.text(monthKey, x + 1, chartTop + 4);
        lastMonth = monthKey;
      }
    });

    // Today line
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const todayIdx = days.findIndex((d) => format(d, "yyyy-MM-dd") === todayStr);

    // Rows
    let y = chartTop + headerHeight;
    const maxRowsPerPage = Math.floor((pageHeight - y - 15) / rowHeight);
    let rowsOnPage = 0;

    flat.forEach(({ task, level }) => {
      if (rowsOnPage >= maxRowsPerPage) {
        doc.addPage();
        y = 15;
        rowsOnPage = 0;
        // redraw header
        doc.setFillColor(240, 240, 245);
        doc.rect(chartLeft, y, nameColWidth + totalDays * dayWidth, headerHeight, "F");
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text("Tarea (continuación)", chartLeft + 2, y + 4);
        y += headerHeight;
      }

      // Row background (alternating)
      if (rowsOnPage % 2 === 1) {
        doc.setFillColor(250, 250, 252);
        doc.rect(chartLeft, y, nameColWidth + totalDays * dayWidth, rowHeight, "F");
      }

      // Weekend shading
      days.forEach((day, idx) => {
        if (isWeekend(day)) {
          doc.setFillColor(235, 235, 238);
          doc.rect(chartLeft + nameColWidth + idx * dayWidth, y, dayWidth, rowHeight, "F");
        }
      });

      // Today column highlight
      if (todayIdx >= 0) {
        doc.setFillColor(59, 130, 246, 0.15 as any);
        doc.setDrawColor(59, 130, 246);
        doc.setLineWidth(0.2);
        doc.rect(
          chartLeft + nameColWidth + todayIdx * dayWidth,
          y,
          dayWidth,
          rowHeight,
          "S"
        );
      }

      // Task name
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(20);
      const indent = level * 3;
      const nameMaxChars = Math.floor((nameColWidth - 4 - indent) / 1.4);
      const displayName =
        task.name.length > nameMaxChars
          ? task.name.slice(0, nameMaxChars - 1) + "…"
          : task.name;
      doc.text(displayName, chartLeft + 2 + indent, y + rowHeight - 1.5);

      // Bar
      if (task.start_date && task.end_date) {
        const startOffset = differenceInDays(parseISO(task.start_date), minDate);
        const dur = differenceInDays(parseISO(task.end_date), parseISO(task.start_date)) + 1;
        const x = chartLeft + nameColWidth + startOffset * dayWidth;
        const w = Math.max(0.5, dur * dayWidth);

        // Color by status
        if (task.status === "completed") doc.setFillColor(34, 197, 94);
        else if (task.status === "in_progress") doc.setFillColor(59, 130, 246);
        else if (task.status === "delayed") doc.setFillColor(239, 68, 68);
        else doc.setFillColor(148, 163, 184);

        doc.rect(x, y + 1, w, rowHeight - 2, "F");
      }

      y += rowHeight;
      rowsOnPage++;
    });

    // Today vertical line across chart
    if (todayIdx >= 0) {
      const todayX = chartLeft + nameColWidth + todayIdx * dayWidth + dayWidth / 2;
      doc.setDrawColor(59, 130, 246);
      doc.setLineWidth(0.4);
      doc.line(todayX, chartTop, todayX, y);
    }
  }

  // ===== Detailed task table on new page =====
  doc.addPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Detalle de Tareas", pageWidth / 2, 15, { align: "center" });

  const statusLabel: Record<string, string> = {
    pending: "Pendiente",
    in_progress: "En curso",
    completed: "Completada",
    delayed: "Atrasada",
  };

  const tableRows = flat.map(({ task, level }) => [
    "  ".repeat(level) + task.name,
    task.start_date ? format(parseISO(task.start_date), "dd/MM/yyyy") : "—",
    task.end_date ? format(parseISO(task.end_date), "dd/MM/yyyy") : "—",
    `${task.duration_days} ${task.duration_type === "business" ? "háb." : "días"}`,
    statusLabel[task.status] || task.status,
    `${task.progress || 0}%`,
  ]);

  autoTable(doc, {
    startY: 20,
    head: [["Tarea", "Inicio", "Término", "Plazo", "Estado", "Progreso"]],
    body: tableRows,
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [59, 130, 246], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 100 },
      1: { cellWidth: 25, halign: "center" },
      2: { cellWidth: 25, halign: "center" },
      3: { cellWidth: 25, halign: "center" },
      4: { cellWidth: 30, halign: "center" },
      5: { cellWidth: 20, halign: "center" },
    },
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
