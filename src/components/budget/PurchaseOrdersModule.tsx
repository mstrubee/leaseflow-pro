import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, FileText, ChevronDown, ChevronRight, AlertTriangle, Paperclip, ExternalLink, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Search, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useBudgetContext } from "./BudgetContext";
import { InvoiceList } from "./InvoiceList";
import { RepositoryFilePicker } from "./RepositoryFilePicker";
import { cn } from "@/lib/utils";

interface PurchaseOrder {
  id: string;
  order_number: string;
  supplier_name: string | null;
  order_date: string;
  amount_uf: number;
  description: string | null;
  attachment_url: string | null;
  year: number;
  status: string;
  budget_id: string | null;
}

interface PurchaseOrdersModuleProps {
  contractId: string;
  initialYear?: number;
}

interface Budget {
  id: string;
  year: number;
  budget_type: string;
}

export const PurchaseOrdersModule = ({ contractId, initialYear }: PurchaseOrdersModuleProps) => {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const selectedYear = initialYear ?? new Date().getFullYear();

  const [loading, setLoading] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [deleteOrder, setDeleteOrder] = useState<PurchaseOrder | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  
  // Sorting and filtering state
  const [sortColumn, setSortColumn] = useState<string>("order_date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  
  const [newOrder, setNewOrder] = useState({
    order_number: "",
    supplier_name: "",
    order_date: `${initialYear ?? new Date().getFullYear()}-01-01`,
    amount: "",
    currency: "UF" as "UF" | "CLP",
    description: "",
    budget_type: "inversion_inicial" as "inversion_inicial" | "capex",
    attachment_url: "",
    attachment_name: "",
  });
  const { toast } = useToast();
  const { formatUF, formatCLP, convertUFToPesos, convertPesosToUF, ufValue } = useBudgetContext();

  useEffect(() => {
    loadOrders();
    loadBudgets();
  }, [contractId, selectedYear]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("*")
        .eq("contract_id", contractId)
        .eq("year", selectedYear)
        .order("order_date", { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error("Error loading orders:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadBudgets = async () => {
    try {
      const { data, error } = await supabase
        .from("contract_budgets")
        .select("id, year, budget_type")
        .eq("contract_id", contractId)
        .eq("year", selectedYear);

      if (error) throw error;
      setBudgets(data || []);
    } catch (error) {
      console.error("Error loading budgets:", error);
    }
  };

  const handleCreateOrder = async () => {
    try {
      const inputAmount = parseFloat(newOrder.amount) || 0;
      let amountUF: number;
      let amountCLP: number;

      if (newOrder.currency === "UF") {
        amountUF = inputAmount;
        amountCLP = convertUFToPesos(inputAmount);
      } else {
        amountCLP = inputAmount;
        amountUF = convertPesosToUF(inputAmount);
      }

      // Find budget for selected type and year
      const budget = budgets.find(b => b.budget_type === newOrder.budget_type);

      const { error } = await supabase.from("purchase_orders").insert({
        contract_id: contractId,
        order_number: newOrder.order_number,
        supplier_name: newOrder.supplier_name || null,
        order_date: newOrder.order_date,
        amount_uf: amountUF,
        amount_clp: amountCLP,
        input_currency: newOrder.currency,
        uf_value_at_entry: ufValue,
        description: newOrder.description || null,
        year: selectedYear,
        budget_id: budget?.id || null,
        attachment_url: newOrder.attachment_url || null,
      });

      if (error) throw error;

      toast({ title: "OC creada", description: `Orden de compra ${newOrder.order_number} creada` });
      setShowNewDialog(false);
      setNewOrder({ 
        order_number: "", 
        supplier_name: "", 
        order_date: `${selectedYear}-01-01`, 
        amount: "", 
        currency: "UF", 
        description: "",
        budget_type: "inversion_inicial",
        attachment_url: "",
        attachment_name: "",
      });
      loadOrders();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const getBudgetTypeLabel = (type: string) => {
    return type === "inversion_inicial" ? "Inversión Inicial" : "Capex";
  };

  const getBudgetTypeForOrder = (order: PurchaseOrder) => {
    const budget = budgets.find(b => b.id === order.budget_id);
    return budget ? getBudgetTypeLabel(budget.budget_type) : "-";
  };

  const toggleExpanded = (orderId: string) => {
    const newExpanded = new Set(expandedOrders);
    if (newExpanded.has(orderId)) {
      newExpanded.delete(orderId);
    } else {
      newExpanded.add(orderId);
    }
    setExpandedOrders(newExpanded);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "cerrada":
        return <Badge className="bg-green-500">Cerrada</Badge>;
      case "descuadrada":
        return <Badge variant="destructive" className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Descuadrada</Badge>;
      default:
        return <Badge variant="secondary">Abierta</Badge>;
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, order: PurchaseOrder) => {
    e.stopPropagation();
    setDeleteOrder(order);
    setDeleteStep(1);
  };

  const handleDeleteConfirm = async () => {
    if (deleteStep === 1) {
      setDeleteStep(2);
      return;
    }

    if (!deleteOrder) return;

    try {
      // Delete all invoices for this order first
      const { error: invoiceError } = await supabase
        .from("invoices")
        .delete()
        .eq("purchase_order_id", deleteOrder.id);
      
      if (invoiceError) {
        console.error("Error deleting invoices:", invoiceError);
        throw invoiceError;
      }
      
      // Delete the order
      const { error } = await supabase
        .from("purchase_orders")
        .delete()
        .eq("id", deleteOrder.id);
      
      if (error) {
        console.error("Error deleting purchase order:", error);
        throw error;
      }

      toast({ title: "OC eliminada", description: `Orden de compra ${deleteOrder.order_number} eliminada` });
      setDeleteOrder(null);
      setDeleteStep(1);
      await loadOrders();
    } catch (error: any) {
      console.error("Delete error:", error);
      toast({ variant: "destructive", title: "Error al eliminar", description: error.message });
    }
  };

  const totalOC = orders.reduce((sum, o) => sum + o.amount_uf, 0);

  // Sorting handler
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // Get sort icon
  const getSortIcon = (column: string) => {
    if (sortColumn !== column) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />;
    return sortDirection === "asc" 
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  // Apply filters and sorting
  const filteredAndSortedOrders = React.useMemo(() => {
    let result = [...orders];

    // Apply filters
    Object.entries(filters).forEach(([key, value]) => {
      if (!value) return;
      const lowerValue = value.toLowerCase();
      result = result.filter(order => {
        switch (key) {
          case "order_number":
            return order.order_number.toLowerCase().includes(lowerValue);
          case "order_date":
            return new Date(order.order_date).toLocaleDateString("es-CL").includes(lowerValue);
          case "supplier_name":
            return (order.supplier_name || "").toLowerCase().includes(lowerValue);
          case "type":
            return getBudgetTypeForOrder(order).toLowerCase().includes(lowerValue);
          case "description":
            return (order.description || "").toLowerCase().includes(lowerValue);
          case "amount":
            return order.amount_uf.toString().includes(lowerValue);
          case "status":
            return order.status.toLowerCase().includes(lowerValue);
          default:
            return true;
        }
      });
    });

    // Apply sorting
    result.sort((a, b) => {
      let aVal: any, bVal: any;
      switch (sortColumn) {
        case "order_number":
          aVal = a.order_number;
          bVal = b.order_number;
          break;
        case "order_date":
          aVal = new Date(a.order_date).getTime();
          bVal = new Date(b.order_date).getTime();
          break;
        case "supplier_name":
          aVal = a.supplier_name || "";
          bVal = b.supplier_name || "";
          break;
        case "type":
          aVal = getBudgetTypeForOrder(a);
          bVal = getBudgetTypeForOrder(b);
          break;
        case "description":
          aVal = a.description || "";
          bVal = b.description || "";
          break;
        case "amount":
          aVal = a.amount_uf;
          bVal = b.amount_uf;
          break;
        case "status":
          aVal = a.status;
          bVal = b.status;
          break;
        default:
          return 0;
      }
      
      if (typeof aVal === "string") {
        return sortDirection === "asc" 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    });

    return result;
  }, [orders, filters, sortColumn, sortDirection, budgets]);

  // Clear all filters
  const clearAllFilters = () => {
    setFilters({});
  };

  const hasActiveFilters = Object.values(filters).some(v => v);

  // Column header with sort only
  const ColumnHeader = ({ column, label, className }: { column: string; label: string; className?: string }) => (
    <TableHead className={className}>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 -ml-2 font-medium hover:bg-accent"
        onClick={() => handleSort(column)}
      >
        {label}
        {getSortIcon(column)}
      </Button>
    </TableHead>
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Órdenes de Compra - {selectedYear}
        </CardTitle>
        <Button size="sm" onClick={() => setShowNewDialog(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Nueva OC
        </Button>
      </CardHeader>
      <CardContent>
        <div className="mb-4 p-3 bg-muted/30 rounded-lg flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Total OC {selectedYear}</span>
          <div className="text-right">
            <p className="font-bold">{formatUF(totalOC)}</p>
            <p className="text-xs text-muted-foreground">{formatCLP(convertUFToPesos(totalOC))}</p>
          </div>
        </div>

        {/* Filter bar */}
        <div className="mb-4 p-3 bg-muted/20 rounded-lg border">
          <div className="flex items-center gap-2 mb-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filtros</span>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="h-6 text-xs ml-auto" onClick={clearAllFilters}>
                <X className="h-3 w-3 mr-1" />
                Limpiar filtros
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
            <Input
              placeholder="Nº OC"
              className="h-8 text-sm"
              value={filters.order_number || ""}
              onChange={(e) => setFilters({ ...filters, order_number: e.target.value })}
            />
            <Input
              placeholder="Fecha"
              className="h-8 text-sm"
              value={filters.order_date || ""}
              onChange={(e) => setFilters({ ...filters, order_date: e.target.value })}
            />
            <Input
              placeholder="Proveedor"
              className="h-8 text-sm"
              value={filters.supplier_name || ""}
              onChange={(e) => setFilters({ ...filters, supplier_name: e.target.value })}
            />
            <Select
              value={filters.type || "all"}
              onValueChange={(v) => setFilters({ ...filters, type: v === "all" ? "" : v })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="inversión inicial">Inversión Inicial</SelectItem>
                <SelectItem value="capex">Capex</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Descripción"
              className="h-8 text-sm"
              value={filters.description || ""}
              onChange={(e) => setFilters({ ...filters, description: e.target.value })}
            />
            <Input
              placeholder="Monto"
              className="h-8 text-sm"
              value={filters.amount || ""}
              onChange={(e) => setFilters({ ...filters, amount: e.target.value })}
            />
            <Select
              value={filters.status || "all"}
              onValueChange={(v) => setFilters({ ...filters, status: v === "all" ? "" : v })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="abierta">Abierta</SelectItem>
                <SelectItem value="cerrada">Cerrada</SelectItem>
                <SelectItem value="descuadrada">Descuadrada</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {orders.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No hay órdenes de compra para {selectedYear}</p>
        ) : filteredAndSortedOrders.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No hay resultados para los filtros aplicados</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <ColumnHeader column="order_number" label="Nº OC" />
                <ColumnHeader column="order_date" label="Fecha" />
                <ColumnHeader column="supplier_name" label="Proveedor" />
                <ColumnHeader column="type" label="Tipo" />
                <ColumnHeader column="description" label="Descripción" />
                <ColumnHeader column="amount" label="Monto" className="text-right" />
                <ColumnHeader column="status" label="Estado" />
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedOrders.map((order) => (
                <React.Fragment key={order.id}>
                  <TableRow 
                    className={cn("cursor-pointer hover:bg-accent/50", expandedOrders.has(order.id) && "bg-accent/30")}
                    onClick={() => toggleExpanded(order.id)}
                  >
                    <TableCell>
                      {expandedOrders.has(order.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {order.order_number}
                        {order.attachment_url && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(order.attachment_url!, "_blank");
                            }}
                          >
                            <Paperclip className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{new Date(order.order_date).toLocaleDateString("es-CL")}</TableCell>
                    <TableCell>{order.supplier_name || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {getBudgetTypeForOrder(order)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-32 truncate" title={order.description || ""}>
                      {order.description || "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatUF(order.amount_uf)}</TableCell>
                    <TableCell>{getStatusBadge(order.status)}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        onClick={(e) => handleDeleteClick(e, order)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  {expandedOrders.has(order.id) && (
                    <TableRow>
                      <TableCell colSpan={9} className="bg-muted/20 p-4">
                        <InvoiceList purchaseOrder={order} onUpdate={loadOrders} />
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva Orden de Compra</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nº OC</Label>
                <Input value={newOrder.order_number} onChange={(e) => setNewOrder({ ...newOrder, order_number: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Fecha</Label>
                <Input 
                  type="date" 
                  value={newOrder.order_date} 
                  min={`${selectedYear}-01-01`}
                  max={`${selectedYear}-12-31`}
                  onChange={(e) => setNewOrder({ ...newOrder, order_date: e.target.value })} 
                />
                <p className="text-xs text-muted-foreground">Solo fechas del año {selectedYear}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tipo de Presupuesto</Label>
              <Select value={newOrder.budget_type} onValueChange={(v) => setNewOrder({ ...newOrder, budget_type: v as "inversion_inicial" | "capex" })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inversion_inicial">Inversión Inicial</SelectItem>
                  <SelectItem value="capex">Capex</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Proveedor</Label>
              <Input value={newOrder.supplier_name} onChange={(e) => setNewOrder({ ...newOrder, supplier_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Monto</Label>
              <div className="flex gap-2">
                <Input 
                  type="number" 
                  step={newOrder.currency === "UF" ? "0.01" : "1"} 
                  value={newOrder.amount} 
                  onChange={(e) => setNewOrder({ ...newOrder, amount: e.target.value })} 
                  className="flex-1"
                />
                <Select value={newOrder.currency} onValueChange={(v) => setNewOrder({ ...newOrder, currency: v as "UF" | "CLP" })}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UF">UF</SelectItem>
                    <SelectItem value="CLP">CLP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {newOrder.amount && ufValue > 0 && (
                <p className="text-xs text-muted-foreground">
                  Equivalente: {newOrder.currency === "CLP" 
                    ? formatUF(convertPesosToUF(parseFloat(newOrder.amount))) 
                    : formatCLP(convertUFToPesos(parseFloat(newOrder.amount)))}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Input value={newOrder.description} onChange={(e) => setNewOrder({ ...newOrder, description: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Archivo Adjunto</Label>
              <div className="flex items-center gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowFilePicker(true)}
                  className="flex items-center gap-2"
                >
                  <Paperclip className="h-4 w-4" />
                  {newOrder.attachment_name || "Seleccionar archivo"}
                </Button>
                {newOrder.attachment_url && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(newOrder.attachment_url, "_blank")}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreateOrder}>Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RepositoryFilePicker
        open={showFilePicker}
        onOpenChange={setShowFilePicker}
        contractId={contractId}
        title="Seleccionar Archivo de OC"
        onFileSelect={(file) => {
          setNewOrder({ ...newOrder, attachment_url: file.url, attachment_name: file.name });
        }}
      />

      {/* Delete confirmation - Step 1 */}
      <AlertDialog
        open={deleteOrder !== null && deleteStep === 1}
        onOpenChange={(open) => {
          // If user clicked "Continuar", deleteStep is already 2 when the dialog closes
          if (!open && deleteStep === 1) {
            setDeleteOrder(null);
            setDeleteStep(1);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar Orden de Compra?</AlertDialogTitle>
            <AlertDialogDescription>
              Está a punto de eliminar la OC <strong>{deleteOrder?.order_number}</strong> del proveedor{" "}
              <strong>{deleteOrder?.supplier_name || "Sin nombre"}</strong> por un monto de{" "}
              <strong>{formatUF(deleteOrder?.amount_uf || 0)}</strong>.
              <br /><br />
              Esta acción también eliminará todas las facturas asociadas a esta orden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteOrder(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteConfirm();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation - Step 2 */}
      <AlertDialog
        open={deleteOrder !== null && deleteStep === 2}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteOrder(null);
            setDeleteStep(1);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">⚠️ Confirmar Eliminación Definitiva</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>Esta acción es irreversible.</strong>
              <br /><br />
              ¿Está completamente seguro de que desea eliminar permanentemente la OC{" "}
              <strong>{deleteOrder?.order_number}</strong> y todas sus facturas asociadas?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setDeleteOrder(null);
                setDeleteStep(1);
              }}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteConfirm();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar Definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
