import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, ShoppingCart, Trash2, Edit2, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useBudgetContext } from "./BudgetContext";

interface PurchaseItem {
  id: string;
  item_name: string;
  quantity: number;
  description: string | null;
  supplier_name: string | null;
  request_date: string | null;
  delivery_date: string | null;
  amount_uf: number;
  year: number;
  purchase_order_id: string | null;
}

interface PurchaseItemsModuleProps {
  contractId: string;
}

export const PurchaseItemsModule = ({ contractId }: PurchaseItemsModuleProps) => {
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({
    item_name: "",
    quantity: "1",
    description: "",
    supplier_name: "",
    request_date: new Date().toISOString().split("T")[0],
    delivery_date: "",
    amount_uf: "",
  });
  const { toast } = useToast();
  const { formatUF, formatCLP, convertUFToPesos } = useBudgetContext();

  useEffect(() => {
    loadItems();
  }, [contractId, selectedYear]);

  const loadItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("purchase_items")
        .select("*")
        .eq("contract_id", contractId)
        .eq("year", selectedYear)
        .order("request_date", { ascending: false });

      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error("Error loading items:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateItem = async () => {
    try {
      const { error } = await supabase.from("purchase_items").insert({
        contract_id: contractId,
        item_name: newItem.item_name,
        quantity: parseInt(newItem.quantity) || 1,
        description: newItem.description || null,
        supplier_name: newItem.supplier_name || null,
        request_date: newItem.request_date || null,
        delivery_date: newItem.delivery_date || null,
        amount_uf: parseFloat(newItem.amount_uf) || 0,
        year: selectedYear,
      });

      if (error) throw error;

      toast({ title: "Ítem agregado" });
      setShowNewDialog(false);
      resetNewItem();
      loadItems();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const resetNewItem = () => {
    setNewItem({
      item_name: "",
      quantity: "1",
      description: "",
      supplier_name: "",
      request_date: new Date().toISOString().split("T")[0],
      delivery_date: "",
      amount_uf: "",
    });
  };

  const handleDeleteItem = async (id: string) => {
    try {
      await supabase.from("purchase_items").delete().eq("id", id);
      loadItems();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
  const totalAmount = items.reduce((sum, item) => sum + item.amount_uf, 0);

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
          <ShoppingCart className="h-5 w-5" />
          Listado de Compras
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
            Nuevo Ítem
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 p-3 bg-muted/30 rounded-lg flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Total Compras {selectedYear}</span>
          <div className="text-right">
            <p className="font-bold">{formatUF(totalAmount)}</p>
            <p className="text-xs text-muted-foreground">{formatCLP(convertUFToPesos(totalAmount))}</p>
          </div>
        </div>

        {items.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No hay ítems de compra para {selectedYear}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ítem</TableHead>
                  <TableHead className="text-center">Cant.</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>F. Solicitud</TableHead>
                  <TableHead>F. Entrega</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.item_name}</TableCell>
                    <TableCell className="text-center">{item.quantity}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{item.description || "-"}</TableCell>
                    <TableCell>{item.supplier_name || "-"}</TableCell>
                    <TableCell>{item.request_date ? new Date(item.request_date).toLocaleDateString("es-CL") : "-"}</TableCell>
                    <TableCell>{item.delivery_date ? new Date(item.delivery_date).toLocaleDateString("es-CL") : "-"}</TableCell>
                    <TableCell className="text-right font-mono">{formatUF(item.amount_uf)}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => handleDeleteItem(item.id)} className="text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo Ítem de Compra</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Ítem / Detalle</Label>
                <Input value={newItem.item_name} onChange={(e) => setNewItem({ ...newItem, item_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Cantidad</Label>
                <Input type="number" value={newItem.quantity} onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Input value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Proveedor</Label>
                <Input value={newItem.supplier_name} onChange={(e) => setNewItem({ ...newItem, supplier_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Monto Neto (UF)</Label>
                <Input type="number" step="0.01" value={newItem.amount_uf} onChange={(e) => setNewItem({ ...newItem, amount_uf: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fecha Solicitud</Label>
                <Input type="date" value={newItem.request_date} onChange={(e) => setNewItem({ ...newItem, request_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Fecha Entrega</Label>
                <Input type="date" value={newItem.delivery_date} onChange={(e) => setNewItem({ ...newItem, delivery_date: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreateItem}>Agregar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
