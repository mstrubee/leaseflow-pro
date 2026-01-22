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

export function generateSelectedKPIsPDF(
  selectedKPIs: KPI[],
  subKPIs: KPI[],
  categories: KPICategory[]
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;

  // Title
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Informe de Indicadores KPI Seleccionados", pageWidth / 2, 20, { align: "center" });

  // Date
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Generado: ${new Date().toLocaleDateString("es-CL")}`, pageWidth / 2, 28, { align: "center" });

  // Summary
  doc.setFontSize(11);
  const totalSubKPIs = subKPIs.length;
  doc.text(`KPIs Seleccionados: ${selectedKPIs.length} | Sub-KPIs incluidos: ${totalSubKPIs}`, 14, 40);

  let currentY = 50;

  // Process each selected KPI
  selectedKPIs.forEach((kpi, index) => {
    // Check if we need a new page
    if (currentY > 250) {
      doc.addPage();
      currentY = 20;
    }

    // KPI Header
    doc.setFillColor(59, 130, 246);
    doc.rect(14, currentY - 5, pageWidth - 28, 12, "F");
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(`${index + 1}. ${kpi.name}`, 18, currentY + 3);
    doc.setTextColor(0, 0, 0);

    currentY += 15;

    // KPI Details
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    const classificationLabel = kpi.kpi_classification === "kpi_empresa" ? "KPI Empresa" : "Objetivos Gerencia";
    doc.text(`Clasificación: ${classificationLabel}`, 14, currentY);
    currentY += 6;

    doc.text(`Categoría: ${kpi.category?.name || "Sin categoría"}`, 14, currentY);
    currentY += 6;

    if (kpi.description) {
      const descLines = doc.splitTextToSize(`Descripción: ${kpi.description}`, pageWidth - 28);
      doc.text(descLines, 14, currentY);
      currentY += 6 * descLines.length;
    }

    // Meta info
    if (kpi.kpi_classification === "kpi_empresa") {
      if (kpi.goal_100 != null) {
        doc.text(`Meta 100%: ${kpi.goal_100} unidades`, 14, currentY);
        currentY += 6;
        const goal80 = Math.round(kpi.goal_100 * 0.8);
        const goal120 = Math.round(kpi.goal_100 * 1.2);
        doc.text(`Umbral 80%: ${goal80} | Umbral 120%: ${goal120}`, 14, currentY);
        currentY += 6;
      }
      if ((kpi as any).validity_start && (kpi as any).validity_end) {
        doc.text(`Vigencia: ${new Date((kpi as any).validity_start).toLocaleDateString("es-CL")} - ${new Date((kpi as any).validity_end).toLocaleDateString("es-CL")}`, 14, currentY);
        currentY += 6;
      }
    } else {
      if (kpi.goal_value != null) {
        doc.text(`Meta: ${kpi.goal_value} ${kpi.unit || ""}`, 14, currentY);
        currentY += 6;
      }
      if (kpi.threshold_green != null && kpi.threshold_yellow != null) {
        doc.text(`Umbral Verde: ${kpi.threshold_green} | Umbral Amarillo: ${kpi.threshold_yellow}`, 14, currentY);
        currentY += 6;
      }
    }

    doc.text(`Frecuencia: ${kpi.frequency?.name || "-"}`, 14, currentY);
    currentY += 6;

    doc.text(`Estado: ${kpi.is_active ? "Activo" : "Inactivo"}`, 14, currentY);
    currentY += 10;

    // Sub-KPIs for this parent
    const kpiSubKPIs = subKPIs.filter((sub) => (sub as any).parent_kpi_id === kpi.id);

    if (kpiSubKPIs.length > 0) {
      if (currentY > 230) {
        doc.addPage();
        currentY = 20;
      }

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(`Sub-KPIs (${kpiSubKPIs.length})`, 18, currentY);
      currentY += 8;

      // Sub-KPIs table
      const subTableData = kpiSubKPIs.map((sub) => {
        const assignedUser = (sub as any).responsible_user;
        return [
          sub.name,
          assignedUser?.full_name || assignedUser?.email || "-",
          sub.goal_value != null ? `${sub.goal_value} ${sub.unit || ""}` : "-",
          sub.is_active ? "Activo" : "Inactivo",
        ];
      });

      autoTable(doc, {
        startY: currentY,
        head: [["Nombre Sub-KPI", "Responsable", "Meta", "Estado"]],
        body: subTableData,
        theme: "striped",
        headStyles: { fillColor: [100, 149, 237] },
        styles: { fontSize: 9 },
        margin: { left: 18 },
        tableWidth: pageWidth - 36,
      });

      currentY = (doc as any).lastAutoTable.finalY + 15;
    } else {
      currentY += 5;
    }
  });

  // Summary by category at the end
  if (currentY > 220) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Resumen por Categoría", 14, currentY);
  currentY += 8;

  const categoryData = categories
    .filter((c) => c.is_active)
    .map((cat) => {
      const catKPIs = selectedKPIs.filter((k) => k.category_id === cat.id);
      const catSubKPIs = subKPIs.filter((s) => {
        const parentKPI = selectedKPIs.find((k) => k.id === (s as any).parent_kpi_id);
        return parentKPI?.category_id === cat.id;
      });
      return [
        cat.name,
        catKPIs.length.toString(),
        catSubKPIs.length.toString(),
      ];
    })
    .filter((row) => parseInt(row[1]) > 0 || parseInt(row[2]) > 0);

  if (categoryData.length > 0) {
    autoTable(doc, {
      startY: currentY,
      head: [["Categoría", "KPIs", "Sub-KPIs"]],
      body: categoryData,
      theme: "grid",
      headStyles: { fillColor: [59, 130, 246] },
      styles: { halign: "center" },
    });
  }

  doc.save("informe-kpis-seleccionados.pdf");
}
