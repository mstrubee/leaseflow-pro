import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";
import type { BCInputs, BCResult } from "./model";
import { fmtMM, fmtPct } from "./format";
import { buildResumenEjecutivoRows, buildPnlRows } from "./reportRows";
import bcTemplateUrl from "@/assets/bc_template.xlsx?url";

// Mismos colores/layout que la lámina "Detalle Capex Plan Expansión" del
// Informe Directorio (ver InformeDirectorioPPT.ts) — este PDF reutiliza las
// mismas filas (reportRows.ts) para que ambos documentos digan exactamente
// lo mismo, solo que acá se descarga como PDF de una sola página en vez de
// una slide de PPT. 10×5.625in = mismo aspect ratio 16:9 que la slide.
const MAROON = "#C0003F";
const MAROON_LIGHT = "#FBE4EA";
const GRAY_HIGHLIGHT = "#D9D9D9";
const PAGE_BG = "#F2F2F2";
const KICKER_RED = "#C21D18";
const DARK = "#1A1A1A";
const MUTED = "#666666";
const BORDER = "#CCCCCC";
const WHITE = "#FFFFFF";

// Mismos 3 bullets que "Aspectos clave" del PPT (buildBullets en
// InformeDirectorioReport.tsx), salvo la cláusula de salida anticipada —
// depende de datos de aviso de término del contrato que este diálogo no
// carga (solo tiene inputs/result del Business Case).
function buildBulletsForBC(inputs: BCInputs, r: BCResult): string[] {
  // CAPEX sin inventario (capital de trabajo, no es CAPEX) — mismo criterio
  // que "CAPEX Est." en ContractsTable.tsx y buildBullets en
  // InformeDirectorioReport.tsx.
  const inventario = r.inv.rows.find((row) => row.id === "inv")?.monto || 0;
  const bullets: string[] = [`CAPEX ${fmtMM(r.totalCapex - inventario, 0)} mm$`];
  const ventasProyectadas = (r.ingresos[4] + r.ingresos[5]) / 2;
  bullets.push(`Ventas Proyectadas: ${fmtMM(ventasProyectadas, 0)} mm$`);
  if (inputs.durContratoAnios) {
    const years = Math.round(inputs.durContratoAnios);
    bullets.push(`Contrato ${years} Año${years === 1 ? "" : "s"}`);
  }
  return bullets;
}

function buildSubtitleForBC(inputs: BCInputs): string {
  // "-" en vez de "→": la fuente Helvetica base de jsPDF no tiene ese glyph
  // (sale como caracteres basura). El PPT del Informe Directorio sí usa "→"
  // porque PowerPoint no tiene esa limitación — ver buildSubtitle en
  // InformeDirectorioReport.tsx.
  const isExpress = inputs.formato === "Express";
  return `Nuevo Local ${inputs.nombre}${isExpress ? " - Formato Express" : ""}`;
}

