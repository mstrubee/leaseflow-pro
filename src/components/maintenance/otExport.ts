import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { MaintenanceForm } from "./types";
import { supabase } from "@/integrations/supabase/client";
import logosHeader from "@/assets/logos-header.png";
import logoAutoplanet from "@/assets/logo-autoplanet.png";
import logoAgroplanet from "@/assets/logo-agroplanet.png";

interface OTData {
  empresa: string;
  local: string;
  proveedor: string;
  fecha: string;
  formNumber: string;
  oc: string;
  descripcion: string;
}

async function getOTData(form: MaintenanceForm, contractCompanyMap?: Record<string, string[]>): Promise<OTData> {
  let empresa = "";
  let local = form.contract_name || "";
  const proveedor = form.supplier_name || "";
  const fecha = form.sub_status_cotizando_at
    ? new Date(form.sub_status_cotizando_at).toLocaleDateString("es-CL")
    : form.created_date || "";
  const formNumber = form.form_number || "";
  const oc = form.purchase_order_number || "";

  // Get company name
  if (form.contract_id && contractCompanyMap) {
    const companies = contractCompanyMap[form.contract_id] || [];
    empresa = companies.join(", ");
  } else if (form.contract_id) {
    const { data: cc } = await supabase
      .from("contract_companies")
      .select("companies!inner(name)")
      .eq("contract_id", form.contract_id)
      .returns<Array<{ companies: { name: string } }>>();
    if (cc) empresa = cc.map(r => r.companies.name).join(", ");
  }

  // Get Codigo and Cebe custom fields
  if (form.contract_id) {
    const { data: fields } = await supabase
      .from("contract_custom_fields")
      .select("id, field_name")
      .in("field_name", ["Codigo", "CEBE", "Código"]);

    if (fields && fields.length > 0) {
      const fieldIds = fields.map(f => f.id);
      const { data: values } = await supabase
        .from("contract_custom_field_values")
        .select("field_id, field_value")
        .eq("contract_id", form.contract_id)
        .in("field_id", fieldIds);

      const fieldMap: Record<string, string> = {};
      (values || []).forEach(v => {
        const field = fields.find(f => f.id === v.field_id);
        if (field && v.field_value) fieldMap[field.field_name.toLowerCase()] = v.field_value;
      });

      const codigo = fieldMap["codigo"] || fieldMap["código"] || "";
      const cebe = fieldMap["cebe"] || "";
      const parts = [form.contract_name, codigo, cebe].filter(Boolean);
      local = parts.join(" - ");
    }
  }

  // Build description
  const descParts: string[] = [];
  if (form.general_description?.trim()) descParts.push(form.general_description.trim());
  if (form.electrical_description?.trim()) descParts.push(`Eléctrico: ${form.electrical_description.trim()}`);
  if (form.civil_description?.trim()) descParts.push(`Obra Civil: ${form.civil_description.trim()}`);
  if (form.hvac_description?.trim()) descParts.push(`Climatización: ${form.hvac_description.trim()}`);
  if (form.fixed_assets_description?.trim()) descParts.push(`Activos Fijos: ${form.fixed_assets_description.trim()}`);
  if (form.additional_comments?.trim()) descParts.push(`\nComentarios: ${form.additional_comments.trim()}`);
  if (form.resolution_observations?.trim()) descParts.push(`\nObservaciones: ${form.resolution_observations.trim()}`);

  return {
    empresa,
    local,
    proveedor,
    fecha,
    formNumber,
    oc,
    descripcion: descParts.join("\n"),
  };
}

function getCompanyLogo(empresa: string): string | null {
  const lower = empresa.toLowerCase();
  if (lower.includes("autoplanet")) return logoAutoplanet;
  if (lower.includes("agroplanet")) return logoAgroplanet;
  return null;
}

