// ============================================================
// Business Case Financiero — pestaña "Negocio Completo" del Excel exportado.
// A diferencia de las hojas "Datos"/"Supuestos"/"Resumen business case" (que
// vienen de una plantilla fija a 5 años, bc_template.xlsx), esta pestaña se
// arma desde cero acá mismo porque el largo depende del contrato (puede ser
// cualquier cantidad de años) — una plantilla de columnas fijas no sirve.
//
// Todo lo que puede expresarse como fórmula lo es (UF, ventas desde el año 6,
// márgenes, EBITDA, impuestos, flujo, TIR/VAN con IRR()/NPV() nativos de
// Excel) y queda enlazado a las celdas de supuestos de arriba. Dos filas
// quedan como VALORES calculados (no fórmulas) porque su lógica de origen
// (maduración de ventas mes a mes según fecha de apertura, y el
// escalonamiento de renta con sus propios tramos y fechas) vive en la app,
// no tiene una fórmula genérica corta en Excel — estas dos filas siguen
// siendo editables a mano para explorar variantes, pero no se recalculan
// solas si se edita el escalonamiento en la app y se vuelve a exportar (hay
// que exportar de nuevo). Quedan marcadas explícitamente en la hoja.
// ============================================================
import ExcelJS from "exceljs";
import { computeFullTermProjection } from "./fullTermProjection";
import type { AdminConfig, BCInputs } from "./model";

const SECTION_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
const INPUT_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFBE4EA" } };

