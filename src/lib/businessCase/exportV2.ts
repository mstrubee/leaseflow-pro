import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";
import type { BCInputs, BCResult } from "./model";
import { fmtMM, fmtPct } from "./format";
import bcTemplateUrl from "@/assets/bc_template.xlsx?url";

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

function isoToDate(iso?: string): Date {
  if (!iso) return new Date();
  const d = new Date(iso + "T00:00:00");
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/**
 * Exporta el Business Case en el MISMO formato de la planilla de muestra (Tipo.xlsx),
 * conservando estilos y fórmulas. Sólo se inyectan las celdas de entrada del proyecto;
 * el resto del modelo (P&L, TIR, VAN, payback…) lo calculan las fórmulas de la planilla.
 */
export async function exportBusinessCaseExcel(inputs: BCInputs, r: BCResult) {
  const buf = await fetch(bcTemplateUrl).then((res) => res.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);

  const datos = wb.getWorksheet("Datos");
  const sup = wb.getWorksheet("Supuestos");
  const res = wb.getWorksheet("Resumen business case");
  if (!datos || !sup || !res) {
    // Fallback defensivo: si la plantilla cambió, descargar igual lo que haya
    const b = await wb.xlsx.writeBuffer();
    saveBuffer(b, inputs.nombre);
    return;
  }

  const superficie = inputs.superficie || 0;

  // ---- Hoja Datos (entradas del contrato/proyecto) ----
  datos.getCell("E10").value = isoToDate(inputs.inicio); // Fecha
  datos.getCell("E11").value = inputs.comuna || "";
  datos.getCell("E12").value = inputs.direccion || "";
  datos.getCell("E13").value = inputs.tipo || "";
  datos.getCell("B14").value = superficie;                 // Superficie (m²)
  datos.getCell("B15").value = inputs.ufM2 || 0;           // Valor x m² (UF)
  datos.getCell("B16").value = inputs.durContratoAnios || 0;
  datos.getCell("B18").value = superficie > 0 ? (inputs.gastoComunUf || 0) / superficie : 0; // E18 = E14*B18 = gasto común UF
  datos.getCell("E19").value = isoToDate(inputs.inicio);   // Inicio
  datos.getCell("E20").value = inputs.graciaMeses || 0;    // Gracia (meses)
  datos.getCell("E29").value = 0;                          // Cobro por instalaciones
  datos.getCell("E30").value = (inputs.waccRate || 0) / 100; // Tasa de descuento

  // Inversión (MM CLP) → celdas fijas de la planilla; preserva el total físico
  const rows = r.inv.rows;
  const sumBy = (pred: (id: string, nombre: string) => boolean) =>
    rows.filter((x) => pred(x.id, (x.nombre || ""))).reduce((a, x) => a + x.monto, 0);
  const mob = sumBy((id, n) => /mob/i.test(id) || /mobil/i.test(n));
  const tec = sumBy((id, n) => /tec/i.test(id) || /tecno/i.test(n));
  const mkt = sumBy((id, n) => /mkt|market/i.test(id) || /market/i.test(n));
  const inventario = sumBy((id, n) => id === "inv" || /inventar/i.test(n));
  const habYResto = r.inv.fisica - mob - tec - mkt; // habilitación + resto físico
  datos.getCell("B23").value = +habYResto.toFixed(2);
  datos.getCell("B24").value = +mob.toFixed(2);
  datos.getCell("B25").value = +inventario.toFixed(2);
  datos.getCell("B26").value = +tec.toFixed(2);
  datos.getCell("B27").value = +mkt.toFixed(2);

  // ---- Hoja Supuestos (UF base + crecimiento anual como fórmulas) ----
  sup.getCell("B3").value = inputs.ufBase || 0;
  const ufCols = ["C", "D", "E", "F", "G"]; // años 2..6
  ufCols.forEach((col, i) => {
    const prev = i === 0 ? "B3" : `${ufCols[i - 1]}3`;
    const factor = 1 + (inputs.ufRates[i] ?? 0) / 100;
    sup.getCell(`${col}3`).value = { formula: `${prev}*${factor}` } as ExcelJS.CellFormulaValue;
  });

  // ---- Hoja Resumen business case (supuestos del P&L) ----
  const cols = ["N", "O", "P", "Q", "R"]; // años 1..5
  inputs.ventaMes.slice(0, 5).forEach((v, i) => { res.getCell(`${cols[i]}10`).value = v || 0; }); // Venta/mes
  res.getCell("N14").value = (inputs.margenDir || 0) / 100;          // Margen directo
  res.getCell("N15").value = -((inputs.otrosCostosDir || 0) / 100);  // Otros costos dir.
  cols.forEach((c) => { res.getCell(`${c}16`).value = -((inputs.costosVar || 0) / 100); }); // Costos variables
  cols.forEach((c) => { res.getCell(`${c}30`).value = -((inputs.tecPct || 0) / 100); });    // Tecnología
  cols.forEach((c) => { res.getCell(`${c}31`).value = -((inputs.ocupPct || 0) / 100); });   // Ocupación
  cols.forEach((c) => { res.getCell(`${c}38`).value = (inputs.taxRate || 0) / 100; });      // Impuesto
  // Personal mensual (MM) = (n° personas × costo por persona año) / 12
  res.getCell("B17").value = +(((inputs.personalY1 || 0) * (inputs.costoPersonaMM || 0)) / 12).toFixed(3);

  // Forzar recálculo de todas las fórmulas al abrir el archivo
  wb.calcProperties.fullCalcOnLoad = true;

  const out = await wb.xlsx.writeBuffer();
  saveBuffer(out, inputs.nombre);
}

function saveBuffer(buf: ArrayBuffer | ExcelJS.Buffer, nombre: string) {
  const blob = new Blob([buf as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `BusinessCase_${(nombre || "proyecto").replace(/\s+/g, "_")}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
