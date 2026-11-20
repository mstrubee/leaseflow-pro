import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";
import type { AdminConfig, BCInputs, BCResult } from "./model";
import { defaultAdminConfig } from "./model";
import { fmtMM, fmtPct } from "./format";
import { buildResumenEjecutivoRows, buildPnlRows } from "./reportRows";
import { addNegocioCompletoSheet } from "./exportFullTermSheet";
import bcTemplateUrl from "@/assets/bc_template.xlsx?url";
import { getLogoUrls } from "@/hooks/useAppLogos";
import { companyKeyFromNames } from "@/lib/companyLogo";

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

interface ImgData {
  base64: string;
  w: number;
  h: number;
}

function loadImageAsDataURL(src: string): Promise<ImgData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0);
      resolve({ base64: canvas.toDataURL("image/png"), w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = reject;
    img.src = src;
  });
}

/** Calcula el tamaño para que la imagen entre en la caja manteniendo el aspect ratio. */
function fitContain(imgW: number, imgH: number, boxW: number, boxH: number) {
  const imgAspect = imgW / imgH;
  const boxAspect = boxW / boxH;
  if (imgAspect > boxAspect) return { w: boxW, h: boxW / imgAspect };
  return { w: boxH * imgAspect, h: boxH };
}

function buildSubtitleForBC(inputs: BCInputs): string {
  // "-" en vez de "→": la fuente Helvetica base de jsPDF no tiene ese glyph
  // (sale como caracteres basura). El PPT del Informe Directorio sí usa "→"
  // porque PowerPoint no tiene esa limitación — ver buildSubtitle en
  // InformeDirectorioReport.tsx.
  const isExpress = inputs.formato === "Express";
  return `Nuevo Local ${inputs.nombre}${isExpress ? " - Formato Express" : ""}`;
}

