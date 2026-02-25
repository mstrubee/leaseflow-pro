import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { MaintenanceForm, detectMaintenanceType, SUB_STATUS_LABELS, SubStatus } from "./types";
import logosHeader from "@/assets/logos-header.png";

export function exportMaintenanceExcel(
  forms: MaintenanceForm[],
  fileName = "mantenciones.xlsx",
  criticalityMap?: Map<string, string>,
  includeRevisado?: boolean,
) {
  const data = forms.map(f => {
    const base: Record<string, string> = {
      "N° FORM": f.form_number,
      "Estado": f.status === "solucionado" ? "Solucionado" : "En Proceso",
      "Fecha": f.created_date || "",
      "Contrato": f.contract_name || "",
      "Tipo": detectMaintenanceType(f),
      "Descripción General": f.general_description || "",
      "Req. Eléctrico": f.electrical_description || "",
      "Req. Obra Civil": f.civil_description || "",
      "Req. Climatización": f.hvac_description || "",
      "Req. Activos Fijos": f.fixed_assets_description || "",
      "Comentarios": f.additional_comments || "",
    };
    if (criticalityMap) {
      base["Criticidad"] = (f.criticality_category_id && criticalityMap.get(f.criticality_category_id)) || "";
    }
    if (includeRevisado) {
      const subStatus = f.sub_status || "solicitado";
      base["Sub Estado"] = subStatus === "revisado" ? "Revisado" : (subStatus === "solicitado" ? "Solicitado" : subStatus);
    }
    return base;
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, "Mantenciones");
  XLSX.writeFile(wb, fileName);
}

export async function exportMaintenancePDF(form: MaintenanceForm, companyName?: string, criticalityName?: string) {
  const doc = new jsPDF();
  const type = detectMaintenanceType(form);

  // Logo
  let logoHeight = 0;
  try {
    const logoImg = new Image();
    logoImg.src = logosHeader;
    await new Promise((resolve, reject) => { logoImg.onload = resolve; logoImg.onerror = reject; });
    doc.addImage(logoImg, "PNG", 14, 8, 50, 20);
    logoHeight = 22;
  } catch {}

  const startY = 10 + logoHeight;
  doc.setFontSize(16);
  doc.text(`FORM ${form.form_number}`, logoHeight > 0 ? 70 : 14, startY);
  
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Estado: ${form.status === "solucionado" ? "Solucionado" : "En Proceso"}`, 14, startY + 8);
  doc.text(`Fecha: ${form.created_date || "N/A"}`, 14, startY + 14);
  doc.text(`Empresa: ${companyName || "N/A"}`, 14, startY + 20);
  doc.text(`Local: ${form.contract_name || "N/A"}`, 14, startY + 26);
  doc.text(`Tipo: ${type}`, 14, startY + 32);
  if (criticalityName) {
    doc.text(`Criticidad: ${criticalityName}`, 14, startY + 38);
  }
  doc.setTextColor(0);

  const rows: [string, string][] = [];
  if (form.general_description) rows.push(["Descripción General", form.general_description]);
  if (form.electrical_description) rows.push(["Req. Eléctrico", form.electrical_description]);
  if (form.civil_description) rows.push(["Req. Obra Civil", form.civil_description]);
  if (form.hvac_description) rows.push(["Req. Climatización", form.hvac_description]);
  if (form.fixed_assets_description) rows.push(["Req. Activos Fijos", form.fixed_assets_description]);
  if (form.additional_comments) rows.push(["Comentarios Técnicos (Jefe Mantenciones)", form.additional_comments]);

  if (rows.length > 0) {
    autoTable(doc, {
      startY: startY + (criticalityName ? 44 : 38),
      head: [["Campo", "Detalle"]],
      body: rows,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [220, 38, 38] },
      columnStyles: { 0: { cellWidth: 55, fontStyle: "bold" } },
    });
  }

  doc.save(`FORM_${form.form_number}.pdf`);
}

export async function exportDailyFormsPDF(
  forms: MaintenanceForm[],
  dateLabel: string,
  criticalityMap?: Map<string, string>,
) {
  const doc = new jsPDF({ orientation: "landscape" });

  // Logo
  let logoHeight = 0;
  try {
    const logoImg = new Image();
    logoImg.src = logosHeader;
    await new Promise((resolve, reject) => { logoImg.onload = resolve; logoImg.onerror = reject; });
    doc.addImage(logoImg, "PNG", 14, 8, 50, 20);
    logoHeight = 22;
  } catch {}

  const startY = 10 + logoHeight;
  doc.setFontSize(14);
  doc.text(`FORMs Mantenciones — ${dateLabel}`, logoHeight > 0 ? 70 : 14, startY);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Total: ${forms.length} formularios`, logoHeight > 0 ? 70 : 14, startY + 7);
  doc.setTextColor(0);

  if (forms.length === 0) {
    doc.setFontSize(12);
    doc.text("No hay formularios para esta fecha.", 14, startY + 20);
    doc.save(`FORMs_${dateLabel}.pdf`);
    return;
  }

  const head = [["N°", "Fecha", "Estado", "Sub Estado", "Local", "Tipo", "Criticidad", "Descripción General", "Req. Eléctrico", "Req. Obra Civil", "Req. Climatización", "Req. Activos Fijos", "Comentarios"]];
  const body = forms.map(f => {
    const subLabel = SUB_STATUS_LABELS[(f.sub_status || "solicitado") as SubStatus] || f.sub_status || "";
    const critName = (f.criticality_category_id && criticalityMap?.get(f.criticality_category_id)) || "";
    return [
      f.form_number,
      f.created_date || "",
      f.status === "solucionado" ? "Solucionado" : "En Proceso",
      subLabel,
      f.contract_name || "",
      detectMaintenanceType(f),
      critName,
      f.general_description || "",
      f.electrical_description || "",
      f.civil_description || "",
      f.hvac_description || "",
      f.fixed_assets_description || "",
      f.additional_comments || "",
    ];
  });

  autoTable(doc, {
    startY: startY + 12,
    head,
    body,
    styles: { fontSize: 7, cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: [220, 38, 38], fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 14 },
      1: { cellWidth: 18 },
      2: { cellWidth: 18 },
      3: { cellWidth: 18 },
      4: { cellWidth: 28 },
      5: { cellWidth: 16 },
      6: { cellWidth: 18 },
      7: { cellWidth: "auto" },
      8: { cellWidth: "auto" },
      9: { cellWidth: "auto" },
      10: { cellWidth: "auto" },
      11: { cellWidth: "auto" },
      12: { cellWidth: "auto" },
    },
    didDrawPage: (data) => {
      // Footer
      const pageCount = (doc as any).internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Página ${data.pageNumber} de ${pageCount}`, doc.internal.pageSize.getWidth() - 30, doc.internal.pageSize.getHeight() - 8);
    },
  });

  doc.save(`FORMs_${dateLabel}.pdf`);
}
