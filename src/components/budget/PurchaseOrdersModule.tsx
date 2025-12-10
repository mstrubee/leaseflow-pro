import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, FileText, ChevronDown, ChevronRight, AlertTriangle, Paperclip, ExternalLink } from "lucide-react";
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
}

interface Budget {
  id: string;
  year: number;
  budget_type: string;
}

export const PurchaseOrdersModule = ({ contractId }: PurchaseOrdersModuleProps) => {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [newOrder, setNewOrder] = useState({
    order_number: "",
    supplier_name: "",
    order_date: new Date().toISOString().split("T")[0],
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
        order_date: new Date().toISOString().split("T")[0], 
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

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
  const totalOC = orders.reduce((sum, o) => sum + o.amount_uf, 0);

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
          Órdenes de Compra
        </CardTitle>
        <div className="flex items-center gap-3">
          <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setShowNewDialog(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Nueva OC
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 p-3 bg-muted/30 rounded-lg flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Total OC {selectedYear}</span>
          <div className="text-right">
            <p className="font-bold">{formatUF(totalOC)}</p>
            <p className="text-xs text-muted-foreground">{formatCLP(convertUFToPesos(totalOC))}</p>
          </div>
        </div>

        {orders.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No hay órdenes de compra para {selectedYear}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Nº OC</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <React.Fragment key={order.id}>
                  <TableRow 
                    className={cn("cursor-pointer hover:bg-accent/50", expandedOrders.has(order.id) && "bg-accent/30")}
                    onClick={() => toggleExpanded(order.id)}
                  >
                    <TableCell>
                      {expandedOrders.has(order.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </TableCell>
                    <TableCell className="font-medium">{order.order_number}</TableCell>
                    <TableCell>{new Date(order.order_date).toLocaleDateString("es-CL")}</TableCell>
                    <TableCell>{order.supplier_name || "-"}</TableCell>
                    <TableCell className="text-right font-mono">{formatUF(order.amount_uf)}</TableCell>
                    <TableCell>{getStatusBadge(order.status)}</TableCell>
                  </TableRow>
                  {expandedOrders.has(order.id) && (
                    <TableRow>
                      <TableCell colSpan={6} className="bg-muted/20 p-4">
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
                <Input type="date" value={newOrder.order_date} onChange={(e) => setNewOrder({ ...newOrder, order_date: e.target.value })} />
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
    </Card>
  );
};