export async function exportBusinessCasePDF(inputs: BCInputs, r: BCResult) {
  const doc = new jsPDF({ orientation: "landscape", unit: "in", format: [10, 5.625] });

  doc.setFillColor(PAGE_BG);
  doc.rect(0, 0, 10, 5.625, "F");

  // Logo de la empresa (Autoplanet/Agroplanet/Grupo Planet) arriba a la
  // derecha -- mismo formato "estándar de directorio" que usa el PPT del
  // Informe Directorio y el resto de los export de la app.
  try {
    const logos = await getLogoUrls();
    const companyKey = companyKeyFromNames([inputs.tipo]) ?? "autoplanet";
    const logoUrl = companyKey === "agroplanet" ? logos.agroplanet
      : companyKey === "grupo_planet" ? logos.grupoPlanet
      : logos.autoplanet;
    const logoImg = await loadImageAsDataURL(logoUrl);
    const fit = fitContain(logoImg.w, logoImg.h, 1.6, 0.5);
    doc.addImage(logoImg.base64, "PNG", 9.6 - fit.w, 0.25 + (0.5 - fit.h) / 2, fit.w, fit.h);
  } catch {
    // Sin logo si falla la carga -- no bloquea el export.
  }

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
  // Año calendario de la columna "Año 1" = año de inicio de renta (inicio + gracia),
  // el mismo que usan las hojas del Excel (ver anoRenta en computeBC).
  const startYear = r.anoRenta || new Date().getFullYear();
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
export async function exportBusinessCaseExcel(inputs: BCInputs, r: BCResult, config: AdminConfig = defaultAdminConfig) {
  const buf = await fetch(bcTemplateUrl).then((res) => res.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);

  const datos = wb.getWorksheet("Datos");
  const sup = wb.getWorksheet("Supuestos");
  const res = wb.getWorksheet("Resumen business case");
  if (!datos || !sup || !res) {
    // Fallback defensivo: si la plantilla cambió, descargar igual lo que haya
    // — la pestaña "Negocio Completo" no depende de la plantilla, así que se
    // agrega igual.
    addNegocioCompletoSheet(wb, inputs, config);
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
  const deprFisicaMM = "((Datos!E23+Datos!E24+Datos!E26+Datos!E27)/1000000)";
  // Un año por columna (N..R = años 1..5): fisica/deprAnos solo durante deprAnos
  // años y 0 después — igual que depreciationSchedule de la app. Antes N35 era
  // un monto fijo que O35..R35 repetían (depreciaba los 5 años aunque deprAnos < 5).
  // MAX(0,MIN(1,deprAnos-(k-1))) = fracción del año k que aún se deprecia.
  (["N", "O", "P", "Q", "R"] as const).forEach((col, k) => {
    res.getCell(`${col}35`).value = {
      formula: `-${deprFisicaMM}/${deprAnos}*MAX(0,MIN(1,${deprAnos}-${k}))`,
    } as ExcelJS.CellFormulaValue;
  });

  // ── Supuestos: UF base + crecimiento anual por año del proyecto ────────────
  // Fecha y años de la fila de UF: la plantilla traía 25-09-2025 / 2025..2030
  // fijos, que quedaban desfasados respecto de la UF base inyectada.
  const ufDate = new Date();
  sup.getCell("B1").value = ufDate;
  ["B", "C", "D", "E", "F", "G"].forEach((col, i) => { sup.getCell(`${col}2`).value = ufDate.getFullYear() + i; });
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

  // ── Ventas / ingresos: inyectamos los de la app ───────────────────────────
  // La app valoriza cada año calendario según el "año de vida" del local (la
  // tasa mensual de maduración cambia a mitad de año si el local no abre el 1
  // de enero), aplica el factor del escenario (opt ×1.10 / cons ×0.85) y usa
  // los meses reales de operación de CADA año. La plantilla en cambio asumía
  // ventaMes × 12 por año calendario (y año 5 = año 4 × 1.05), así que los
  // ingresos —y todo lo que cuelga de ellos— no coincidían con la pantalla.
  // Se escriben los ingresos del año en CLP (fila 9) y, como referencia, la
  // venta mensual promedio efectiva (fila 10 → "Venta / mes" de la fila 9 del
  // Resumen). r.ingresosTramos[i] trae los meses de operación de ese año.
  cols.forEach((c, i) => {
    const mesesOper = (r.ingresosTramos[i + 1] || []).reduce((a, t) => a + t.meses, 0);
    const ingresoMM = r.ingresos[i + 1] ?? 0;
    res.getCell(`${c}10`).value = mesesOper > 0 ? +(ingresoMM / mesesOper).toFixed(4) : 0;
    res.getCell(`${c}9`).value = Math.round(ingresoMM * 1e6);
  });

  // Márgenes (sin propagar: la planilla ya copia N14 a O..R)
  res.getCell("N14").value = (inputs.margenDir || 0) / 100;
  cols.forEach((c) => { res.getCell(`${c}14`).value = (inputs.margenDir || 0) / 100; }); // replicar a todos
  res.getCell("N15").value = -((inputs.otrosCostosDir || 0) / 100);
  cols.forEach((c) => { res.getCell(`${c}15`).value = -((inputs.otrosCostosDir || 0) / 100); });
  cols.forEach((c) => { res.getCell(`${c}16`).value = -((inputs.costosVar || 0) / 100); });
  cols.forEach((c) => { res.getCell(`${c}30`).value = -((inputs.tecPct || 0) / 100); }); // Tecnología %
  // Ocupación: monto fijo (no % de ventas) → se inyectan los valores de la app en E21..I21
  // y la fila 31 queda como el % efectivo informativo (ocupación ÷ ingresos del año).
  (["E", "F", "G", "H", "I"] as const).forEach((col, i) => {
    res.getCell(`${col}21`).value = +(r.ocupacion[i + 1] ?? 0).toFixed(4);
    res.getCell(`${cols[i]}31`).value = r.ingresos[i + 1] ? +(r.ocupacion[i + 1] / r.ingresos[i + 1]).toFixed(6) : 0;
  });
  cols.forEach((c) => { res.getCell(`${c}38`).value = (inputs.taxRate || 0) / 100; });    // Impuesto %

  // ── Personal ────────────────────────────────────────────────────────────────
  // B17 muestra la DOTACIÓN (n° de trabajadores) tal como se ingresó en el
  // Business Case; D17 es una celda de apoyo con el costo por persona (MM
  // CLP/mes) para que las fórmulas de costo (en MM CLP) sigan siendo válidas.
  // El año 1 se prorratea por los meses reales de operación (A17) y los años
  // 2..5 son dotación × costo × 12 reajustado por la variación de UF del año
  // anterior (Supuestos fila 4), sin acumular año contra año (mismo modelo que
  // computeBC en model.ts). costoPersonaMM viene en MM CLP/año → /12 = mensual.
  // A17 (meses de personal del año 1) = B21+1 en la plantilla, sin tope; la app
  // lo limita a 12 (mesesPersonal). Se escribe el valor de la app.
  res.getCell("A17").value = r.mesesPersonal;
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

  // ── Canon y gasto común, años 1..5: inyectamos los valores de la app ───────
  // Siguen el calendario de RENTA (inicio + gracia), que puede ser distinto al
  // de apertura, y respetan los tramos de arriendo escalonado del contrato
  // (resolveCanonTiers) y la UF promedio de cada año. Las fórmulas de la
  // plantilla (filas 22/23) usaban la UF de otro año, meses propios (B21/A17)
  // y escalones fijos (+1.05 / +1.1 UF) que no dependen del contrato.
  // Ya vienen en MM CLP y negativos (r.*[0] = año 0 = 0).
  // La plantilla no tiene fila de Fondo de Promoción (la app lo suma a los
  // GAVs): se agrupa con Gasto Común para que GAVs/EBITDA cuadren con la app.
  const hayFondoProm = r.fondoPromocion.some((x) => Math.abs(x) > 0);
  if (hayFondoProm) res.getCell("C23").value = "Gasto común + Fondo Promoción";
  (["E", "F", "G", "H", "I"] as const).forEach((col, i) => {
    res.getCell(`${col}22`).value = +(r.canonArr[i + 1] ?? 0).toFixed(4);
    res.getCell(`${col}23`).value = +((r.gastoComun[i + 1] ?? 0) + (r.fondoPromocion[i + 1] ?? 0)).toFixed(4);
  });

  // Gastos Generales: la plantilla usaba -0.8 MM/mes fijo; la app lo calcula
  // como % de ingresos (gralPct).
  const gralPct = (inputs.gralPct || 0) / 100;
  (["E", "F", "G", "H", "I"] as const).forEach((col) => {
    res.getCell(`${col}19`).value = { formula: `-ABS(${col}$10)*${gralPct}` } as ExcelJS.CellFormulaValue;
  });

  // Garantía: la plantilla siempre suma 1 mes de canon al capex (Datos!E28 =
  // E17). En la app solo existe en las categorías con la línea "gar" (Nuevo /
  // Relocación) y puede tener override. Se expresa en UF para que Capex (D36 =
  // E28 × UF base) calce con r.inv.
  const garRow = r.inv.rows.find((x) => x.id === "gar");
  datos.getCell("E28").value = garRow ? +((garRow.monto * 1e6) / (inputs.ufBase || 1)).toFixed(4) : 0;

  // Inventario (capital de trabajo): la plantilla traía 100 MM fijos en N22.
  res.getCell("N22").value = Math.round(r.inv.kt * 1e6);

  // VAN: la app deja el flujo del año 0 sin descontar (t = 0) y descuenta el
  // año n a (1+r)^n. NPV() de Excel descuenta el primer valor un período; se
  // suma D37 aparte.
  datos.getCell("J11").value = {
    formula: "'Resumen business case'!D37+NPV(E30,'Resumen business case'!E37:I37)",
  } as ExcelJS.CellFormulaValue;

  // ── Años calendario (fila 8) ─────────────────────────────────────────────
  // La plantilla trae años fijos (2025-2030). Los reemplazamos por los años
  // reales de cada columna: "Año 1" = año en que parte el pago de canon
  // (inicio + gracia, r.anoRenta), el mismo calendario sobre el que computeBC
  // indexa los años 1..5. Antes se rotulaba con el año de APERTURA, que no
  // coincide con la columna cuando el local abre en un año distinto al del
  // inicio de renta (esa columna quedaba con el año equivocado).
  // La columna "Año 0" (pre-apertura, sin ventas) se deja en blanco.
  const anoRenta = r.anoRenta || new Date(inputs.inicio || new Date().toISOString().slice(0, 10) + "T00:00:00").getFullYear();
  res.getCell("D8").value = null;
  res.getCell("M8").value = null;
  (["E", "F", "G", "H", "I"] as const).forEach((col, i) => { res.getCell(`${col}8`).value = anoRenta + i; });
  (["N", "O", "P", "Q", "R"] as const).forEach((col, i) => { res.getCell(`${col}8`).value = anoRenta + i; });

  // Fila 34 es el mismo encabezado "Año" que la fila 8, para el bloque de
  // "Análisis Financiero" (depreciación, fila 35 y siguientes) — la plantilla
  // también la trae fija en 2025-2030 y nunca se actualizaba.
  res.getCell("M34").value = null;
  (["N", "O", "P", "Q", "R"] as const).forEach((col, i) => { res.getCell(`${col}34`).value = anoRenta + i; });

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

  // Pestaña nueva con el negocio a toda la duración del contrato — no toca
  // las hojas de la plantilla (Datos/Supuestos/Resumen business case, que
  // siguen siendo la vista oficial a 5 años).
  addNegocioCompletoSheet(wb, inputs, config);

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
