import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { KPI, KPICategory } from "@/hooks/useKPI";

interface KPIWithSubs {
  kpi: KPI;
  subKPIs: KPI[];
}

function buildKPITree(kpis: KPI[]): KPIWithSubs[] {
  const parents = kpis.filter((k) => !k.parent_kpi_id);
  return parents.map((parent) => ({
    kpi: parent,
    subKPIs: kpis.filter((k) => k.parent_kpi_id === parent.id),
  }));
}

// ─── EXCEL ────────────────────────────────────────────────

export function exportKPIDetailExcel(kpis: KPI[], categories: KPICategory[]) {
  const tree = buildKPITree(kpis);
  const workbook = XLSX.utils.book_new();

  const rows: Record<string, string | number>[] = [];

  tree.forEach((item) => {
    const { kpi, subKPIs } = item;
    const classLabel = kpi.kpi_classification === "kpi_empresa" ? "KPI Empresa" : "Objetivos Gerencia";

    rows.push({
      Tipo: "KPI",
      Nombre: kpi.name,
      Clasificación: classLabel,
      Categoría: kpi.category?.name || "-",
      Descripción: kpi.description || "-",
      Meta: kpi.kpi_classification === "kpi_empresa"
        ? (kpi.goal_100 != null ? `${kpi.goal_100} unidades` : "-")
        : (kpi.goal_value != null ? `${kpi.goal_value} ${kpi.unit || ""}` : "-"),
      Frecuencia: kpi.frequency?.name || "-",
      Estado: kpi.is_active ? "Activo" : "Inactivo",
      "Sub-KPIs": subKPIs.length,
    });

    subKPIs.forEach((sub) => {
      rows.push({
        Tipo: "  ↳ Sub-KPI",
        Nombre: sub.name,
        Clasificación: "",
        Categoría: sub.category?.name || "-",
        Descripción: sub.description || "-",
        Meta: sub.goal_value != null ? `${sub.goal_value} ${sub.unit || ""}` : "-",
        Frecuencia: sub.frequency?.name || "-",
        Estado: sub.is_active ? "Activo" : "Inactivo",
        "Sub-KPIs": "",
      });
    });
  });

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 14 },
    { wch: 35 },
    { wch: 20 },
    { wch: 20 },
    { wch: 60 },
    { wch: 20 },
    { wch: 15 },
    { wch: 10 },
    { wch: 10 },
  ];

  XLSX.utils.book_append_sheet(workbook, sheet, "Detalle KPIs");
  XLSX.writeFile(workbook, "detalle-kpis.xlsx");
}

// ─── PDF ──────────────────────────────────────────────────

export function exportKPIDetailPDF(kpis: KPI[], categories: KPICategory[]) {
  const tree = buildKPITree(kpis);
  const doc = new jsPDF();
  const pw = doc.internal.pageSize.width;

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Detalle de Indicadores KPI", pw / 2, 18, { align: "center" });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Generado: ${new Date().toLocaleDateString("es-CL")}  |  Total KPIs: ${tree.length}`, pw / 2, 25, { align: "center" });

  let y = 35;

  tree.forEach((item, idx) => {
    const { kpi, subKPIs } = item;

    if (y > 255) { doc.addPage(); y = 20; }

    // KPI header bar
    doc.setFillColor(59, 130, 246);
    doc.rect(14, y - 4, pw - 28, 10, "F");
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(`${idx + 1}. ${kpi.name}`, 17, y + 3);
    doc.setTextColor(0, 0, 0);
    y += 14;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");

    const classLabel = kpi.kpi_classification === "kpi_empresa" ? "KPI Empresa" : "Objetivos Gerencia";
    doc.text(`Clasificación: ${classLabel}   |   Categoría: ${kpi.category?.name || "-"}   |   Estado: ${kpi.is_active ? "Activo" : "Inactivo"}`, 14, y);
    y += 5;

    if (kpi.description) {
      const lines = doc.splitTextToSize(`Descripción: ${kpi.description}`, pw - 28);
      doc.text(lines, 14, y);
      y += 5 * lines.length;
    }

    // Meta
    if (kpi.kpi_classification === "kpi_empresa") {
      if (kpi.goal_100 != null) {
        doc.text(`Meta 100%: ${kpi.goal_100} unidades  |  80%: ${Math.round(kpi.goal_100 * 0.8)}  |  120%: ${Math.round(kpi.goal_100 * 1.2)}`, 14, y);
        y += 5;
      }
    } else if (kpi.goal_value != null) {
      doc.text(`Meta: ${kpi.goal_value} ${kpi.unit || ""}`, 14, y);
      y += 5;
    }

    if (kpi.frequency?.name) {
      doc.text(`Frecuencia: ${kpi.frequency.name}`, 14, y);
      y += 5;
    }

    // Sub-KPIs table
    if (subKPIs.length > 0) {
      y += 2;
      if (y > 240) { doc.addPage(); y = 20; }

      const subData = subKPIs.map((s) => [
        s.name,
        s.description || "-",
        s.goal_value != null ? `${s.goal_value} ${s.unit || ""}` : "-",
        s.frequency?.name || "-",
        s.is_active ? "Activo" : "Inact.",
      ]);

      autoTable(doc, {
        startY: y,
        head: [["Sub-KPI", "Descripción", "Meta", "Frecuencia", "Estado"]],
        body: subData,
        theme: "striped",
        headStyles: { fillColor: [100, 149, 237], fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 2 },
        margin: { left: 18 },
        tableWidth: pw - 36,
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: "auto" },
          2: { cellWidth: 22 },
          3: { cellWidth: 22 },
          4: { cellWidth: 15 },
        },
      });

      y = (doc as any).lastAutoTable.finalY + 10;
    } else {
      y += 8;
    }
  });

  doc.save("detalle-kpis.pdf");
}

