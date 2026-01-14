import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { KPI, KPICategory, KPIMeasurement } from "@/hooks/useKPI";

interface KPIWithStatus extends KPI {
  currentValue: number | null;
  previousValue: number | null;
  trend: "up" | "down" | "stable" | null;
  status: "green" | "yellow" | "red" | "unknown";
  measurements: KPIMeasurement[];
}

export function generateDashboardPDF(
  kpiWithLatestValue: KPIWithStatus[],
  categories: KPICategory[],
  summaryStats: { total: number; green: number; yellow: number; red: number; noData: number }
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;

  // Title
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Dashboard KPI - Control de Gestión", pageWidth / 2, 20, { align: "center" });

  // Date
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Generado: ${new Date().toLocaleDateString("es-CL")}`, pageWidth / 2, 28, { align: "center" });

  // Summary stats
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Resumen General", 14, 40);

  autoTable(doc, {
    startY: 45,
    head: [["KPIs Activos", "En Meta", "En Riesgo", "Crítico", "Sin Datos"]],
    body: [[
      summaryStats.total.toString(),
      summaryStats.green.toString(),
      summaryStats.yellow.toString(),
      summaryStats.red.toString(),
      summaryStats.noData.toString(),
    ]],
    theme: "grid",
    headStyles: { fillColor: [59, 130, 246] },
    styles: { halign: "center" },
  });

  // KPI details table
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  const afterSummary = (doc as any).lastAutoTable.finalY + 15;
  doc.text("Detalle de Indicadores", 14, afterSummary);

  const tableData = kpiWithLatestValue.map((kpi) => {
    const statusText = {
      green: "✓ En Meta",
      yellow: "⚠ En Riesgo",
      red: "✗ Crítico",
      unknown: "- Sin Datos",
    }[kpi.status];

    const trendText = {
      up: "↑",
      down: "↓",
      stable: "→",
    }[kpi.trend || ""] || "-";

    return [
      kpi.name,
      kpi.category?.name || "-",
      kpi.currentValue != null ? kpi.currentValue.toLocaleString() : "-",
      kpi.goal_value != null ? kpi.goal_value.toLocaleString() : "-",
      kpi.unit || "-",
      statusText,
      trendText,
    ];
  });

  autoTable(doc, {
    startY: afterSummary + 5,
    head: [["Nombre", "Categoría", "Valor Actual", "Meta", "Unidad", "Estado", "Tendencia"]],
    body: tableData,
    theme: "striped",
    headStyles: { fillColor: [59, 130, 246] },
    styles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 40 },
      5: { cellWidth: 25 },
    },
  });

  // Category summary
  const afterKPIs = (doc as any).lastAutoTable.finalY + 15;
  
  if (afterKPIs > 250) {
    doc.addPage();
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Resumen por Categoría", 14, 20);
  } else {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Resumen por Categoría", 14, afterKPIs);
  }

  const categoryData = categories
    .filter((c) => c.is_active)
    .map((cat) => {
      const catKPIs = kpiWithLatestValue.filter((k) => k.category_id === cat.id);
      const withStatus = catKPIs.filter((k) => k.status !== "unknown");
      return [
        cat.name,
        catKPIs.length.toString(),
        withStatus.filter((k) => k.status === "green").length.toString(),
        withStatus.filter((k) => k.status === "yellow").length.toString(),
        withStatus.filter((k) => k.status === "red").length.toString(),
      ];
    })
    .filter((row) => parseInt(row[1]) > 0);

  autoTable(doc, {
    startY: afterKPIs > 250 ? 25 : afterKPIs + 5,
    head: [["Categoría", "Total KPIs", "En Meta", "En Riesgo", "Crítico"]],
    body: categoryData,
    theme: "grid",
    headStyles: { fillColor: [59, 130, 246] },
    styles: { halign: "center" },
  });

  doc.save("dashboard-kpi.pdf");
}

export function generateKPIListPDF(
  kpis: KPI[],
  categories: KPICategory[]
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;

  // Title
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Listado de Indicadores KPI", pageWidth / 2, 20, { align: "center" });

  // Date
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Generado: ${new Date().toLocaleDateString("es-CL")}`, pageWidth / 2, 28, { align: "center" });

  // Stats
  doc.setFontSize(11);
  doc.text(`Total de KPIs: ${kpis.length} | Activos: ${kpis.filter(k => k.is_active).length} | Inactivos: ${kpis.filter(k => !k.is_active).length}`, 14, 40);

  // KPIs table
  const tableData = kpis.map((kpi) => [
    kpi.name,
    kpi.category?.name || "-",
    kpi.description?.substring(0, 50) || "-",
    kpi.goal_value != null ? `${kpi.goal_value} ${kpi.unit || ""}` : "-",
    kpi.frequency?.name || "-",
    kpi.is_active ? "Activo" : "Inactivo",
  ]);

  autoTable(doc, {
    startY: 48,
    head: [["Nombre", "Categoría", "Descripción", "Meta", "Frecuencia", "Estado"]],
    body: tableData,
    theme: "striped",
    headStyles: { fillColor: [59, 130, 246] },
    styles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 35 },
      2: { cellWidth: 50 },
    },
  });

  // Categories summary
  const afterKPIs = (doc as any).lastAutoTable.finalY + 15;

  if (afterKPIs < 250) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("KPIs por Categoría", 14, afterKPIs);

    const categoryData = categories
      .filter((c) => c.is_active)
      .map((cat) => {
        const catKPIs = kpis.filter((k) => k.category_id === cat.id);
        return [
          cat.name,
          catKPIs.length.toString(),
          catKPIs.filter((k) => k.is_active).length.toString(),
          catKPIs.filter((k) => !k.is_active).length.toString(),
        ];
      })
      .filter((row) => parseInt(row[1]) > 0);

    autoTable(doc, {
      startY: afterKPIs + 5,
      head: [["Categoría", "Total", "Activos", "Inactivos"]],
      body: categoryData,
      theme: "grid",
      headStyles: { fillColor: [59, 130, 246] },
      styles: { halign: "center" },
    });
  }

  doc.save("listado-kpi.pdf");
}
