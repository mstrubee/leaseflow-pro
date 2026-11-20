import { format } from "date-fns";

// Descarga Excel de "Planificar presupuesto OPEX {año}": una fila por categoría (Item) con su monto propuesto y el total.
// Solo presenta los montos que la ventana ya calculó (columna "Total {año}"), así el Excel siempre coincide con la pantalla.
// El total lleva fórmula (con su resultado guardado) para que el archivo siga siendo editable.

export interface OpexPlanExcelRow {
  name: string;
  amountClp: number;
}

const HEADER_FILL = "FF1F4E9C"; // azul
const HEADER_FONT = { bold: true, color: { argb: "FFFFFFFF" } }; // letras blancas en negrita
const CLP_FORMAT = '"$"#,##0;[Red]-"$"#,##0';
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function exportOpexPlanToExcel(params: { planYear: number; rows: OpexPlanExcelRow[] }): Promise<{ filename: string }> {
  // Import dinámico: ExcelJS es pesado y solo se necesita al descargar.
  const ExcelJS = (await import("exceljs")).default;
  const { planYear, rows } = params;

  const wb = new ExcelJS.Workbook();
  wb.creator = "LeaseFlow Pro";
  const ws = wb.addWorksheet(`OPEX ${planYear}`, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [{ width: 52 }, { width: 22 }];

  const header = ws.addRow(["Item", "Monto"]);
  header.eachCell((cell, colNumber) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: "middle", horizontal: colNumber === 2 ? "right" : "left" };
  });

  rows.forEach((r) => {
    const row = ws.addRow([r.name, Math.round(r.amountClp)]);
    row.getCell(2).numFmt = CLP_FORMAT;
  });

  const firstRow = 2;
  const lastRow = rows.length + 1;
  const total = ws.addRow(["Total", { formula: `SUM(B${firstRow}:B${lastRow})`, result: rows.reduce((sum, r) => sum + Math.round(r.amountClp), 0) }]);
  total.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.font = HEADER_FONT;
  });
  total.getCell(2).numFmt = CLP_FORMAT;

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: XLSX_TYPE });
  const filename = `Presupuesto_OPEX_${planYear}_${format(new Date(), "yyyy-MM-dd")}.xlsx`;
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
