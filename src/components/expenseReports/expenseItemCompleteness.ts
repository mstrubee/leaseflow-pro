import type { ExpenseItem } from "./expenseReportsTypes";

/**
 * Campos requeridos para que un gasto cuente como completo — incluida la
 * foto. Se usa tanto para habilitar/deshabilitar "Enviar" en la UI como
 * para revalidar en useExpenseReports.sendReport() antes de mandar.
 * total_amount/tax_amount en 0 SÍ cuenta como completo (se chequea
 * "!= null", no truthiness).
 */
export function getMissingFields(item: ExpenseItem): string[] {
  const missing: string[] = [];
  if (!item.photo_path) missing.push("Foto");
  if (!item.expense_type) missing.push("Tipo de gasto");
  if (!item.transaction_date) missing.push("Fecha de la transacción");
  if (!item.business_purpose?.trim()) missing.push("Propósito de negocios");
  if (!item.purchase_city?.trim()) missing.push("Ciudad de la compra");
  if (!item.payment_type) missing.push("Tipo de pago");
  if (item.total_amount == null) missing.push("Monto total");
  if (!item.currency?.trim()) missing.push("Moneda");
  if (item.tax_amount == null) missing.push("Monto de impuestos");
  if (item.has_receipt == null) missing.push("Estado del comprobante");
  if (!item.receipt_type) missing.push("Tipo de comprobante");
  if (!item.provider_rut?.trim()) missing.push("RUT de proveedor");
  if (!item.provider_name?.trim()) missing.push("Nombre de proveedor");
  if (!item.receipt_number?.trim()) missing.push("Número de comprobante");
  return missing;
}

export function isExpenseItemComplete(item: ExpenseItem): boolean {
  return getMissingFields(item).length === 0;
}

/** Un informe se puede enviar si tiene al menos un gasto y todos están completos. */
export function getReportBlockers(items: ExpenseItem[]): string[] {
  if (items.length === 0) return ["El informe no tiene gastos"];
  const incomplete = items.filter((i) => !isExpenseItemComplete(i));
  if (incomplete.length === 0) return [];
  return [`${incomplete.length} de ${items.length} gasto(s) están incompletos`];
}