// ─── WORD (.doc via HTML) ─────────────────────────────────

export function exportKPIDetailWord(kpis: KPI[], categories: KPICategory[]) {
  const tree = buildKPITree(kpis);

  let html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="utf-8"><title>Detalle KPIs</title>
    <style>
      body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #222; }
      h1 { text-align: center; color: #1e40af; font-size: 18pt; margin-bottom: 4px; }
      .date { text-align: center; color: #666; font-size: 9pt; margin-bottom: 20px; }
      .kpi-header { background: #3b82f6; color: white; padding: 6px 12px; font-size: 13pt; font-weight: bold; margin-top: 16px; }
      .kpi-meta { font-size: 10pt; color: #555; margin: 4px 0 2px 0; }
      .kpi-desc { font-size: 10pt; margin: 4px 0 8px 0; }
      table { border-collapse: collapse; width: 90%; margin: 4px 0 12px 20px; }
      th { background: #6495ed; color: white; padding: 4px 8px; font-size: 9pt; text-align: left; }
      td { border: 1px solid #ccc; padding: 4px 8px; font-size: 9pt; }
      tr:nth-child(even) { background: #f5f7fa; }
    </style></head><body>
    <h1>Detalle de Indicadores KPI</h1>
    <p class="date">Generado: ${new Date().toLocaleDateString("es-CL")} &nbsp;|&nbsp; Total KPIs: ${tree.length}</p>
  `;

  tree.forEach((item, idx) => {
    const { kpi, subKPIs } = item;
    const classLabel = kpi.kpi_classification === "kpi_empresa" ? "KPI Empresa" : "Objetivos Gerencia";

    html += `<div class="kpi-header">${idx + 1}. ${escapeHtml(kpi.name)}</div>`;
    html += `<p class="kpi-meta">Clasificación: ${classLabel} &nbsp;|&nbsp; Categoría: ${escapeHtml(kpi.category?.name || "-")} &nbsp;|&nbsp; Estado: ${kpi.is_active ? "Activo" : "Inactivo"}</p>`;

    if (kpi.description) {
      html += `<p class="kpi-desc"><b>Descripción:</b> ${escapeHtml(kpi.description)}</p>`;
    }

    if (kpi.kpi_classification === "kpi_empresa" && kpi.goal_100 != null) {
      html += `<p class="kpi-meta">Meta 100%: ${kpi.goal_100} unidades &nbsp;|&nbsp; 80%: ${Math.round(kpi.goal_100 * 0.8)} &nbsp;|&nbsp; 120%: ${Math.round(kpi.goal_100 * 1.2)}</p>`;
    } else if (kpi.goal_value != null) {
      html += `<p class="kpi-meta">Meta: ${kpi.goal_value} ${escapeHtml(kpi.unit || "")}</p>`;
    }

    if (kpi.frequency?.name) {
      html += `<p class="kpi-meta">Frecuencia: ${escapeHtml(kpi.frequency.name)}</p>`;
    }

    if (subKPIs.length > 0) {
      html += `<table><tr><th>Sub-KPI</th><th>Descripción</th><th>Meta</th><th>Frecuencia</th><th>Estado</th></tr>`;
      subKPIs.forEach((s) => {
        html += `<tr>
          <td>${escapeHtml(s.name)}</td>
          <td>${escapeHtml(s.description || "-")}</td>
          <td>${s.goal_value != null ? `${s.goal_value} ${escapeHtml(s.unit || "")}` : "-"}</td>
          <td>${escapeHtml(s.frequency?.name || "-")}</td>
          <td>${s.is_active ? "Activo" : "Inactivo"}</td>
        </tr>`;
      });
      html += `</table>`;
    }
  });

  html += `</body></html>`;

  const blob = new Blob(["\ufeff", html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "detalle-kpis.doc";
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
