import * as XLSX from "xlsx";
import { EXPENSE_TYPE_LABELS, PAYMENT_TYPE_LABELS, RECEIPT_TYPE_LABELS, type ExpenseItem, type ExpenseReport } from "./expenseReportsTypes";

/**
 * Arma el workbook (filas de resumen + una fila por gasto con sus 13
 * campos) sin escribirlo a disco — lo reusa expenseReportZip.ts para
 * incluirlo dentro del .zip junto con las fotos. La foto NO se puede
 * incrustar como imagen con la librería xlsx gratuita, por eso va aparte
 * como archivo dentro del zip.
 */
export function buildExpenseReportWorkbook(report: ExpenseReport, items: ExpenseItem[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const totalAmount = items.reduce((s, i) => s + (i.total_amount ?? 0), 0);
  const summary: (string | number)[][] = [
    ["Informe", report.title],
    ["Estado", report.status === "enviado" ? "Enviado" : "Borrador"],
    ["Fecha de envío", report.sent_at ? new Date(report.sent_at).toLocaleDateString("es-CL") : ""],
    ["Cantidad de gastos", items.length],
    ["Monto total", totalAmount],
    [],
  ];

  const rows = items.map((i) => ({
    "Tipo de gasto": i.expense_type ? EXPENSE_TYPE_LABELS[i.expense_type] : "",
    "Fecha": i.transaction_date || "",
    "Propósito de negocios": i.business_purpose || "",
    "Ciudad de la compra": i.purchase_city || "",
    "Tipo de pago": i.payment_type ? PAYMENT_TYPE_LABELS[i.payment_type] : "",
    "Monto total": i.total_amount ?? "",
    "Moneda": i.currency || "",
    "Monto impuestos": i.tax_amount ?? "",
    "Con comprobante": i.has_receipt == null ? "" : i.has_receipt ? "Sí" : "No",
    "Tipo de comprobante": i.receipt_type ? RECEIPT_TYPE_LABELS[i.receipt_type] : "",
    "RUT proveedor": i.provider_rut || "",
    "Nombre proveedor": i.provider_name || "",
    "N° comprobante": i.receipt_number || "",
  }));

  const ws = XLSX.utils.aoa_to_sheet(summary);
  XLSX.utils.sheet_add_json(ws, rows, { origin: -1 });
  ws["!cols"] = [
    { wch: 20 }, { wch: 12 }, { wch: 30 }, { wch: 18 }, { wch: 18 },
    { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 16 },
    { wch: 16 }, { wch: 20 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Gastos");
  return wb;
}