export function exportBusinessCasePDF(inputs: BCInputs, r: BCResult) {
  const doc = new jsPDF({ orientation: "landscape", unit: "in", format: [10, 5.625] });

  doc.setFillColor(PAGE_BG);
  doc.rect(0, 0, 10, 5.625, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(KICKER_RED);
  doc.text("DETALLE CAPEX PLAN EXPANSIÓN", 0.4, 0.32);

  doc.setFontSize(16);
  doc.setTextColor(DARK);
  doc.text(buildSubtitleForBC(inputs), 0.4, 0.62);

  doc.setDrawColor(BORDER);
  doc.setLineWidth(0.007);
  doc.line(0.4, 0.87, 9.6, 0.87);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Local ${inputs.nombre}`, 0.4, 1.08);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Aspectos clave:", 0.4, 1.28);
  let bulletY = 1.45;
  buildBulletsForBC(inputs, r).forEach((b) => {
    doc.text(`•  ${b}`, 0.5, bulletY);
    bulletY += 0.17;
  });

  // Tabla izquierda: Resumen Ejecutivo NUEVO LOCAL
  const infoRows = buildResumenEjecutivoRows(inputs, r);
  autoTable(doc, {
    startY: 2.0,
    margin: { left: 0.4, right: 5.0, top: 0.1, bottom: 0.1 },
    tableWidth: 4.3,
    theme: "plain",
    styles: { font: "helvetica", fontSize: 5.5, cellPadding: { top: 0.014, right: 0.028, bottom: 0.014, left: 0.028 }, lineColor: BORDER, lineWidth: 0.0035 },
    columnStyles: { 0: { cellWidth: 2.55 }, 1: { cellWidth: 0.65 }, 2: { cellWidth: 1.1 } },
    head: [[{ content: "Resumen Ejecutivo NUEVO LOCAL", colSpan: 3, styles: { fillColor: MAROON, textColor: WHITE, fontStyle: "bold", halign: "left" } }]],
    body: infoRows.map((row) => {
      const fill = row.highlight ? MAROON_LIGHT : WHITE;
      const topBorder = row.divider ? 0.014 : 0.0035;
      return [
        { content: row.label, styles: { fillColor: fill, textColor: DARK, halign: "left" as const, lineWidth: { top: topBorder, right: 0.0035, bottom: 0.0035, left: 0.0035 } } },
        { content: row.unit, styles: { fillColor: fill, textColor: MUTED, halign: "left" as const, lineWidth: { top: topBorder, right: 0.0035, bottom: 0.0035, left: 0 } } },
        { content: row.value, styles: { fillColor: fill, textColor: DARK, halign: "right" as const, lineWidth: { top: topBorder, right: 0.0035, bottom: 0.0035, left: 0 } } },
      ];
    }),
  });

  // Tabla derecha: P&L completo
  const pnlRows = buildPnlRows(inputs, r);
  const startYear = new Date(inputs.inicio ? `${inputs.inicio}T00:00:00` : Date.now()).getFullYear();
  autoTable(doc, {
    startY: 0.95,
    margin: { left: 4.85, right: 0.4, top: 0.1, bottom: 0.1 },
    tableWidth: 4.75,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 5.5, cellPadding: { top: 0.014, right: 0.028, bottom: 0.014, left: 0.028 }, lineColor: BORDER, lineWidth: 0.0035 },
    columnStyles: { 0: { cellWidth: 1.75 }, 1: { cellWidth: 0.6 }, 2: { cellWidth: 0.6 }, 3: { cellWidth: 0.6 }, 4: { cellWidth: 0.6 }, 5: { cellWidth: 0.6 } },
    head: [[
      { content: "Año", styles: { fillColor: MAROON, textColor: WHITE, fontStyle: "bold", halign: "left" } },
      ...[1, 2, 3, 4, 5].map((n, i) => ({ content: `${n}\n${startYear + i}`, styles: { fillColor: MAROON, textColor: WHITE, fontStyle: "bold" as const, halign: "center" as const } })),
    ]],
    body: pnlRows.map((row) => {
      if (!row.label) return [{ content: "", colSpan: 6, styles: { fillColor: WHITE, minCellHeight: 0.05 } }];
      const fill = row.maroonHighlight ? MAROON : row.grayHighlight ? GRAY_HIGHLIGHT : WHITE;
      const textColor = row.maroonHighlight ? WHITE : DARK;
      const fontStyle = row.bold ? "bold" as const : "normal" as const;
      return [
        { content: row.label, styles: { fillColor: fill, textColor, fontStyle, halign: "left" as const } },
        ...row.values.map((v, i) => ({ content: i === 0 && row.col0 ? row.col0 : v, styles: { fillColor: fill, textColor, fontStyle, halign: "right" as const } })),
      ];
    }),
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
  // B18 es UF/m² (mismo criterio que B15/ufM2 para el canon); E18 = E14*B18 la
  // multiplica por la superficie. Antes se dividía gastoComunUf por superficie
  // ACÁ y la plantilla volvía a multiplicar por superficie en E18, así que un
  // gasto común de 0,05 UF/m² terminaba en 0,05/superficie ≈ 0 en vez de
  // multiplicarse — coincide con el síntoma reportado (B18 se veía en 0).
  datos.getCell("B18").value = inputs.gastoComunUf || 0;
  datos.getCell("E19").value = isoToDate(inputs.inicio);   // Inicio
  datos.getCell("E20").value = inputs.graciaMeses || 0;    // Gracia (meses)
  // E21 = inicio del pago de renta = E19 + E20 meses. La plantilla traía
  // "=E19+(31*E20)" — una aproximación a 31 días por mes que se corre de la
  // fecha real (por ej. 3 meses "de gracia" no son 93 días en todos los
  // casos). Se reemplaza por EDATE, que suma meses calendario de verdad y
  // coincide con dtCanonIso/mesesY1 de model.ts (misma fuente de la verdad).
  datos.getCell("E21").value = { formula: "EDATE(E19,E20)" } as ExcelJS.CellFormulaValue;
  // B21 = meses de OPERACIÓN del año 1 (desde la apertura). La plantilla lo
  // derivaba de =(12-MONTH(E19))-1, que ignora tanto la gracia como la fecha de
  // apertura; se escribe el valor que ya calcula la app para que planilla y
  // pantalla coincidan. De B21 cuelgan los ingresos del año 1 (N9) y, vía
  // A17 = B21+1, los meses de personal (que parte un mes antes de abrir).
  datos.getCell("B21").value = r.mesesOperacion;
  datos.getCell("E29").value = 0;                          // Cobro por instalaciones
  datos.getCell("E30").value = (inputs.waccRate || 0) / 100; // Tasa de descuento
  // Notas sueltas de la plantilla de referencia (gracia / cláusula de salida
  // de ESE contrato en particular) que no aportan al modelo genérico.
  datos.getCell("F15").value = null;
  datos.getCell("F16").value = null;

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
  // B17 muestra la DOTACIÓN (n° de trabajadores) tal como se ingresó en el
  // Business Case; D17 es una celda de apoyo con el costo por persona (MM
  // CLP/mes) para que las fórmulas de costo (en MM CLP) sigan siendo válidas.
  // El año 1 se prorratea por los meses reales de operación (A17) y los años
  // 2..5 son dotación × costo × 12 reajustado por la variación de UF del año
  // anterior (Supuestos fila 4), sin acumular año contra año (mismo modelo que
  // computeBC en model.ts). costoPersonaMM viene en MM CLP/año → /12 = mensual.
  const costoPersonaMensual = (inputs.costoPersonaMM || 0) / 12;
  res.getCell("B17").value = +(inputs.personalY1 || 0).toFixed(2);
  res.getCell("D17").value = +costoPersonaMensual.toFixed(4);
  res.getCell("E17").value = { formula: `-A17*B17*D17` } as ExcelJS.CellFormulaValue;
  // año 2→Supuestos!C4, año 3→D4, año 4→E4, año 5→F4
  ([["F", "C"], ["G", "D"], ["H", "E"], ["I", "F"]] as const).forEach(([col, supCol]) => {
    res.getCell(`${col}17`).value = {
      formula: `-$B$17*$D$17*12*(1+Supuestos!${supCol}4)`,
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

  // ── Años calendario (fila 8) ─────────────────────────────────────────────
  // La plantilla trae años fijos (2025-2030). Los reemplazamos por los años
  // reales, contados desde el primer año en que efectivamente se vende (año
  // de apertura al público, mismo cálculo que "mesesOperacion" en model.ts).
  // La columna "Año 0" (pre-apertura, sin ventas) se deja en blanco: no hay un
  // año de venta real que mostrar ahí.
  const anoApertura = r.anoApertura || new Date(inputs.inicio || new Date().toISOString().slice(0, 10) + "T00:00:00").getFullYear();
  res.getCell("D8").value = null;
  res.getCell("M8").value = null;
  (["E", "F", "G", "H", "I"] as const).forEach((col, i) => { res.getCell(`${col}8`).value = anoApertura + i; });
  (["N", "O", "P", "Q", "R"] as const).forEach((col, i) => { res.getCell(`${col}8`).value = anoApertura + i; });

  // Fila 34 es el mismo encabezado "Año" que la fila 8, para el bloque de
  // "Análisis Financiero" (depreciación, fila 35 y siguientes) — la plantilla
  // también la trae fija en 2025-2030 y nunca se actualizaba.
  res.getCell("M34").value = null;
  (["N", "O", "P", "Q", "R"] as const).forEach((col, i) => { res.getCell(`${col}34`).value = anoApertura + i; });

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

  // Mini-encabezados "Año" redundantes de un bloque auxiliar (filas 12, 19, 26)
  // que ninguna fórmula usa — solo repetían los años fijos de la plantilla.
  [12, 19, 26].forEach((rowNum) => {
    res.getCell(`L${rowNum}`).value = null;
    (["M", "N", "O", "P", "Q", "R"] as const).forEach((col) => { res.getCell(`${col}${rowNum}`).value = null; });
  });
  res.getCell("D24").value = null;
  res.getCell("M24").value = null;
  // K42 = (Datos!E29*Supuestos!B3)+(Datos!E28*Supuestos!B3). Datos!E29 (cobro
  // por instalaciones) ya se deja en 0, pero Datos!E28 es "=E17" (garantía del
  // contrato de referencia original) y no una entrada de este Business
  // Case genérico, así que K42 mostraba un monto en UF de esa garantía
  // multiplicado por la UF base — un valor "pegado" que no corresponde a nada
  // que el usuario haya ingresado acá.
  res.getCell("K42").value = null;

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
