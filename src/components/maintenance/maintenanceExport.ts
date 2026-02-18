import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { MaintenanceForm, detectMaintenanceType } from "./types";

export function exportMaintenanceExcel(forms: MaintenanceForm[], fileName = "mantenciones.xlsx") {
  const data = forms.map(f => ({
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
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, "Mantenciones");
  XLSX.writeFile(wb, fileName);
}

export function exportMaintenancePDF(form: MaintenanceForm, companyName?: string) {
  const doc = new jsPDF();
  const type = detectMaintenanceType(form);

  doc.setFontSize(16);
  doc.text(`FORM ${form.form_number}`, 14, 20);
  
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Estado: ${form.status === "solucionado" ? "Solucionado" : "En Proceso"}`, 14, 28);
  doc.text(`Fecha: ${form.created_date || "N/A"}`, 14, 34);
  doc.text(`Empresa: ${companyName || "N/A"}`, 14, 40);
  doc.text(`Local: ${form.contract_name || "N/A"}`, 14, 46);
  doc.text(`Tipo: ${type}`, 14, 52);
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
      startY: 58,
      head: [["Campo", "Detalle"]],
      body: rows,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [220, 38, 38] },
      columnStyles: { 0: { cellWidth: 55, fontStyle: "bold" } },
    });
  }

  doc.save(`FORM_${form.form_number}.pdf`);
}