export async function exportOTPDF(form: MaintenanceForm, contractCompanyMap?: Record<string, string[]>) {
  const data = await getOTData(form, contractCompanyMap);
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();

  // Header bar
  doc.setFillColor(200, 16, 16);
  doc.rect(14, 10, pageW - 28, 18, "F");
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text("ORDEN DE TRABAJO", pageW / 2 - 10, 22, { align: "center" });

  // Logo top-right
  try {
    const logoImg = new Image();
    logoImg.src = logosHeader;
    await new Promise((resolve, reject) => { logoImg.onload = resolve; logoImg.onerror = reject; });
    doc.addImage(logoImg, "PNG", pageW - 55, 11, 38, 16);
  } catch {}

  doc.setTextColor(0, 0, 0);

  // Company logo next to empresa
  const companyLogo = getCompanyLogo(data.empresa);

  // Data table
  const rows: [string, string][] = [
    ["EMPRESA", data.empresa],
    ["LOCAL", data.local],
    ["PROVEEDOR", data.proveedor],
    ["FECHA", data.fecha],
    ["FORM", data.formNumber],
    ["OC", data.oc],
  ];

  autoTable(doc, {
    startY: 34,
    body: rows,
    theme: "grid",
    styles: { fontSize: 10, cellPadding: 4 },
    columnStyles: {
      0: { cellWidth: 35, fontStyle: "bold", fillColor: [240, 240, 240] },
      1: { cellWidth: pageW - 63 },
    },
    didDrawCell: (hookData) => {
      // Draw company logo in EMPRESA row value cell
      if (companyLogo && hookData.row.index === 0 && hookData.column.index === 1) {
        try {
          const img = new Image();
          img.src = companyLogo;
          doc.addImage(img, "PNG", hookData.cell.x + hookData.cell.width - 22, hookData.cell.y + 1, 18, 8);
        } catch {}
      }
    },
  });

  // Description
  const descY = (doc as any).lastAutoTable?.finalY || 100;
  autoTable(doc, {
    startY: descY,
    body: [["DESCRIPCIÓN", data.descripcion || ""]],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4, minCellHeight: 60 },
    columnStyles: {
      0: { cellWidth: 35, fontStyle: "bold", fillColor: [240, 240, 240], valign: "top" },
      1: { cellWidth: pageW - 63 },
    },
  });

  // Signature section
  const sigY = (doc as any).lastAutoTable?.finalY + 15 || 200;

  doc.setFillColor(240, 240, 240);
  doc.rect(14, sigY, 80, 10, "F");
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("ENCARGADO DE TIENDA", 16, sigY + 7);

  const boxY = sigY + 14;
  doc.setDrawColor(0);
  doc.rect(14, boxY, pageW - 28, 45);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Recibe conforme:", pageW / 2 + 10, boxY + 8);

  // Signature lines
  doc.line(30, boxY + 38, 80, boxY + 38);
  doc.text("Firma Técnico", 38, boxY + 43);

  doc.line(pageW - 80, boxY + 38, pageW - 30, boxY + 38);
  doc.text("Firma Encargado Tienda", pageW - 78, boxY + 43);

  doc.save(`OT_FORM_${data.formNumber}.pdf`);
}

export async function exportOTExcel(form: MaintenanceForm, contractCompanyMap?: Record<string, string[]>) {
  const data = await getOTData(form, contractCompanyMap);

  const wb = XLSX.utils.book_new();
  const wsData = [
    ["ORDEN DE TRABAJO", "", "", "", "", "", ""],
    [],
    ["EMPRESA", data.empresa],
    ["LOCAL", data.local],
    ["PROVEEDOR", data.proveedor],
    ["FECHA", data.fecha],
    ["FORM", data.formNumber],
    ["OC", data.oc],
    ["DESCRIPCIÓN", data.descripcion],
    [], [], [], [], [], [], [], [], [], [], [], [],
    ["ENCARGADO DE TIENDA"],
    [],
    ["", "", "", "", "", "Recibe conforme:"],
    [], [], [], [], [],
    ["", "Firma Técnico", "", "", "", "", "Firma Encargado Tienda"],
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws["!cols"] = [{ wch: 16 }, { wch: 30 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 18 }, { wch: 24 }];
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "OT");
  XLSX.writeFile(wb, `OT_FORM_${data.formNumber}.xlsx`);
}

export function downloadBlankOTPDF() {
  const link = document.createElement("a");
  link.href = "/templates/OT-blank.pdf";
  link.download = "OT_en_blanco.pdf";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function downloadBlankOTExcel() {
  const link = document.createElement("a");
  link.href = "/templates/OT-blank.xlsx";
  link.download = "OT_en_blanco.xlsx";
  link.click();
}
