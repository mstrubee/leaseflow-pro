import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import type { BCInputs, BCResult } from "./model";
import { fmtMM, fmtPct } from "./format";

const YEAR_LABELS = ["Año 0", "Año 1", "Año 2", "Año 3", "Año 4", "Año 5"];

const PNL_ROWS: { label: string; key: keyof BCResult }[] = [
  { label: "Ingresos", key: "ingresos" },
  { label: "Costo de Ventas", key: "costoVentas" },
  { label: "Otros costos directos", key: "otrosCostos" },
  { label: "Costos variables", key: "costosVar" },
  { label: "Margen de Contribución", key: "margenCtrib" },
  { label: "Personal", key: "personal" },
  { label: "Publicidad", key: "publicidad" },
  { label: "Gastos Generales", key: "gastosGral" },
  { label: "Tecnología", key: "tecnologia" },
  { label: "Ocupación", key: "ocupacion" },
  { label: "Canon Arriendo", key: "canonArr" },
  { label: "Gasto Común", key: "gastoComun" },
  { label: "EBITDA", key: "ebitda" },
  { label: "Depreciación", key: "depreciacion" },
  { label: "EBIT", key: "ebit" },
  { label: "Impuesto", key: "impuesto" },
  { label: "UDI", key: "udi" },
  { label: "Flujo operativo", key: "flujoOp" },
  { label: "Flujo acumulado", key: "payback" },
];

function kpiRows(inputs: BCInputs, r: BCResult): string[][] {
  return [
    ["TIR", r.tir != null ? fmtPct(r.tir) : "N/A"],
    ["Tasa descuento", `${inputs.waccRate}%`],
    ["VAN (MM CLP)", fmtMM(r.van)],
    ["Payback", r.paybackAnio > 0 ? `${r.paybackAnio} año(s)` : ">5 años"],
    ["Inversión total (MM CLP)", fmtMM(r.totalCapex)],
    ["EBITDA Margin Año 5", fmtPct(r.ebitdaMargin5)],
    ["Escenario", inputs.scenario === "opt" ? "Optimista" : inputs.scenario === "cons" ? "Conservador" : "Base"],
  ];
}

export function exportBusinessCasePDF(inputs: BCInputs, r: BCResult) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt" });
  const W = doc.internal.pageSize.getWidth();
  doc.setFontSize(16);
  doc.text("Business Case Financiero", 40, 40);
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(`${inputs.nombre} · ${inputs.tipo} / ${inputs.categoria}`, 40, 58);
  doc.text(`${inputs.direccion}${inputs.comuna ? ", " + inputs.comuna : ""}`, 40, 72);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 90,
    head: [["Indicador", "Valor"]],
    body: kpiRows(inputs, r),
    theme: "grid",
    styles: { fontSize: 9 },
    headStyles: { fillColor: [59, 130, 246] },
    tableWidth: 280,
  });

  autoTable(doc, {
    startY: 90,
    margin: { left: 340 },
    head: [["Plan de Inversión (MM CLP)", "Monto", "%"]],
    body: [
      ...r.inv.rows.map((x) => [x.nombre, fmtMM(x.monto), `${x.pct.toFixed(1)}%`]),
      ["TOTAL", fmtMM(r.inv.total), "100%"],
    ],
    theme: "grid",
    styles: { fontSize: 9 },
    headStyles: { fillColor: [139, 92, 246] },
    tableWidth: W - 340 - 40,
  });

  // @ts-expect-error lastAutoTable injected by plugin
  const y = (doc.lastAutoTable?.finalY ?? 200) + 20;
  autoTable(doc, {
    startY: y,
    head: [["Estado de Resultados (MM CLP)", ...YEAR_LABELS]],
    body: PNL_ROWS.map((row) => {
      const vals = r[row.key] as number[];
      return [row.label, ...vals.map((v) => fmtMM(v ?? 0))];
    }),
    theme: "striped",
    styles: { fontSize: 8, halign: "right" },
    columnStyles: { 0: { halign: "left", fontStyle: "bold" } },
    headStyles: { fillColor: [16, 185, 129], halign: "right" },
  });

  doc.save(`BusinessCase_${(inputs.nombre || "proyecto").replace(/\s+/g, "_")}.pdf`);
}

export function exportBusinessCaseExcel(inputs: BCInputs, r: BCResult) {
  const wb = XLSX.utils.book_new();

  const resumen = [
    ["Business Case Financiero"],
    ["Proyecto", inputs.nombre],
    ["Tipo / Categoría", `${inputs.tipo} / ${inputs.categoria}`],
    ["Dirección", `${inputs.direccion}${inputs.comuna ? ", " + inputs.comuna : ""}`],
    [],
    ["Indicador", "Valor"],
    ...kpiRows(inputs, r),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), "Resumen");

  const inv = [
    ["Línea", "Método", "Monto (MM CLP)", "%", "Nota"],
    ...r.inv.rows.map((x) => [x.nombre, x.metodo, +x.monto.toFixed(2), +x.pct.toFixed(1), x.nota ?? ""]),
    ["TOTAL", "", +r.inv.total.toFixed(2), 100, ""],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(inv), "Inversión");

  const pnl = [
    ["Estado de Resultados (MM CLP)", ...YEAR_LABELS],
    ...PNL_ROWS.map((row) => {
      const vals = r[row.key] as number[];
      return [row.label, ...vals.map((v) => +(v ?? 0).toFixed(2))];
    }),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pnl), "Proyecciones");

  XLSX.writeFile(wb, `BusinessCase_${(inputs.nombre || "proyecto").replace(/\s+/g, "_")}.xlsx`);
}