function colLetter(n: number): string {
  let s = "";
  let x = n;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

/**
 * Agrega la pestaña "Negocio Completo" al workbook ya cargado (no toca las
 * hojas existentes). Columna B = Año 0 (pre-apertura, solo inversión);
 * columnas C en adelante = años 1..totalYears del contrato.
 */
export function addNegocioCompletoSheet(wb: ExcelJS.Workbook, inputs: BCInputs, config: AdminConfig): void {
  const full = computeFullTermProjection(inputs, config);
  const totalYears = full.totalYears;
  const superficie = inputs.superficie || 0;
  const ufBase = inputs.ufBase || 39485.65;
  const sf = inputs.scenario === "opt" ? 1.1 : inputs.scenario === "cons" ? 0.85 : 1.0;
  const fondoPromPct = (inputs.fondoPromocionPct || 0) / 100;
  const fisica = full.fisica;

  const YEAR0_COL = 2; // B
  const firstYearCol = 3; // C = año 1
  const lastYearCol = firstYearCol + totalYears - 1;
  const yc = (year: number) => colLetter(firstYearCol + year - 1); // year 1..N -> column letter
  const y0 = colLetter(YEAR0_COL);

  const existing = wb.getWorksheet("Negocio Completo");
  if (existing) wb.removeWorksheet(existing.id);
  const ws = wb.addWorksheet("Negocio Completo", { views: [{ state: "frozen", xSplit: 1, ySplit: 4 }] });
  ws.getColumn(1).width = 30;
  for (let c = YEAR0_COL; c <= lastYearCol; c++) ws.getColumn(c).width = 12;

  let r = 1;
  const setLabel = (row: number, text: string) => { ws.getCell(row, 1).value = text; };
  const sectionHeader = (row: number, text: string) => {
    setLabel(row, text);
    for (let c = 1; c <= lastYearCol; c++) {
      const cell = ws.getCell(row, c);
      cell.fill = SECTION_FILL;
      if (c === 1) cell.font = { bold: true };
    }
  };
  const setInput = (row: number, col: number, value: number | string, numFmt?: string) => {
    const cell = ws.getCell(row, col);
    cell.value = value;
    cell.fill = INPUT_FILL;
    if (numFmt) cell.numFmt = numFmt;
  };
  const setFormula = (row: number, col: number, formula: string, numFmt?: string) => {
    const cell = ws.getCell(row, col);
    cell.value = { formula } as ExcelJS.CellFormulaValue;
    if (numFmt) cell.numFmt = numFmt;
  };

  // ── Título ──────────────────────────────────────────────────────────────
  ws.getCell(r, 1).value = `Negocio Completo — ${inputs.nombre || "Proyecto"} (${totalYears} años)`;
  ws.getCell(r, 1).font = { bold: true, size: 13 };
  ws.mergeCells(r, 1, r, lastYearCol);
  r += 2;

  // ── Encabezados de año ──────────────────────────────────────────────────
  const rowAno = r; setLabel(rowAno, "Año"); ws.getCell(rowAno, YEAR0_COL).value = 0;
  for (let y = 1; y <= totalYears; y++) ws.getCell(rowAno, firstYearCol + y - 1).value = y;
  for (let c = 1; c <= lastYearCol; c++) ws.getCell(rowAno, c).font = { bold: true };
  r++;
  const anoApertura = new Date(inputs.inicio ? `${inputs.inicio}T00:00:00` : Date.now()).getFullYear();
  const rowAnoCal = r; setLabel(rowAnoCal, "Año calendario");
  for (let y = 1; y <= totalYears; y++) ws.getCell(rowAnoCal, firstYearCol + y - 1).value = anoApertura + y - 1;
  r += 2;

  // ── Nota ────────────────────────────────────────────────────────────────
  ws.getCell(r, 1).value =
    "Filas resaltadas = supuestos editables. \"Venta mensual\" (años 1-5) y \"Canon UF/m²\" reflejan la maduración de ventas y el escalonamiento de renta cargados en la app al momento de exportar — no se recalculan solas si se editan ahí; el resto de la hoja sí es 100% fórmula.";
  ws.getCell(r, 1).font = { italic: true, size: 9, color: { argb: "FF666666" } };
  ws.mergeCells(r, 1, r, lastYearCol);
  ws.getRow(r).height = 26;
  r += 2;

  // ── Supuestos: UF ───────────────────────────────────────────────────────
  sectionHeader(r, "Supuestos — UF"); r++;
  const rowUfBase = r; setLabel(r, "UF base (CLP)"); setInput(r, YEAR0_COL, ufBase, "#,##0"); r++;
  const rowCrecUf = r; setLabel(r, "Crec. UF anual %");
  for (let y = 1; y <= totalYears; y++) {
    const c = firstYearCol + y - 1;
    if (y <= 5) setInput(r, c, (inputs.ufRates[y - 1] ?? 0) / 100, "0.0%");
    else setFormula(r, c, `${colLetter(c - 1)}${r}`, "0.0%");
  }
  r++;
  const rowUfFin = r; setLabel(r, "UF fin de año (CLP)");
  for (let y = 1; y <= totalYears; y++) {
    const c = firstYearCol + y - 1;
    const prev = y === 1 ? `$${y0}$${rowUfBase}` : `${colLetter(c - 1)}${r}`;
    setFormula(r, c, `${prev}*(1+${colLetter(c)}${rowCrecUf})`, "#,##0");
  }
  r++;
  const rowUfProm = r; setLabel(r, "UF promedio del año (CLP)");
  for (let y = 1; y <= totalYears; y++) {
    const c = firstYearCol + y - 1;
    const prev = y === 1 ? `$${y0}$${rowUfBase}` : `${colLetter(c - 1)}${rowUfFin}`;
    setFormula(r, c, `${prev}*SQRT(1+${colLetter(c)}${rowCrecUf})`, "#,##0");
  }
  r += 2;

  // ── Supuestos: Ventas ───────────────────────────────────────────────────
  sectionHeader(r, "Supuestos — Ventas"); r++;
  const rowCrecVenta = r; setLabel(r, "Crec. Ventas % (maduración)");
  for (let y = 1; y <= totalYears; y++) {
    const c = firstYearCol + y - 1;
    if (y <= 5) setInput(r, c, (inputs.ventaGrowthPct[y - 1] ?? 0) / 100, "0.0%");
    else setFormula(r, c, `${colLetter(c - 1)}${r}`, "0.0%");
  }
  r++;
  const rowVentaMes = r; setLabel(r, "Venta mensual (MM/mes)");
  for (let y = 1; y <= totalYears; y++) {
    const c = firstYearCol + y - 1;
    if (y <= 5) setInput(r, c, full.years[y - 1].ventaMensualPromedio, "#,##0.0");
    else setFormula(r, c, `${colLetter(c - 1)}${r}*(1+${colLetter(c)}${rowCrecVenta})`, "#,##0.0");
  }
  r++;
  const rowMesesVenta = r; setLabel(r, "Meses de venta");
  for (let y = 1; y <= totalYears; y++) setInput(r, firstYearCol + y - 1, full.years[y - 1].mesesOperacion, "0.0");
  r++;
  const rowEscenario = r; setLabel(r, "Factor de escenario"); setInput(r, YEAR0_COL, sf, "0.00"); r++;
  const rowVentas = r; setLabel(r, "Ventas anuales (MM CLP)"); ws.getRow(r).font = { bold: true };
  for (let y = 1; y <= totalYears; y++) {
    const c = firstYearCol + y - 1;
    setFormula(r, c, `${colLetter(c)}${rowVentaMes}*${colLetter(c)}${rowMesesVenta}*$${y0}$${rowEscenario}`, "#,##0");
  }
  r += 2;

  // ── Supuestos: Renta ────────────────────────────────────────────────────
  sectionHeader(r, "Supuestos — Renta"); r++;
  const rowCanonUfM2 = r; setLabel(r, "Canon UF/m² del año");
  for (let y = 1; y <= totalYears; y++) setInput(r, firstYearCol + y - 1, full.years[y - 1].canonUfM2, "0.000");
  r++;
  const rowSuperficie = r; setLabel(r, "Superficie (m²)"); setInput(r, YEAR0_COL, superficie, "#,##0"); r++;
  const rowGastoComunUf = r; setLabel(r, "Gasto Común (UF/m²)"); setInput(r, YEAR0_COL, inputs.gastoComunUf || 0, "0.000"); r++;
  const rowFondoPromPct = r; setLabel(r, "Fondo Promoción %"); setInput(r, YEAR0_COL, fondoPromPct, "0.0%"); r++;
  const rowMesesRenta = r; setLabel(r, "Meses de renta");
  for (let y = 1; y <= totalYears; y++) setInput(r, firstYearCol + y - 1, full.years[y - 1].mesesRenta, "0.0");
  r++;
  const rowCanon = r; setLabel(r, "Canon Arriendo (MM CLP)");
  for (let y = 1; y <= totalYears; y++) {
    const c = colLetter(firstYearCol + y - 1);
    setFormula(r, firstYearCol + y - 1, `-${c}${rowCanonUfM2}*$${y0}$${rowSuperficie}*${c}${rowMesesRenta}*${c}${rowUfProm}/1000000`, "#,##0.00");
  }
  r++;
  const rowFondoProm = r; setLabel(r, "Fondo Promoción (MM CLP)");
  for (let y = 1; y <= totalYears; y++) {
    const c = colLetter(firstYearCol + y - 1);
    setFormula(r, firstYearCol + y - 1, `${c}${rowCanon}*$${y0}$${rowFondoPromPct}`, "#,##0.00");
  }
  r++;
  const rowGastoComun = r; setLabel(r, "Gasto Común (MM CLP)");
  for (let y = 1; y <= totalYears; y++) {
    const c = colLetter(firstYearCol + y - 1);
    setFormula(r, firstYearCol + y - 1, `-$${y0}$${rowGastoComunUf}*$${y0}$${rowSuperficie}*${c}${rowMesesRenta}*${c}${rowUfProm}/1000000`, "#,##0.00");
  }
  r += 2;

  // ── Supuestos: márgenes y costos ────────────────────────────────────────
  sectionHeader(r, "Supuestos — Márgenes y costos"); r++;
  const rowMargenDir = r; setLabel(r, "Margen directo %"); setInput(r, YEAR0_COL, (inputs.margenDir || 0) / 100, "0.0%"); r++;
  const rowOtrosCostosDir = r; setLabel(r, "Otros costos dir. %"); setInput(r, YEAR0_COL, (inputs.otrosCostosDir || 0) / 100, "0.00%"); r++;
  const rowCostosVar = r; setLabel(r, "Costos variables %"); setInput(r, YEAR0_COL, (inputs.costosVar || 0) / 100, "0.00%"); r++;
  const rowGralPct = r; setLabel(r, "Gastos generales %"); setInput(r, YEAR0_COL, (inputs.gralPct || 0) / 100, "0.00%"); r++;
  const rowTecPct = r; setLabel(r, "Tecnología %"); setInput(r, YEAR0_COL, (inputs.tecPct || 0) / 100, "0.00%"); r++;
  const rowOcupPct = r; setLabel(r, "Ocupación %"); setInput(r, YEAR0_COL, (inputs.ocupPct || 0) / 100, "0.00%"); r += 2;

  // ── Supuestos: personal ─────────────────────────────────────────────────
  sectionHeader(r, "Supuestos — Personal"); r++;
  const rowDotacion = r; setLabel(r, "Dotación año 1 (n° personas)"); setInput(r, YEAR0_COL, inputs.personalY1 || 0, "0.0"); r++;
  const rowCostoPersona = r; setLabel(r, "Costo por persona (MM/mes)"); setInput(r, YEAR0_COL, (inputs.costoPersonaMM || 0) / 12, "0.000"); r++;
  const rowMesesPersonal = r; setLabel(r, "Meses de personal año 1"); setInput(r, YEAR0_COL, Math.min(12, full.years[0].mesesOperacion + 1), "0.0"); r += 2;

  // ── Supuestos: depreciación e impuestos ─────────────────────────────────
  sectionHeader(r, "Supuestos — Depreciación e impuestos"); r++;
  const rowFisica = r; setLabel(r, "CAPEX físico depreciable (MM)"); setInput(r, YEAR0_COL, fisica, "#,##0.0"); r++;
  const rowDeprAnos = r; setLabel(r, "Años de depreciación"); setInput(r, YEAR0_COL, inputs.deprAnos || 1, "0"); r++;
  const rowTaxRate = r; setLabel(r, "Tasa de impuesto %"); setInput(r, YEAR0_COL, (inputs.taxRate || 0) / 100, "0.0%"); r++;
  const rowWacc = r; setLabel(r, "Tasa de descuento (WACC) %"); setInput(r, YEAR0_COL, (inputs.waccRate || 0) / 100, "0.0%"); r++;
  const rowCapex = r; setLabel(r, "Inversión total (CAPEX, MM)"); setInput(r, YEAR0_COL, full.totalCapex, "#,##0.0"); r += 2;

  // ── P&L ─────────────────────────────────────────────────────────────────
  sectionHeader(r, "Estado de Resultados (MM CLP)"); r++;
  const rowCostoVentas = r; setLabel(r, "Costo de Ventas");
  for (let y = 1; y <= totalYears; y++) { const c = colLetter(firstYearCol + y - 1); setFormula(r, firstYearCol + y - 1, `-${c}${rowVentas}*(1-$${y0}$${rowMargenDir})`, "#,##0"); }
  r++;
  const rowOtrosCostos = r; setLabel(r, "Otros costos dir.");
  for (let y = 1; y <= totalYears; y++) { const c = colLetter(firstYearCol + y - 1); setFormula(r, firstYearCol + y - 1, `-${c}${rowVentas}*$${y0}$${rowOtrosCostosDir}`, "#,##0"); }
  r++;
  const rowCostosVarMM = r; setLabel(r, "Costos variables");
  for (let y = 1; y <= totalYears; y++) { const c = colLetter(firstYearCol + y - 1); setFormula(r, firstYearCol + y - 1, `-${c}${rowVentas}*$${y0}$${rowCostosVar}`, "#,##0"); }
  r++;
  const rowMargenCtrib = r; setLabel(r, "Margen Contribución"); ws.getRow(r).font = { bold: true };
  for (let y = 1; y <= totalYears; y++) { const c = colLetter(firstYearCol + y - 1); setFormula(r, firstYearCol + y - 1, `${c}${rowVentas}+${c}${rowCostoVentas}+${c}${rowOtrosCostos}+${c}${rowCostosVarMM}`, "#,##0"); }
  r++;
  const rowPersonal = r; setLabel(r, "Personal");
  for (let y = 1; y <= totalYears; y++) {
    const c = colLetter(firstYearCol + y - 1);
    if (y === 1) {
      setFormula(r, firstYearCol + y - 1, `-$${y0}$${rowDotacion}*$${y0}$${rowCostoPersona}*$${y0}$${rowMesesPersonal}`, "#,##0");
    } else {
      const cPrev = colLetter(firstYearCol + y - 2);
      const cPrevPrev = y === 2 ? `$${y0}$${rowUfBase}` : colLetter(firstYearCol + y - 3) + rowUfFin;
      setFormula(r, firstYearCol + y - 1, `-$${y0}$${rowDotacion}*$${y0}$${rowCostoPersona}*12*(1+(${cPrev}${rowUfFin}-${cPrevPrev})/${cPrev}${rowUfFin})`, "#,##0");
    }
  }
  r++;
  const rowGastosGral = r; setLabel(r, "Gastos Generales");
  for (let y = 1; y <= totalYears; y++) { const c = colLetter(firstYearCol + y - 1); setFormula(r, firstYearCol + y - 1, `-ABS(${c}${rowVentas})*$${y0}$${rowGralPct}`, "#,##0"); }
  r++;
  const rowTecnologia = r; setLabel(r, "Tecnología");
  for (let y = 1; y <= totalYears; y++) { const c = colLetter(firstYearCol + y - 1); setFormula(r, firstYearCol + y - 1, `-ABS(${c}${rowVentas})*$${y0}$${rowTecPct}`, "#,##0"); }
  r++;
  const rowOcupacion = r; setLabel(r, "Ocupación (sin canon)");
  for (let y = 1; y <= totalYears; y++) { const c = colLetter(firstYearCol + y - 1); setFormula(r, firstYearCol + y - 1, `-ABS(${c}${rowVentas})*$${y0}$${rowOcupPct}`, "#,##0"); }
  r++;
  const rowEbitda = r; setLabel(r, "EBITDA"); ws.getRow(r).font = { bold: true };
  for (let y = 1; y <= totalYears; y++) {
    const c = colLetter(firstYearCol + y - 1);
    setFormula(r, firstYearCol + y - 1, `${c}${rowMargenCtrib}+${c}${rowPersonal}+${c}${rowGastosGral}+${c}${rowTecnologia}+${c}${rowOcupacion}+${c}${rowCanon}+${c}${rowFondoProm}+${c}${rowGastoComun}`, "#,##0");
  }
  r++;
  const rowEbitdaPct = r; setLabel(r, "EBITDA % / Ventas"); ws.getRow(r).font = { italic: true };
  for (let y = 1; y <= totalYears; y++) { const c = colLetter(firstYearCol + y - 1); setFormula(r, firstYearCol + y - 1, `${c}${rowEbitda}/${c}${rowVentas}`, "0.0%"); }
  r++;
  const rowArriendoPct = r; setLabel(r, "Arriendo / Vta %"); ws.getRow(r).font = { italic: true };
  for (let y = 1; y <= totalYears; y++) {
    const c = colLetter(firstYearCol + y - 1);
    setFormula(r, firstYearCol + y - 1, `(ABS(${c}${rowCanon})+ABS(${c}${rowFondoProm})+ABS(${c}${rowGastoComun}))/${c}${rowVentas}`, "0.0%");
  }
  r++;
  const rowDeprec = r; setLabel(r, "Depreciación");
  for (let y = 1; y <= totalYears; y++) setFormula(r, firstYearCol + y - 1, `-$${y0}$${rowFisica}/$${y0}$${rowDeprAnos}`, "#,##0");
  r++;
  const rowEbit = r; setLabel(r, "EBIT"); ws.getRow(r).font = { bold: true };
  for (let y = 1; y <= totalYears; y++) { const c = colLetter(firstYearCol + y - 1); setFormula(r, firstYearCol + y - 1, `${c}${rowEbitda}+${c}${rowDeprec}`, "#,##0"); }
  r++;
  const rowImpuesto = r; setLabel(r, "Impuesto");
  for (let y = 1; y <= totalYears; y++) { const c = colLetter(firstYearCol + y - 1); setFormula(r, firstYearCol + y - 1, `-${c}${rowEbit}*$${y0}$${rowTaxRate}`, "#,##0"); }
  r++;
  const rowUdi = r; setLabel(r, "UDI"); ws.getRow(r).font = { bold: true };
  for (let y = 1; y <= totalYears; y++) { const c = colLetter(firstYearCol + y - 1); setFormula(r, firstYearCol + y - 1, `${c}${rowEbit}*(1-$${y0}$${rowTaxRate})`, "#,##0"); }
  r += 2;

  // ── Flujo y retorno ─────────────────────────────────────────────────────
  sectionHeader(r, "Flujo y Retorno (MM CLP)"); r++;
  const rowFlujo = r; setLabel(r, "Flujo Operativo"); ws.getRow(r).font = { bold: true };
  setFormula(r, YEAR0_COL, `-$${y0}$${rowCapex}`, "#,##0");
  for (let y = 1; y <= totalYears; y++) { const c = colLetter(firstYearCol + y - 1); setFormula(r, firstYearCol + y - 1, `${c}${rowUdi}-${c}${rowDeprec}`, "#,##0"); }
  r++;
  const rowFlujoAcum = r; setLabel(r, "Flujo Acumulado");
  setFormula(r, YEAR0_COL, `${y0}${rowFlujo}`, "#,##0");
  for (let y = 1; y <= totalYears; y++) {
    const c = colLetter(firstYearCol + y - 1);
    const prev = y === 1 ? `${y0}${rowFlujoAcum}` : `${colLetter(firstYearCol + y - 2)}${rowFlujoAcum}`;
    setFormula(r, firstYearCol + y - 1, `${prev}+${c}${rowFlujo}`, "#,##0");
  }
  r += 2;

  // ── KPIs (fórmulas nativas de Excel — IRR()/NPV() recalculan solas si se
  // edita cualquier supuesto de arriba) ────────────────────────────────────
  sectionHeader(r, `KPIs — ${totalYears} años`); r++;
  setLabel(r, "TIR"); setFormula(r, YEAR0_COL, `IRR(${y0}${rowFlujo}:${colLetter(lastYearCol)}${rowFlujo})`, "0.0%"); r++;
  setLabel(r, "VAN (MM CLP)"); setFormula(r, YEAR0_COL, `${y0}${rowFlujo}+NPV($${y0}$${rowWacc},${colLetter(firstYearCol)}${rowFlujo}:${colLetter(lastYearCol)}${rowFlujo})`, "#,##0"); r++;
  setLabel(r, "Inversión total (MM CLP)"); setFormula(r, YEAR0_COL, `-${y0}${rowFlujo}`, "#,##0");

  ws.eachRow((row) => { row.eachCell((cell) => { cell.border = { bottom: { style: "hair", color: { argb: "FFEEEEEE" } } }; }); });
}
