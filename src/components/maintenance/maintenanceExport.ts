import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { MaintenanceForm, detectMaintenanceType } from "./types";
import logosHeader from "@/assets/logos-header.png";

export function exportMaintenanceExcel(
  forms: MaintenanceForm[],
  fileName = "mantenciones.xlsx",
  criticalityMap?: Map<string, string>,
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
