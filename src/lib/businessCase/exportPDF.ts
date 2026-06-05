import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { BusinessCaseInputs, BusinessCaseResult } from "./calc";
import { fmtMM, fmtPct, fmtUf } from "./format";

const r1 = (v: number) => fmtMM(v, 1);

export function exportBusinessCasePDF(inputs: BusinessCaseInputs, result: BusinessCaseResult) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const navy: [number, number, number] = [15, 27, 61];
  const accent: [number, number, number] = [59, 111, 160];

  // Header band
  doc.setFillColor(...navy);
  doc.rect(0, 0, pageW, 56, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Business Case Financiero", 40, 26);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`${inputs.nombre || "Contrato"}  ·  ${inputs.comuna || ""}`, 40, 44);

  // KPI cards
  const kpis = [
    ["TIR", result.tir != null ? fmtPct(result.tir, 1) : "N/A"],
    ["VAN", `MM$ ${r1(result.van)}`],
    ["Payback", result.paybackAnios != null ? `${fmtMM(result.paybackAnios, 1)} años` : "N/A"],
    ["Inversión total", `MM$ ${r1(result.inversionTotal)}`],
    ["Canon", fmtUf(result.canonUfMensual, 1)],
  ];
  const cardW = (pageW - 80 - 4 * 12) / 5;
  let x = 40;
  const cardY = 70;
  kpis.forEach(([label, value]) => {
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(x, cardY, cardW, 54, 6, 6, "F");
    doc.setTextColor(110, 120, 135);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(label.toUpperCase(), x + 12, cardY + 18);
    doc.setTextColor(...accent);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(value, x + 12, cardY + 40);
    x += cardW + 12;
  });

  // Ficha
  autoTable(doc, {
    startY: cardY + 70,
    theme: "plain",
    styles: { fontSize: 8, cellPadding: 2 },
    body: [
      ["Empresa", inputs.empresa || "-", "Superficie", `${fmtMM(inputs.superficieM2, 0)} m²`],
      ["Dirección", inputs.direccion || "-", "Gasto común", fmtUf(inputs.gastoComunUf, 1)],
      ["Plazo", `${inputs.plazoAnios} años`, "Garantía", fmtUf(inputs.garantiaUf, 1)],
      ["Tasa descuento", fmtPct(inputs.tasaDescuento, 1), "Impuesto", fmtPct(inputs.impuestoPct, 0)],
    ],
    columnStyles: {
      0: { fontStyle: "bold", textColor: navy },
      2: { fontStyle: "bold", textColor: navy },
    },
    margin: { left: 40, right: 40 },
  });

  // P&L table
  const years = result.years;
  const head = [["Concepto (MM$)", ...years.map((y) => String(y.year))]];
  const num = (v: number) => fmtMM(v, 1);
  const pctRow = (v: number) => fmtPct(v, 1);
  const body: string[][] = [
    ["Ingresos", ...years.map((y) => num(y.ingresos))],
    ["Margen de contribución", ...years.map((y) => num(y.margenContribucion))],
    ["% Margen", ...years.map((y) => pctRow(y.margenContribucionPct))],
    ["Gasto personal", ...years.map((y) => num(y.gastoPersonal))],
    ["Canon", ...years.map((y) => num(y.canon))],
    ["Gasto común", ...years.map((y) => num(y.gastoComun))],
    ["EBITDA", ...years.map((y) => num(y.ebitda))],
    ["% EBITDA", ...years.map((y) => pctRow(y.ebitdaPct))],
    ["EBIT", ...years.map((y) => num(y.ebit))],
    ["Impuesto", ...years.map((y) => num(y.impuesto))],
    ["Flujo operativo", ...years.map((y) => num(y.flujoOperativo))],
    ["Flujo acumulado", ...years.map((y) => num(y.flujoAcumulado))],
  ];

  autoTable(doc, {
    startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14,
    head,
    body,
    theme: "grid",
    headStyles: { fillColor: navy, textColor: 255, fontSize: 8, halign: "right" },
    styles: { fontSize: 8, halign: "right", cellPadding: 3 },
    columnStyles: { 0: { halign: "left", fontStyle: "bold", textColor: navy } },
    margin: { left: 40, right: 40 },
    didParseCell: (data) => {
      if (data.section === "body") {
        const label = body[data.row.index][0];
        if (["EBITDA", "EBIT", "Flujo operativo", "Flujo acumulado"].includes(label)) {
          data.cell.styles.fillColor = [240, 244, 248];
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
  });

  const safe = (inputs.nombre || "business_case").replace(/[^\w\-]+/g, "_");
  doc.save(`BusinessCase_${safe}.pdf`);
}
