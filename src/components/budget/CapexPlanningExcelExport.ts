import { format, parseISO } from "date-fns";
import type { AvanceTotalRow, StraddlingContractRow, MissingDataContractRow } from "./CapexBudgetPlanningDialog";
import type { OpexExportRow } from "./CapexNewLocationOpexSection";

// Descarga Excel de "Planificar Presupuesto {año}" (/capex): hojas Resumen,
// CAPEX y Operativo. Solo reordena/presenta los montos que el diálogo ya
// calculó -- no recalcula nada (así el Excel siempre coincide con pantalla).
// Los totales y derivados llevan fórmula (con su resultado cacheado) para que
// el archivo siga siendo editable. Pendiente: hoja OPEX.

export interface PlanningExcelData {
  targetYear: number;
  currentYear: number;
  ufValue: number;
  closedAt: string | null;
  currentYearAvanceTotals: AvanceTotalRow[];
  straddlingRows: StraddlingContractRow[];
  disponibleCurrentYearCLP: number;
  objetivoContratosRows: Array<{ contractName: string; company: string; avanceStatus: string | null; targetYearUf: number }>;
  objetivoContratosCLP: number;
  informativos: Array<{ name: string; date: string; superficie: number | null; clp: number }>;
  missingDataRows: MissingDataContractRow[];
  operativoRows: OpexExportRow[];
}

const CLP_FMT = '"$"#,##0;[Red]-"$"#,##0';
const UF_FMT = "#,##0.00";
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const HEADER_FILL = "FF1F3A5F";
const SECTION_FILL = "FFE8EEF5";
const TOTAL_FILL = "FFF3F4F6";

const fmtDate = (iso: string | null) => {
  if (!iso) return "-";
  try {
    return format(parseISO(iso), "dd/MM/yyyy");
  } catch {
    return "-";
  }
};

