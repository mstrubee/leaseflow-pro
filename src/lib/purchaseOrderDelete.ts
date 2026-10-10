import { supabase } from "@/integrations/supabase/client";
import { syncBudgetLineOcStatus } from "./budgetLineOcStatus";

export interface SoftDeletePurchaseOrderResult {
  /** null si la OC ya no existe (p.ej. fue borrada antes de que source_quotation_number se guardara). */
  orderNumber: string | null;
  /** true si no se hizo nada porque la OC ya estaba en la papelera (o no existe). */
  alreadyDeleted: boolean;
}

/**
 * Envía una Orden de Compra a "Elementos Eliminados" (soft delete) junto con
 * sus facturas y notas de crédito, igual que el botón "Eliminar" de
 * PurchaseOrdersModule.tsx -- se extrajo acá para poder reutilizarlo también
 * al "Revertir" una Solicitud de OC convertida (ver OCRequestsList.tsx), que
 * debe eliminar la OC creada en la conversión.
 */
export async function softDeletePurchaseOrder(purchaseOrderId: string): Promise<SoftDeletePurchaseOrderResult> {
  const { data: order, error: orderError } = await supabase
    .from("purchase_orders")
    .select("id, order_number, budget_line_id, deleted_at")
    .eq("id", purchaseOrderId)
    .maybeSingle();
  if (orderError) throw orderError;
  if (!order) return { orderNumber: null, alreadyDeleted: true };
  if (order.deleted_at) return { orderNumber: order.order_number, alreadyDeleted: true };

  const now = new Date().toISOString();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id || null;

  const { data: linkedLines } = await supabase
    .from("purchase_order_budget_lines")
    .select("budget_line_id")
    .eq("purchase_order_id", purchaseOrderId);
  const linkedLineIds = linkedLines?.length
    ? linkedLines.map((l) => l.budget_line_id)
    : (order.budget_line_id ? [order.budget_line_id] : []);

  const { error: creditNoteError } = await supabase
    .from("credit_notes")
    .update({ deleted_at: now, deleted_by: userId })
    .eq("purchase_order_id", purchaseOrderId)
    .is("deleted_at", null);
  if (creditNoteError) throw creditNoteError;

  const { error: invoiceError } = await supabase
    .from("invoices")
    .update({ deleted_at: now, deleted_by: userId })
    .eq("purchase_order_id", purchaseOrderId)
    .is("deleted_at", null);
  if (invoiceError) throw invoiceError;

  const { error } = await supabase
    .from("purchase_orders")
    .update({ deleted_at: now, deleted_by: userId })
    .eq("id", purchaseOrderId);
  if (error) throw error;

  if (linkedLineIds.length > 0) {
    await syncBudgetLineOcStatus({ removedLineIds: linkedLineIds });
  }

  return { orderNumber: order.order_number, alreadyDeleted: false };
}
