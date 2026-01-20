import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, Calendar, Check, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, isPast, isToday } from "date-fns";
import { es } from "date-fns/locale";

interface PaymentPlan {
  id: string;
  payment_number: number;
  description: string | null;
  amount_uf: number;
  due_date: string | null;
  status: "pending" | "paid" | "overdue";
  paid_date: string | null;
}

interface PaymentPlanManagerProps {
  purchaseOrderId?: string;
  ocRequestId?: string;
  totalAmount: number;
  formatUF: (value: number) => string;
  readOnly?: boolean;
}

export const PaymentPlanManager = ({
  purchaseOrderId,
  ocRequestId,
  totalAmount,
  formatUF,
  readOnly = false
}: PaymentPlanManagerProps) => {
  const [plans, setPlans] = useState<PaymentPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [form, setForm] = useState({
    description: "",
    amount: "",
    due_date: ""
  });
  
  const { toast } = useToast();

  useEffect(() => {
    loadPlans();
  }, [purchaseOrderId, ocRequestId]);

  const loadPlans = async () => {
    if (!purchaseOrderId && !ocRequestId) return;
    
    setLoading(true);
    try {
      let query = supabase.from("oc_payment_plans").select("*");
      
      if (purchaseOrderId) {
        query = query.eq("purchase_order_id", purchaseOrderId);
      } else if (ocRequestId) {
        query = query.eq("oc_request_id", ocRequestId);
      }
      
      const { data, error } = await query.order("payment_number");
      
      if (error) throw error;
      setPlans((data || []) as PaymentPlan[]);
    } catch (error) {
      console.error("Error loading payment plans:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    const amount = parseFloat(form.amount) || 0;
    if (amount <= 0) {
      toast({ variant: "destructive", title: "Error", description: "Ingrese un monto válido" });
      return;
    }

    setSaving(true);
    try {
      const nextNumber = plans.length + 1;
      
      const { error } = await supabase.from("oc_payment_plans").insert({
        purchase_order_id: purchaseOrderId || null,
        oc_request_id: ocRequestId || null,
        payment_number: nextNumber,
        description: form.description || `Pago ${nextNumber}`,
        amount_uf: amount,
        due_date: form.due_date || null,
        status: "pending"
      });

      if (error) throw error;

      toast({ title: "Pago agregado" });
      setShowAddDialog(false);
      setForm({ description: "", amount: "", due_date: "" });
      loadPlans();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleMarkPaid = async (id: string) => {
    try {
      await supabase
        .from("oc_payment_plans")
        .update({ 
          status: "paid", 
          paid_date: new Date().toISOString().split('T')[0] 
        })
        .eq("id", id);

      toast({ title: "Pago marcado como pagado" });
      loadPlans();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await supabase.from("oc_payment_plans").delete().eq("id", id);
      toast({ title: "Pago eliminado" });
      loadPlans();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const totalPlanned = plans.reduce((sum, p) => sum + p.amount_uf, 0);
  const totalPaid = plans.filter(p => p.status === "paid").reduce((sum, p) => sum + p.amount_uf, 0);
  const remaining = totalAmount - totalPlanned;

  const getStatusBadge = (plan: PaymentPlan) => {
    if (plan.status === "paid") {
      return <Badge className="bg-green-500 text-[10px]">Pagado</Badge>;
    }
    if (plan.due_date && isPast(new Date(plan.due_date)) && !isToday(new Date(plan.due_date))) {
      return <Badge variant="destructive" className="text-[10px]">Vencido</Badge>;
    }
    return <Badge variant="secondary" className="text-[10px]">Pendiente</Badge>;
  };

  if (loading) {
    return <div className="flex items-center justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Plan de Pagos
        </h4>
        {!readOnly && (
          <Button size="sm" variant="outline" onClick={() => setShowAddDialog(true)} className="gap-1">
            <Plus className="h-3 w-3" />
            Agregar Pago
          </Button>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-2 p-3 bg-muted/50 rounded-lg text-sm">
        <div>
          <p className="text-muted-foreground text-xs">Total OC</p>
          <p className="font-medium">{formatUF(totalAmount)}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Planificado</p>
          <p className="font-medium">{formatUF(totalPlanned)}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Pagado</p>
          <p className="font-medium text-green-600">{formatUF(totalPaid)}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Sin Planificar</p>
          <p className={`font-medium ${remaining > 0 ? "text-yellow-600" : remaining < 0 ? "text-destructive" : ""}`}>
            {formatUF(remaining)}
          </p>
        </div>
      </div>

      {remaining < 0 && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          Los pagos planificados exceden el monto total
        </div>
      )}

      {plans.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Vencimiento</TableHead>
              <TableHead>Estado</TableHead>
              {!readOnly && <TableHead className="text-right">Acciones</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.map((plan) => (
              <TableRow key={plan.id}>
                <TableCell className="font-mono">{plan.payment_number}</TableCell>
                <TableCell>{plan.description || "-"}</TableCell>
                <TableCell className="text-right">{formatUF(plan.amount_uf)}</TableCell>
                <TableCell className="text-xs">
                  {plan.due_date ? format(new Date(plan.due_date), 'dd/MM/yyyy', { locale: es }) : "-"}
                </TableCell>
                <TableCell>{getStatusBadge(plan)}</TableCell>
                {!readOnly && (
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {plan.status !== "paid" && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleMarkPaid(plan.id)} 
                          className="h-6 px-2"
                          title="Marcar como pagado"
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                      )}
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleDelete(plan.id)} 
                        className="h-6 px-2 text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-3">
          No hay pagos planificados
        </p>
      )}

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar Pago al Plan</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder={`Pago ${plans.length + 1}`}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Monto (UF) *</Label>
                <Input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm(prev => ({ ...prev, amount: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Fecha de Vencimiento</Label>
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm(prev => ({ ...prev, due_date: e.target.value }))}
                />
              </div>
            </div>
            {remaining > 0 && (
              <p className="text-sm text-muted-foreground">
                Sugerencia: quedan {formatUF(remaining)} sin planificar
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancelar</Button>
            <Button onClick={handleAdd} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
