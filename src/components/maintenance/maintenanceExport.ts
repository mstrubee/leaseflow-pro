import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { PDFDocument } from "pdf-lib";
import { MaintenanceForm, detectMaintenanceType } from "./types";
import logosHeader from "@/assets/logos-header.png";

export function exportMaintenanceExcel(
  forms: MaintenanceForm[],
  fileName = "mantenciones.xlsx",
  criticalityMap?: Map<string, string>,
  includeRevisado?: boolean,
  subStatusLabels?: Record<string, string>,
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
      base["Sub Estado"] = (subStatusLabels && subStatusLabels[subStatus]) || subStatus;
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

/**
 * For resolved forms: merges the FORM PDF + the uploaded signed OT into a single PDF.
 * Falls back to just the FORM PDF if no OT is available.
 */
export async function exportMergedFormAndOT(form: MaintenanceForm, companyName?: string, criticalityName?: string) {
  // Generate the FORM PDF as arraybuffer
  const formDoc = new jsPDF();
  const type = detectMaintenanceType(form);

  let logoHeight = 0;
  try {
    const logoImg = new Image();
    logoImg.src = logosHeader;
    await new Promise((resolve, reject) => { logoImg.onload = resolve; logoImg.onerror = reject; });
    formDoc.addImage(logoImg, "PNG", 14, 8, 50, 20);
    logoHeight = 22;
  } catch {}

  const startY = 10 + logoHeight;
  formDoc.setFontSize(16);
  formDoc.text(`FORM ${form.form_number}`, logoHeight > 0 ? 70 : 14, startY);
  formDoc.setFontSize(10);
  formDoc.setTextColor(100);
  formDoc.text(`Estado: ${form.status === "solucionado" ? "Solucionado" : "En Proceso"}`, 14, startY + 8);
  formDoc.text(`Fecha: ${form.created_date || "N/A"}`, 14, startY + 14);
  formDoc.text(`Empresa: ${companyName || "N/A"}`, 14, startY + 20);
  formDoc.text(`Local: ${form.contract_name || "N/A"}`, 14, startY + 26);
  formDoc.text(`Tipo: ${type}`, 14, startY + 32);
  if (criticalityName) {
    formDoc.text(`Criticidad: ${criticalityName}`, 14, startY + 38);
  }
  formDoc.setTextColor(0);

  const rows: [string, string][] = [];
  if (form.general_description) rows.push(["Descripción General", form.general_description]);
  if (form.electrical_description) rows.push(["Req. Eléctrico", form.electrical_description]);
  if (form.civil_description) rows.push(["Req. Obra Civil", form.civil_description]);
  if (form.hvac_description) rows.push(["Req. Climatización", form.hvac_description]);
  if (form.fixed_assets_description) rows.push(["Req. Activos Fijos", form.fixed_assets_description]);
  if (form.additional_comments) rows.push(["Comentarios Técnicos (Jefe Mantenciones)", form.additional_comments]);
  if (form.resolution_observations) rows.push(["Observaciones de Resolución", form.resolution_observations]);

  if (rows.length > 0) {
    autoTable(formDoc, {
      startY: startY + (criticalityName ? 44 : 38),
      head: [["Campo", "Detalle"]],
      body: rows,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [220, 38, 38] },
      columnStyles: { 0: { cellWidth: 55, fontStyle: "bold" } },
    });
  }

  const formPdfBytes = formDoc.output("arraybuffer");

  // If no OT file, just save the form PDF
  if (!form.ot_file_url) {
    formDoc.save(`FORM_${form.form_number}.pdf`);
    return;
  }

  try {
    // Fetch the uploaded OT file
    const otResponse = await fetch(form.ot_file_url);
    if (!otResponse.ok) throw new Error("No se pudo descargar la OT");
    const otBytes = await otResponse.arrayBuffer();

    // Merge using pdf-lib
    const mergedPdf = await PDFDocument.create();

    // Add FORM pages
    const formPdf = await PDFDocument.load(formPdfBytes);
    const formPages = await mergedPdf.copyPages(formPdf, formPdf.getPageIndices());
    formPages.forEach(p => mergedPdf.addPage(p));

    // Try to add OT pages (only works if OT is a PDF)
    try {
      const otPdf = await PDFDocument.load(otBytes);
      const otPages = await mergedPdf.copyPages(otPdf, otPdf.getPageIndices());
      otPages.forEach(p => mergedPdf.addPage(p));
    } catch {
      // OT is not a PDF (image, etc.) — embed as image on a new page
      try {
        const contentType = otResponse.headers.get("content-type") || "";
        let image;
        if (contentType.includes("png")) {
          image = await mergedPdf.embedPng(otBytes);
        } else {
          image = await mergedPdf.embedJpg(otBytes);
        }
        const page = mergedPdf.addPage();
        const { width: pw, height: ph } = page.getSize();
        const scale = Math.min(pw / image.width, ph / image.height, 1);
        const imgW = image.width * scale;
        const imgH = image.height * scale;
        page.drawImage(image, {
          x: (pw - imgW) / 2,
          y: (ph - imgH) / 2,
          width: imgW,
          height: imgH,
        });
      } catch {
        // Can't embed — just save form PDF alone
        formDoc.save(`FORM_OT_${form.form_number}.pdf`);
        return;
      }
    }

    const mergedBytes = await mergedPdf.save();
    const blob = new Blob([new Uint8Array(mergedBytes)], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `FORM_OT_${form.form_number}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Error merging PDFs:", err);
    // Fallback: just save form PDF
    formDoc.save(`FORM_${form.form_number}.pdf`);
  }
}

export async function exportDailyFormsPDF(
  forms: MaintenanceForm[],
  dateLabel: string,
  criticalityMap?: Map<string, string>,
  subStatusLabels?: Record<string, string>,
  zonalMap?: Map<string, string>,
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

  const head = [["N°", "Fecha", "Local", "Gerente Zonal", "Criticidad", "Descripción General", "Req. Eléctrico", "Req. Obra Civil", "Req. Climatización", "Req. Activos Fijos", "Comentarios"]];
  const body = forms.map(f => {
    const critName = (f.criticality_category_id && criticalityMap?.get(f.criticality_category_id)) || "";
    const zonalName = (f.contract_id && zonalMap?.get(f.contract_id)) || "";
    return [
      f.form_number,
      f.created_date || "",
      f.contract_name || "",
      zonalName,
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
      2: { cellWidth: 26 },
      3: { cellWidth: 26 },
      4: { cellWidth: 18 },
      5: { cellWidth: "auto" },
      6: { cellWidth: "auto" },
      7: { cellWidth: "auto" },
      8: { cellWidth: "auto" },
      9: { cellWidth: "auto" },
      10: { cellWidth: 50 },
    },
    didDrawPage: (data) => {
      // Footer
      const pageCount = (doc as any).internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Página ${data.pageNumber} de ${pageCount}`, doc.internal.pageSize.getWidth() - 30, doc.internal.pageSize.getHeight() - 8);
    },
  });

  doc.save(`FORMs_${dateLabel.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`);
}
