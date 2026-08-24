export type ExpenseReportStatus = "borrador" | "enviado";

export type ExpenseType = "comidas_individuales" | "transporte" | "alojamiento" | "materiales" | "otros";
export type ExpensePaymentType = "efectivo" | "caja_chica" | "fondos_por_rendir";
export type ExpenseReceiptType = "boleta" | "deposito" | "factura" | "recibo";

export const EXPENSE_TYPE_LABELS: Record<ExpenseType, string> = {
  comidas_individuales: "Comidas individuales",
  transporte: "Transporte",
  alojamiento: "Alojamiento",
  materiales: "Materiales",
  otros: "Otros",
};

export const PAYMENT_TYPE_LABELS: Record<ExpensePaymentType, string> = {
  efectivo: "Efectivo",
  caja_chica: "Caja chica/Fondo fijo",
  fondos_por_rendir: "Fondos por rendir",
};

export const RECEIPT_TYPE_LABELS: Record<ExpenseReceiptType, string> = {
  boleta: "Boleta",
  deposito: "Depósito",
  factura: "Factura",
  recibo: "Recibo",
};

export const CURRENCY_OPTIONS = ["CLP", "USD", "EUR", "Otra"] as const;

export interface ExpenseReport {
  id: string;
  created_by: string;
  title: string;
  status: ExpenseReportStatus;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseItem {
  id: string;
  expense_report_id: string;
  created_by: string;
  photo_path: string | null;
  expense_type: ExpenseType | null;
  transaction_date: string | null;
  business_purpose: string | null;
  purchase_city: string | null;
  payment_type: ExpensePaymentType | null;
  total_amount: number | null;
  currency: string | null;
  tax_amount: number | null;
  has_receipt: boolean | null;
  receipt_type: ExpenseReceiptType | null;
  provider_rut: string | null;
  provider_name: string | null;
  receipt_number: string | null;
  created_at: string;
  updated_at: string;
}

/** Campos editables de un gasto (todo lo que no es id/metadata de fila). */
export type ExpenseItemFields = Omit<
  ExpenseItem,
  "id" | "expense_report_id" | "created_by" | "created_at" | "updated_at"
>;
