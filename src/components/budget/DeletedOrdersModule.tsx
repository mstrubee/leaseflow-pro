import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Trash2, RotateCcw, ChevronDown, ChevronRight, FileText, Receipt } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useBudgetContext } from "./BudgetContext";
import { useAuth } from "@/hooks/useAuth";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface DeletedOrder {
  id: string;
  order_number: string;
  supplier_name: string | null;
  order_date: string;
  amount_uf: number;
  description: string | null;
  deleted_at: string;
  deleted_by: string | null;
}

interface DeletedInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  amount_uf: number;
  purchase_order_id: string;
}

interface DeletedCreditNote {
  id: string;
  credit_note_number: string;
  credit_note_date: string;
  amount_uf: number;
  purchase_order_id: string;
  invoice_id: string;
}

interface DeletedOrdersModuleProps {
  contractId: string;
  selectedYear: number;
  onRefresh?: () => void;
}

export const DeletedOrdersModule = ({ contractId, selectedYear, onRefresh }: DeletedOrdersModuleProps) => {
  const [deletedOrders, setDeletedOrders] = useState<DeletedOrder[]>([]);
  const [deletedInvoices, setDeletedInvoices] = useState<DeletedInvoice[]>([]);
  const [deletedCreditNotes, setDeletedCreditNotes] = useState<DeletedCreditNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  
  const [restoreOrder, setRestoreOrder] = useState<DeletedOrder | null>(null);
  const [permanentDeleteOrder, setPermanentDeleteOrder] = useState<DeletedOrder | null>(null);
  
  const { toast } = useToast();
  const { formatUF } = useBudgetContext();
  const { isAdmin } = useAuth();

  useEffect(() => {
    loadDeletedItems();
  }, [contractId, selectedYear]);

  const loadDeletedItems = async () => {
    setLoading(true);
    try {
      // Load deleted orders
      const { data: orders, error: ordersError } = await supabase
        .from("purchase_orders")
        .select("id, order_number, supplier_name, order_date, amount_uf, description, deleted_at, deleted_by")
        .eq("contract_id", contractId)
        .eq("year", selectedYear)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });

      if (ordersError) throw ordersError;
      setDeletedOrders(orders || []);

      if (orders && orders.length > 0) {
        const orderIds = orders.map(o => o.id);

        // Load deleted invoices for these orders
        const { data: invoices } = await supabase
          .from("invoices")
          .select("id, invoice_number, invoice_date, amount_uf, purchase_order_id")
          .in("purchase_order_id", orderIds)
          .not("deleted_at", "is", null);

        setDeletedInvoices(invoices || []);

        // Load deleted credit notes for these orders
        const { data: creditNotes } = await supabase
          .from("credit_notes")
          .select("id, credit_note_number, credit_note_date, amount_uf, purchase_order_id, invoice_id")
          .in("purchase_order_id", orderIds)
          .not("deleted_at", "is", null);

        setDeletedCreditNotes(creditNotes || []);
      } else {
        setDeletedInvoices([]);
        setDeletedCreditNotes([]);
      }
    } catch (error) {
      console.error("Error loading deleted items:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleOrderExpanded = (orderId: string) => {
    const newExpanded = new Set(expandedOrders);
    if (newExpanded.has(orderId)) {
      newExpanded.delete(orderId);
    } else {
      newExpanded.add(orderId);
    }
    setExpandedOrders(newExpanded);
  };

  const handleRestore = async () => {
    if (!restoreOrder) return;

    try {
      // Restore all credit notes for this order
      const { error: creditNoteError } = await supabase
        .from("credit_notes")
        .update({ deleted_at: null, deleted_by: null })
        .eq("purchase_order_id", restoreOrder.id);
      
      if (creditNoteError) throw creditNoteError;

      // Restore all invoices for this order
      const { error: invoiceError } = await supabase
        .from("invoices")
        .update({ deleted_at: null, deleted_by: null })
        .eq("purchase_order_id", restoreOrder.id);
      
      if (invoiceError) throw invoiceError;

      // Restore the order
      const { error } = await supabase
        .from("purchase_orders")
        .update({ deleted_at: null, deleted_by: null })
        .eq("id", restoreOrder.id);
      
      if (error) throw error;

      toast({ title: "OC restablecida", description: `Orden de compra ${restoreOrder.order_number} restaurada exitosamente` });
      setRestoreOrder(null);
      await loadDeletedItems();
      onRefresh?.();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error al restaurar", description: error.message });
    }
  };

  const handlePermanentDelete = async () => {
    if (!permanentDeleteOrder || !isAdmin) return;

    try {
      // Permanently delete credit notes
      const { error: creditNoteError } = await supabase
        .from("credit_notes")
        .delete()
        .eq("purchase_order_id", permanentDeleteOrder.id);
      
      if (creditNoteError) throw creditNoteError;

      // Permanently delete invoices
      const { error: invoiceError } = await supabase
        .from("invoices")
        .delete()
        .eq("purchase_order_id", permanentDeleteOrder.id);
      
      if (invoiceError) throw invoiceError;

      // Permanently delete the order
      const { error } = await supabase
        .from("purchase_orders")
        .delete()
        .eq("id", permanentDeleteOrder.id);
      
      if (error) throw error;

      toast({ title: "OC eliminada permanentemente", description: `Orden de compra ${permanentDeleteOrder.order_number} eliminada definitivamente` });
      setPermanentDeleteOrder(null);
      await loadDeletedItems();
      onRefresh?.();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error al eliminar", description: error.message });
    }
  };

  const getOrderInvoices = (orderId: string) => deletedInvoices.filter(i => i.purchase_order_id === orderId);
  const getOrderCreditNotes = (orderId: string) => deletedCreditNotes.filter(cn => cn.purchase_order_id === orderId);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Trash2 className="h-4 w-4" />
            Elementos Eliminados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (deletedOrders.length === 0) {
    return null;
  }

  return (
    <>
      <Card className="border-dashed border-muted-foreground/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-muted-foreground">
            <Trash2 className="h-4 w-4" />
            Elementos Eliminados ({deletedOrders.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>N° OC</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Eliminado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deletedOrders.map((order) => {
                const orderInvoices = getOrderInvoices(order.id);
                const orderCreditNotes = getOrderCreditNotes(order.id);
                const hasChildren = orderInvoices.length > 0 || orderCreditNotes.length > 0;
                const isExpanded = expandedOrders.has(order.id);

                return (
                  <React.Fragment key={order.id}>
                    <TableRow className="opacity-60 hover:opacity-100">
                      <TableCell>
                        {hasChildren && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => toggleOrderExpanded(order.id)}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{order.order_number}</TableCell>
                      <TableCell>{order.supplier_name || "-"}</TableCell>
                      <TableCell>{format(new Date(order.order_date), "dd/MM/yyyy")}</TableCell>
                      <TableCell className="text-right">{formatUF(order.amount_uf)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(order.deleted_at), "dd/MM/yyyy HH:mm", { locale: es })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-green-600 hover:text-green-700"
                            onClick={() => setRestoreOrder(order)}
                            title="Restablecer"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              onClick={() => setPermanentDeleteOrder(order)}
                              title="Eliminar permanentemente"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {isExpanded && hasChildren && (
                      <TableRow>
                        <TableCell colSpan={7} className="bg-muted/30 p-4">
                          <div className="space-y-3">
                            {orderInvoices.length > 0 && (
                              <div>
                                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                                  <FileText className="h-4 w-4" />
                                  Facturas eliminadas ({orderInvoices.length})
                                </div>
                                <div className="space-y-1 ml-6">
                                  {orderInvoices.map((inv) => (
                                    <div key={inv.id} className="flex justify-between text-sm text-muted-foreground">
                                      <span>Factura {inv.invoice_number} - {format(new Date(inv.invoice_date), "dd/MM/yyyy")}</span>
                                      <span>{formatUF(inv.amount_uf)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {orderCreditNotes.length > 0 && (
                              <div>
                                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                                  <Receipt className="h-4 w-4" />
                                  Notas de crédito eliminadas ({orderCreditNotes.length})
                                </div>
                                <div className="space-y-1 ml-6">
                                  {orderCreditNotes.map((cn) => (
                                    <div key={cn.id} className="flex justify-between text-sm text-muted-foreground">
                                      <span>NC {cn.credit_note_number} - {format(new Date(cn.credit_note_date), "dd/MM/yyyy")}</span>
                                      <span className="text-destructive">-{formatUF(cn.amount_uf)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Restore confirmation */}
      <AlertDialog open={restoreOrder !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Restablecer Orden de Compra?</AlertDialogTitle>
            <AlertDialogDescription>
              Se restaurará la OC <strong>{restoreOrder?.order_number}</strong> junto con todas sus facturas y notas de crédito asociadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRestoreOrder(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore} className="bg-green-600 hover:bg-green-700">
              Restablecer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Permanent delete confirmation (Admin only) */}
      <AlertDialog open={permanentDeleteOrder !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">⚠️ Eliminar Permanentemente</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>Esta acción NO se puede deshacer.</strong>
              <br /><br />
              Se eliminará permanentemente la OC <strong>{permanentDeleteOrder?.order_number}</strong> junto con todas sus facturas y notas de crédito.
              <br /><br />
              Los datos serán borrados definitivamente de la base de datos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPermanentDeleteOrder(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handlePermanentDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar Permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