export async function exportCapexPlanningToExcel(data: PlanningExcelData): Promise<{ filename: string }> {
  // Import dinámico: ExcelJS es pesado y solo se necesita al descargar.
  const ExcelJS = (await import("exceljs")).default;
  const { targetYear, currentYear, ufValue } = data;
  const uf = ufValue || 0;

  const wb = new ExcelJS.Workbook();
  wb.creator = "LeaseFlow Pro";
  wb.created = new Date();
  const wsResumen = wb.addWorksheet("Resumen");
  const wsCapex = wb.addWorksheet("CAPEX");
  const wsOperativo = wb.addWorksheet("Operativo");

  // Celda única de Valor UF (editable): TODA conversión UF→CLP del libro la
  // referencia, así cambiar este valor recalcula CAPEX, Operativo y Resumen.
  const UF = "Resumen!$B$3";
  const INPUT_FONT = { color: { argb: "FF0000FF" } }; // azul = dato de ingreso/editable

  type Sheet = typeof wsCapex;
  const title = (ws: Sheet, text: string) => {
    const r = ws.addRow([text]);
    r.font = { bold: true, size: 14 };
  };
  const sectionHeader = (ws: Sheet, text: string, cols: number) => {
    const r = ws.addRow([text]);
    r.font = { bold: true };
    for (let c = 1; c <= cols; c++) r.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SECTION_FILL } };
    return r;
  };
  const tableHeader = (ws: Sheet, labels: string[]) => {
    const r = ws.addRow(labels);
    r.font = { bold: true, color: { argb: "FFFFFFFF" } };
    r.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    labels.forEach((_, i) => {
      r.getCell(i + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    });
    return r;
  };
  const totalStyle = (r: ReturnType<Sheet["addRow"]>, cols: number) => {
    r.font = { bold: true };
    for (let c = 1; c <= cols; c++) r.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_FILL } };
  };
  const setFmt = (r: ReturnType<Sheet["addRow"]>, cols: number[], fmt: string) => cols.forEach((c) => (r.getCell(c).numFmt = fmt));

  // Encabezado de Resumen (fijo: la celda B3 es la referencia de UF de todo el libro).
  title(wsResumen, `Planificación de Presupuesto ${targetYear}`);
  wsResumen.addRow([
    `Generado: ${format(new Date(), "dd/MM/yyyy HH:mm")} · Estado: ${data.closedAt ? `Cerrado el ${fmtDate(data.closedAt)}` : "Borrador (se recalcula en vivo)"}`,
  ]).font = { italic: true };
  const ufRow = wsResumen.addRow(["Valor UF (CLP por UF) — editable, todo el libro depende de esta celda", uf]);
  ufRow.getCell(2).numFmt = UF_FMT;
  ufRow.getCell(2).font = { bold: true, color: { argb: "FF0000FF" } };
  ufRow.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF9C4" } };
  wsResumen.addRow([]);

  // ───────────────────────── Hoja Operativo ─────────────────────────
  // Una tabla por año: filas = local/ítem × categoría, columnas = 12 meses +
  // total. Cada tabla cierra con fila de total por mes (fórmula SUM).
  const operativoTotalCell: Record<number, string> = {};
  title(wsOperativo, `Presupuesto Operativo de Nuevos Locales ${currentYear}-${targetYear} (CLP)`);
  wsOperativo.addRow(["Informativo: no integra el total de CAPEX. 'Automático' = UF del mes × Valor UF (fórmula, cambia con la UF de Resumen!B3). 'Manual' = CLP ingresado a mano (celdas azules, editables)."]).font = { italic: true };
  wsOperativo.addRow([]);
  const opCols = 6 + 12 + 1; // Tipo, Local, Empresa, Categoría, Origen, Año, 12 meses, Total
  [currentYear, targetYear].forEach((year) => {
    sectionHeader(wsOperativo, `Año ${year}`, opCols);
    tableHeader(wsOperativo, ["Tipo", "Local / Ítem", "Empresa", "Categoría", "Origen", "Año", ...MESES, "Total"]);
    const rows = data.operativoRows.filter((r) => r.year === year);
    const firstDataRow = wsOperativo.rowCount + 1;
    rows.forEach((r) => {
      const excelRow = wsOperativo.addRow([r.kind, r.name, r.company, r.category, r.manual ? "Manual" : "Automático", r.year, ...new Array(12).fill(null), null]);
      const n = excelRow.number;
      // Automático: monto = UF del mes × Valor UF (fórmula viva). Manual: CLP
      // ingresado a mano (celda azul, editable) -- no depende de la UF.
      r.months.forEach((m, i) => {
        const cell = excelRow.getCell(7 + i);
        if (!r.manual && uf > 0 && m !== 0) {
          cell.value = { formula: `${Math.round((m / uf) * 1e6) / 1e6}*${UF}`, result: m };
        } else {
          cell.value = m;
          if (r.manual) cell.font = INPUT_FONT;
        }
      });
      const total = r.months.reduce((a, b) => a + b, 0);
      excelRow.getCell(opCols).value = { formula: `SUM(G${n}:R${n})`, result: total };
      setFmt(excelRow, Array.from({ length: 13 }, (_, i) => 7 + i), CLP_FMT);
    });
    const lastDataRow = wsOperativo.rowCount;
    const totalRow = wsOperativo.addRow([`TOTAL ${year}`]);
    const t = totalRow.number;
    for (let c = 7; c <= opCols; c++) {
      const col = wsOperativo.getColumn(c).letter;
      const result = c === opCols ? rows.reduce((s, r) => s + r.months.reduce((a, b) => a + b, 0), 0) : rows.reduce((s, r) => s + (r.months[c - 7] || 0), 0);
      totalRow.getCell(c).value = rows.length > 0 ? { formula: `SUM(${col}${firstDataRow}:${col}${lastDataRow})`, result } : 0;
    }
    setFmt(totalRow, Array.from({ length: 13 }, (_, i) => 7 + i), CLP_FMT);
    totalStyle(totalRow, opCols);
    operativoTotalCell[year] = `Operativo!${wsOperativo.getColumn(opCols).letter}${t}`;
    wsOperativo.addRow([]);
  });
  if (data.operativoRows.length === 0) {
    wsOperativo.addRow(["No hay contratos 'Nuevo' ni ítems informativos con presupuesto operativo en este rango."]);
  }
  wsOperativo.columns = [
    { width: 13 }, { width: 38 }, { width: 24 }, { width: 18 }, { width: 12 }, { width: 8 },
    ...MESES.map(() => ({ width: 13 })), { width: 16 },
  ];
  wsOperativo.views = [{ state: "frozen", xSplit: 2, ySplit: 0 }];

  // ───────────────────────── Hoja CAPEX ─────────────────────────
  const capexCols = 9;
  title(wsCapex, `Presupuesto CAPEX ${targetYear}`);
  const ufRowCapex = wsCapex.addRow(["Valor UF utilizado (editable en hoja Resumen, celda B3):", null]);
  ufRowCapex.getCell(2).value = { formula: UF, result: uf };
  ufRowCapex.getCell(2).numFmt = UF_FMT;
  ufRowCapex.font = { italic: true };
  wsCapex.addRow(["Celdas en azul = datos de ingreso (editables). Celdas en negro = fórmulas: CLP = UF × Valor UF, totales, arrastre y 'A pedir' se recalculan al editar."]).font = { italic: true };
  wsCapex.addRow([]);

  // 1. Presupuesto año actual por Estado de Avance
  sectionHeader(wsCapex, `Presupuesto ${currentYear} por Estado de Avance`, capexCols);
  tableHeader(wsCapex, ["Estado de Avance", "N° contratos", "Total UF", "Total CLP", "Contratos"]);
  const avFirst = wsCapex.rowCount + 1;
  data.currentYearAvanceTotals.forEach((t) => {
    const r = wsCapex.addRow([t.name, t.count, t.uf, null, t.names.map((n) => n.name).join("; ")]);
    r.getCell(4).value = { formula: `C${r.number}*${UF}`, result: t.uf * uf };
    setFmt(r, [3], UF_FMT);
    setFmt(r, [4], CLP_FMT);
    [2, 3].forEach((c) => (r.getCell(c).font = INPUT_FONT));
  });
  const avLast = wsCapex.rowCount;
  const avTotal = wsCapex.addRow([`Total ${currentYear}`]);
  if (data.currentYearAvanceTotals.length > 0) {
    avTotal.getCell(2).value = { formula: `SUM(B${avFirst}:B${avLast})`, result: data.currentYearAvanceTotals.reduce((s, t) => s + t.count, 0) };
    avTotal.getCell(3).value = { formula: `SUM(C${avFirst}:C${avLast})`, result: data.currentYearAvanceTotals.reduce((s, t) => s + t.uf, 0) };
    avTotal.getCell(4).value = { formula: `SUM(D${avFirst}:D${avLast})`, result: data.currentYearAvanceTotals.reduce((s, t) => s + t.uf, 0) * uf };
  }
  setFmt(avTotal, [3], UF_FMT);
  setFmt(avTotal, [4], CLP_FMT);
  totalStyle(avTotal, capexCols);
  wsCapex.addRow([]);

  // 2. Arrastre
  sectionHeader(wsCapex, `Arrastre de Presupuesto ${currentYear} a ${targetYear}`, capexCols);
  tableHeader(wsCapex, ["Contrato", "Empresa", "Clasificación", "Estado de Avance", `${currentYear} (UF)`, `${targetYear} (UF)`, `${targetYear} (CLP)`, "Fecha", "Observación"]);
  const arFirst = wsCapex.rowCount + 1;
  data.straddlingRows.forEach((s) => {
    const r = wsCapex.addRow([
      s.contractName, s.company, s.clasificacion ?? "-", s.avanceStatus ?? "-", s.currentYearUf, s.targetYearUf, null, fmtDate(s.date),
      s.isManualNoGanttCarryover ? "Arrastre manual (sin Gantt)" : "",
    ]);
    r.getCell(7).value = { formula: `F${r.number}*${UF}`, result: s.targetYearUf * uf };
    setFmt(r, [5, 6], UF_FMT);
    setFmt(r, [7], CLP_FMT);
    [5, 6].forEach((c) => (r.getCell(c).font = INPUT_FONT));
  });
  const arLast = wsCapex.rowCount;
  const arrastreContratosCLP = data.straddlingRows.reduce((s, r) => s + r.targetYearUf, 0) * uf;
  const arContratos = wsCapex.addRow([`Subtotal contratos que cruzan de año`]);
  if (data.straddlingRows.length > 0) {
    arContratos.getCell(7).value = { formula: `SUM(G${arFirst}:G${arLast})`, result: arrastreContratosCLP };
  } else {
    arContratos.getCell(7).value = 0;
  }
  setFmt(arContratos, [7], CLP_FMT);
  arContratos.font = { bold: true };
  const arDisp = wsCapex.addRow([`+ Disponible Presupuesto Aprobado ${currentYear} (incl. Caídos)`]);
  arDisp.getCell(7).value = data.disponibleCurrentYearCLP;
  arDisp.getCell(7).font = INPUT_FONT;
  setFmt(arDisp, [7], CLP_FMT);
  const arTotal = wsCapex.addRow([`Total arrastre a ${targetYear}`]);
  arTotal.getCell(7).value = { formula: `G${arContratos.number}+G${arDisp.number}`, result: arrastreContratosCLP + data.disponibleCurrentYearCLP };
  setFmt(arTotal, [7], CLP_FMT);
  totalStyle(arTotal, capexCols);
  wsCapex.addRow([]);

  // 3. Contratos comprometidos en targetYear
  sectionHeader(wsCapex, `Contratos (comprometido real en ${targetYear})`, capexCols);
  tableHeader(wsCapex, ["Contrato", "Empresa", "Estado de Avance", `${targetYear} (UF)`, `${targetYear} (CLP)`]);
  const ctFirst = wsCapex.rowCount + 1;
  data.objetivoContratosRows.forEach((c) => {
    const r = wsCapex.addRow([c.contractName, c.company, c.avanceStatus ?? "-", c.targetYearUf, null]);
    r.getCell(5).value = { formula: `D${r.number}*${UF}`, result: c.targetYearUf * uf };
    setFmt(r, [4], UF_FMT);
    setFmt(r, [5], CLP_FMT);
    r.getCell(4).font = INPUT_FONT;
  });
  const ctLast = wsCapex.rowCount;
  const ctTotal = wsCapex.addRow([`Total comprometido ${targetYear}`]);
  if (data.objetivoContratosRows.length > 0) {
    ctTotal.getCell(4).value = { formula: `SUM(D${ctFirst}:D${ctLast})`, result: data.objetivoContratosRows.reduce((s, c) => s + c.targetYearUf, 0) };
    ctTotal.getCell(5).value = { formula: `SUM(E${ctFirst}:E${ctLast})`, result: data.objetivoContratosRows.reduce((s, c) => s + c.targetYearUf, 0) * uf };
  }
  setFmt(ctTotal, [4], UF_FMT);
  setFmt(ctTotal, [5], CLP_FMT);
  totalStyle(ctTotal, capexCols);
  wsCapex.addRow([]);

  // 4. Ítems informativos
  sectionHeader(wsCapex, "Ítems de Presupuesto informativos (sin contrato)", capexCols);
  tableHeader(wsCapex, ["Ítem", "Fecha", "Superficie Edificada Local (m²)", "Total CAPEX Business Case (CLP)"]);
  const inFirst = wsCapex.rowCount + 1;
  data.informativos.forEach((it) => {
    const r = wsCapex.addRow([it.name, fmtDate(it.date), it.superficie, it.clp]);
    setFmt(r, [3], "#,##0.##");
    setFmt(r, [4], CLP_FMT);
    [3, 4].forEach((c) => (r.getCell(c).font = INPUT_FONT));
  });
  const inLast = wsCapex.rowCount;
  const informativosCLP = data.informativos.reduce((s, it) => s + it.clp, 0);
  const inTotal = wsCapex.addRow(["Subtotal informativos"]);
  inTotal.getCell(4).value = data.informativos.length > 0 ? { formula: `SUM(D${inFirst}:D${inLast})`, result: informativosCLP } : 0;
  setFmt(inTotal, [4], CLP_FMT);
  totalStyle(inTotal, capexCols);
  wsCapex.addRow([]);

  // 5. Contratos con datos incompletos (informativo: no suman a los totales)
  if (data.missingDataRows.length > 0) {
    sectionHeader(wsCapex, "Contratos con datos incompletos para Objetivo/Arrastre (no incluidos arriba)", capexCols);
    tableHeader(wsCapex, ["Contrato", "Empresa", "Estado de Avance", "Cronograma Gantt", `${currentYear} (UF)`, `${targetYear} (UF)`, "Año de arrastre manual"]);
    data.missingDataRows.forEach((m) => {
      const r = wsCapex.addRow([m.contractName, m.company, m.avanceStatus ?? "Sin Estado de Avance", m.hasGantt ? "Sí" : "No", m.currentYearUf, m.targetYearUf, m.noGanttYearHint ?? "-"]);
      setFmt(r, [5, 6], UF_FMT);
    });
    wsCapex.addRow([]);
  }

  // 6. Total
  const objetivoCLP = data.objetivoContratosCLP + informativosCLP;
  const arrastreCLP = arrastreContratosCLP + data.disponibleCurrentYearCLP;
  sectionHeader(wsCapex, `Total Presupuesto ${targetYear}`, capexCols);
  const totObj = wsCapex.addRow([`TOTAL PRESUPUESTO ${targetYear} (Objetivo)`]);
  totObj.getCell(4).value = { formula: `E${ctTotal.number}+D${inTotal.number}`, result: objetivoCLP };
  const totArr = wsCapex.addRow(["Arrastre (ya incluido arriba, no se suma de nuevo)"]);
  totArr.getCell(4).value = { formula: `-G${arTotal.number}`, result: -arrastreCLP };
  const totPedir = wsCapex.addRow(["A pedir"]);
  totPedir.getCell(4).value = { formula: `D${totObj.number}+D${totArr.number}`, result: objetivoCLP - arrastreCLP };
  setFmt(totObj, [4], CLP_FMT);
  setFmt(totArr, [4], CLP_FMT);
  setFmt(totPedir, [4], CLP_FMT);
  totalStyle(totObj, capexCols);
  totalStyle(totPedir, capexCols);

  wsCapex.columns = [
    { width: 44 }, { width: 24 }, { width: 22 }, { width: 22 }, { width: 18 }, { width: 18 }, { width: 20 }, { width: 14 }, { width: 30 },
  ];

  // ───────────────────────── Hoja Resumen ─────────────────────────
  sectionHeader(wsResumen, "CAPEX", 3);
  const rObjContratos = wsResumen.addRow([`Contratos comprometidos ${targetYear}`, null, "Hoja CAPEX"]);
  rObjContratos.getCell(2).value = { formula: `CAPEX!E${ctTotal.number}`, result: data.objetivoContratosCLP };
  const rObjInfo = wsResumen.addRow(["Ítems informativos", null, "Hoja CAPEX"]);
  rObjInfo.getCell(2).value = { formula: `CAPEX!D${inTotal.number}`, result: informativosCLP };
  const rObj = wsResumen.addRow([`Objetivo ${targetYear}`]);
  rObj.getCell(2).value = { formula: `B${rObjContratos.number}+B${rObjInfo.number}`, result: objetivoCLP };
  totalStyle(rObj, 3);
  const rArrContratos = wsResumen.addRow(["Arrastre: contratos que cruzan de año", null, "Hoja CAPEX"]);
  rArrContratos.getCell(2).value = { formula: `CAPEX!G${arContratos.number}`, result: arrastreContratosCLP };
  const rArrDisp = wsResumen.addRow([`Arrastre: Disponible Presupuesto Aprobado ${currentYear}`, null, "Hoja CAPEX"]);
  rArrDisp.getCell(2).value = { formula: `CAPEX!G${arDisp.number}`, result: data.disponibleCurrentYearCLP };
  const rArr = wsResumen.addRow([`Arrastre total a ${targetYear}`]);
  rArr.getCell(2).value = { formula: `B${rArrContratos.number}+B${rArrDisp.number}`, result: arrastreCLP };
  totalStyle(rArr, 3);
  const rPedir = wsResumen.addRow(["A pedir (Objetivo − Arrastre)"]);
  rPedir.getCell(2).value = { formula: `B${rObj.number}-B${rArr.number}`, result: objetivoCLP - arrastreCLP };
  totalStyle(rPedir, 3);
  [rObjContratos, rObjInfo, rObj, rArrContratos, rArrDisp, rArr, rPedir].forEach((r) => setFmt(r, [2], CLP_FMT));
  wsResumen.addRow([]);

  sectionHeader(wsResumen, "Operativo (Nuevos Locales) — informativo, no integra el total de CAPEX", 3);
  [currentYear, targetYear].forEach((year) => {
    const result = data.operativoRows.filter((r) => r.year === year).reduce((s, r) => s + r.months.reduce((a, b) => a + b, 0), 0);
    const r = wsResumen.addRow([`Presupuesto Operativo ${year}`, null, "Hoja Operativo"]);
    r.getCell(2).value = { formula: operativoTotalCell[year], result };
    setFmt(r, [2], CLP_FMT);
  });
  wsResumen.columns = [{ width: 56 }, { width: 22 }, { width: 18 }];

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const filename = `Presupuesto_${targetYear}_${format(new Date(), "yyyy-MM-dd")}.xlsx`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.setAttribute("data-interception", "off");
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
  return { filename };
}
