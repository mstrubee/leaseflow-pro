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
  // B21 = meses de OPERACIÓN del año 1 (desde la apertura). La plantilla lo
  // derivaba de =(12-MONTH(E19))-1, que ignora tanto la gracia como la fecha de
  // apertura; se escribe el valor que ya calcula la app para que planilla y
  // pantalla coincidan. De B21 cuelgan los ingresos del año 1 (N9) y, vía
  // A17 = B21+1, los meses de personal (que parte un mes antes de abrir).
  datos.getCell("B21").value = r.mesesOperacion;
  datos.getCell("E29").value = 0;                          // Cobro por instalaciones
  datos.getCell("E30").value = (inputs.waccRate || 0) / 100; // Tasa de descuento

  // ── Inversión ──────────────────────────────────────────────────────────────
  // Clasifica cada línea en las 5 filas de la plantilla, respetando cualquier
  // categoría (Nuevo / Ampliación / Remodelación / Relocación / custom).
  // Reglas: mob=mobiliario; tec=tecnología; mkt=marketing/publicidad;
  //         inv=inventario (no depreciable); el resto va a "Habilitación".
  const rows = r.inv.rows;
  const sumBy = (pred: (id: string, n: string) => boolean) =>
    rows.filter((x) => pred(x.id, x.nombre || "")).reduce((a, x) => a + x.monto, 0);
  const invMob = sumBy((id, n) => /^mob/i.test(id) || /mobil/i.test(n));
  const invTec = sumBy((id, n) => /^tec/i.test(id) || /tecno/i.test(n));
  const invMkt = sumBy((id, n) => /^mkt/i.test(id) || /market|publicid/i.test(n));
  const invInv = sumBy((id, n) => id === "inv" || /inventar/i.test(n));
  // "Habilitación" = todo lo físico que no sea mob/tec/mkt
  //  incluye: obras, habilitación, traslado/mudanza, adecuaciones, etc.
  const invHab = rows
    .filter((x) => {
      const id = x.id; const n = x.nombre || "";
      return id !== "gar" && !(/^mob/i.test(id) || /mobil/i.test(n)) &&
             !(/^tec/i.test(id) || /tecno/i.test(n)) &&
             !(/^mkt/i.test(id) || /market|publicid/i.test(n)) &&
             !(id === "inv" || /inventar/i.test(n));
    })
    .reduce((a, x) => a + x.monto, 0);

  // Actualizamos las etiquetas de la planilla para reflejar la categoría real
  datos.getCell("C23").value = `Obras / Habilitación (${inputs.categoria})`;
  datos.getCell("C24").value = "Mobiliario AF";
  datos.getCell("C25").value = "Inventario";
  datos.getCell("C26").value = "Tecnología";
  datos.getCell("C27").value = "Marketing / Publicidad";

  // Montos en MM CLP (la planilla los convierte × 1 000 000 en col E)
  datos.getCell("B23").value = +invHab.toFixed(2);
  datos.getCell("B24").value = +invMob.toFixed(2);
  datos.getCell("B25").value = +invInv.toFixed(2);
  datos.getCell("B26").value = +invTec.toFixed(2);
  datos.getCell("B27").value = +invMkt.toFixed(2);

  // ── Depreciación ────────────────────────────────────────────────────────────
  // La plantilla original usa SUM(E23:E27)/5 (incluye inventario, hardcodeado).
  // Sobreescribimos N35 con una fórmula que:
  //   - Excluye E25 (inventario, no depreciable)
  //   - Usa el n° de años de depreciación del proyecto (deprAnos)
  const deprAnos = inputs.deprAnos || 1;
  // OJO: ExcelJS antepone el "=" al escribir { formula }. Si el string ya lo
  // trae, la celda queda con "==" y Excel no puede evaluarla.
  const deprFormula = `-((Datos!E23+Datos!E24+Datos!E26+Datos!E27)/1000000)/${deprAnos}`;
  // N35 lleva el cálculo; O35..R35 encadenan al año anterior (igual que la
  // planilla de referencia), así queda un solo punto de edición.
  res.getCell("N35").value = { formula: deprFormula } as ExcelJS.CellFormulaValue;
  ([["O", "N"], ["P", "O"], ["Q", "P"], ["R", "Q"]] as const).forEach(([col, prev]) => {
    res.getCell(`${col}35`).value = { formula: `${prev}35` } as ExcelJS.CellFormulaValue;
  });

  // ── Supuestos: UF base + crecimiento anual por año del proyecto ────────────
  sup.getCell("B3").value = inputs.ufBase || 0;
  const ufCols = ["C", "D", "E", "F", "G"]; // años 2..6
  ufCols.forEach((col, i) => {
    const prev = i === 0 ? "B3" : `${ufCols[i - 1]}3`;
    const factor = +(1 + (inputs.ufRates[i] ?? 0) / 100).toFixed(6);
    sup.getCell(`${col}3`).value = { formula: `${prev}*${factor}` } as ExcelJS.CellFormulaValue;
    // Fila 4: variación de la UF de cada año — la usan las fórmulas de
    // "Gastos Personal" (fila 17 del Resumen) para reajustar el sueldo base.
    sup.getCell(`${col}4`).value = { formula: `(${col}3-${prev})/${col}3` } as ExcelJS.CellFormulaValue;
  });

  // ── Resumen business case ───────────────────────────────────────────────────
  const cols = ["N", "O", "P", "Q", "R"]; // años 1..5

  // Ventas (MM CLP / mes) por año
  inputs.ventaMes.slice(0, 5).forEach((v, i) => { res.getCell(`${cols[i]}10`).value = v || 0; });

  // Márgenes (sin propagar: la planilla ya copia N14 a O..R)
  res.getCell("N14").value = (inputs.margenDir || 0) / 100;
  cols.forEach((c) => { res.getCell(`${c}14`).value = (inputs.margenDir || 0) / 100; }); // replicar a todos
  res.getCell("N15").value = -((inputs.otrosCostosDir || 0) / 100);
  cols.forEach((c) => { res.getCell(`${c}15`).value = -((inputs.otrosCostosDir || 0) / 100); });
  cols.forEach((c) => { res.getCell(`${c}16`).value = -((inputs.costosVar || 0) / 100); });
  cols.forEach((c) => { res.getCell(`${c}30`).value = -((inputs.tecPct || 0) / 100); }); // Tecnología %
  cols.forEach((c) => { res.getCell(`${c}31`).value = -((inputs.ocupPct || 0) / 100); }); // Ocupación %
  cols.forEach((c) => { res.getCell(`${c}38`).value = (inputs.taxRate || 0) / 100; });    // Impuesto %

  // ── Personal ────────────────────────────────────────────────────────────────
  // Se replica el modelo de la planilla de referencia (Business Case AP
  // Villarrica): B17 = costo MENSUAL de personal; el año 1 se prorratea por los
  // meses reales de operación (A17) y los años 2..5 son base × 12 reajustada por
  // la variación de UF del año anterior (Supuestos fila 4), sin acumular.
  // Quedan como fórmulas vivas para que la planilla recalcule si se edita B17.
  // costoPersonaMM viene en MM CLP/año → /12 para dejarlo mensual.
  const personalMensual = ((inputs.personalY1 || 0) * (inputs.costoPersonaMM || 0)) / 12;
  res.getCell("B17").value = +personalMensual.toFixed(4);
  res.getCell("E17").value = { formula: `-A17*B17` } as ExcelJS.CellFormulaValue;
  // año 2→Supuestos!C4, año 3→D4, año 4→E4, año 5→F4
  ([["F", "C"], ["G", "D"], ["H", "E"], ["I", "F"]] as const).forEach(([col, supCol]) => {
    res.getCell(`${col}17`).value = {
      formula: `-$B$17*12*(1+Supuestos!${supCol}4)`,
    } as ExcelJS.CellFormulaValue;
  });

  // ── Canon y gasto común del año 1 ───────────────────────────────────────────
  // Siguen el calendario de RENTA (inicio + gracia), que puede ser distinto al
  // de apertura. La plantilla los colgaba de B21/A17 (meses de operación y de
  // personal), lo que los desalineaba con la app cuando ambas fechas difieren.
  res.getCell("E22").value = {
    formula: `-((Datos!$E$17*Supuestos!C3)/1000000)*${r.mesesY1}`,
  } as ExcelJS.CellFormulaValue;
  res.getCell("E23").value = {
    formula: `-((Datos!$E$18*Supuestos!C$3)*${r.mesesY1})/1000000`,
  } as ExcelJS.CellFormulaValue;

  // ── Limpieza ────────────────────────────────────────────────────────────────
  // La plantilla arrastra anotaciones sueltas "Corregido" (columnas J y S) que
  // no aportan nada al informe final.
  res.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (typeof cell.value === "string" && cell.value.trim().toLowerCase() === "corregido") {
        cell.value = null;
      }
    });
  });

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
