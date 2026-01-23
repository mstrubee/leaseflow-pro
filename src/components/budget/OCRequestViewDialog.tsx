import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Trash2, Plus, Calendar, Check, AlertCircle, Layers, ExternalLink, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SupplierSelect } from "@/components/suppliers/SupplierSelect";
import { format, isPast, isToday } from "date-fns";
import { es } from "date-fns/locale";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface OCRequest {
  id: string;
  request_number: string;
  request_date: string;
  line_name: string;
  project_name: string;
  description: string | null;
  amount_uf: number;
  amount_clp: number;
  supplier_id: string | null;
  supplier_name: string | null;
  status: "pending" | "converted";
  purchase_order_id: string | null;
  is_multi_contract?: boolean;
  quotation_url?: string | null;
  quotation_file_name?: string | null;
}

interface BudgetLineAssignment {
  id: string;
  budget_line_id: string;
  amount_uf: number;
  line_name?: string;
}

interface ContractAllocation {
  id: string;
  contract_id: string;
  contract_name: string;
  amount_uf: number;
  amount_clp: number;
}

interface PaymentPlan {
  id: string;
  payment_number: number;
  description: string | null;
  amount_uf: number;
  due_date: string | null;
  status: "pending" | "paid" | "overdue";
  paid_date: string | null;
}

interface OCRequestViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: string | null;
  formatUF: (value: number) => string;
  onRefresh?: () => void;
  readOnly?: boolean;
}

export const OCRequestViewDialog = ({
  open,
  onOpenChange,
  requestId,
  formatUF,
  onRefresh,
  readOnly = false
}: OCRequestViewDialogProps) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [request, setRequest] = useState<OCRequest | null>(null);
  const [budgetLines, setBudgetLines] = useState<BudgetLineAssignment[]>([]);
  const [contractAllocations, setContractAllocations] = useState<ContractAllocation[]>([]);
  const [paymentPlans, setPaymentPlans] = useState<PaymentPlan[]>([]);
  const [activeTab, setActiveTab] = useState("info");
  
  // Edit form state
  const [description, setDescription] = useState("");
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplierName, setSupplierName] = useState<string | null>(null);
  
  // New payment form
  const [newPayment, setNewPayment] = useState({ description: "", amount: "", due_date: "" });
  const [addingPayment, setAddingPayment] = useState(false);
  
  const { toast } = useToast();

  useEffect(() => {
    if (open && requestId) {
      loadRequest();
    }
  }, [open, requestId]);

  const loadRequest = async () => {
    if (!requestId) return;
    
    setLoading(true);
    try {
      // Load request data
      const { data: reqData, error: reqError } = await supabase
        .from("oc_requests")
        .select("*")
        .eq("id", requestId)
        .single();
      
      if (reqError) throw reqError;
      setRequest(reqData as OCRequest);
      setDescription(reqData.description || "");
      setSupplierId(reqData.supplier_id);
      setSupplierName(reqData.supplier_name);

      // Load budget line assignments
      const { data: linesData } = await supabase
        .from("oc_budget_lines")
        .select("id, budget_line_id, amount_uf")
        .eq("oc_request_id", requestId);
      
      // Get line names
      if (linesData && linesData.length > 0) {
        const lineIds = linesData.map(l => l.budget_line_id);
        const { data: lineNames } = await supabase
          .from("budget_lines")
          .select("id, name")
          .in("id", lineIds);
        
        const nameMap = new Map((lineNames || []).map(l => [l.id, l.name]));
        setBudgetLines(linesData.map(l => ({
          ...l,
          line_name: nameMap.get(l.budget_line_id) || "Línea desconocida"
        })));
      } else {
        setBudgetLines([]);
      }

      // Load contract allocations (multi-contract)
      const { data: allocationsData } = await supabase
        .from("oc_request_contract_allocations")
        .select("id, contract_id, amount_uf, amount_clp, contracts(name)")
        .eq("oc_request_id", requestId);
      
      if (allocationsData && allocationsData.length > 0) {
        setContractAllocations(allocationsData.map((a: any) => ({
          id: a.id,
          contract_id: a.contract_id,
          contract_name: a.contracts?.name || "Sin nombre",
          amount_uf: a.amount_uf || 0,
          amount_clp: a.amount_clp || 0,
        })));
      } else {
        setContractAllocations([]);
      }

      // Load payment plans
      const { data: plansData } = await supabase
        .from("oc_payment_plans")
        .select("*")
        .eq("oc_request_id", requestId)
        .order("payment_number");
      
      setPaymentPlans((plansData || []) as PaymentPlan[]);
    } catch (error) {
      console.error("Error loading request:", error);
      toast({ variant: "destructive", title: "Error", description: "No se pudo cargar la solicitud" });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!request) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from("oc_requests")
        .update({
          description,
          supplier_id: supplierId,
          supplier_name: supplierName
        })
        .eq("id", request.id);
      
      if (error) throw error;
      
      toast({ title: "Solicitud actualizada" });
      onRefresh?.();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleAddPayment = async () => {
    if (!request) return;
    
    const amount = parseFloat(newPayment.amount) || 0;
    if (amount <= 0) {
      toast({ variant: "destructive", title: "Error", description: "Ingrese un monto válido" });
      return;
    }

    setAddingPayment(true);
    try {
      const nextNumber = paymentPlans.length + 1;
      
      const { error } = await supabase.from("oc_payment_plans").insert({
        oc_request_id: request.id,
        payment_number: nextNumber,
        description: newPayment.description || `Pago ${nextNumber}`,
        amount_uf: amount,
        due_date: newPayment.due_date || null,
        status: "pending"
      });

      if (error) throw error;

      toast({ title: "Pago agregado" });
      setNewPayment({ description: "", amount: "", due_date: "" });
      loadRequest();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setAddingPayment(false);
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
      loadRequest();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const handleDeletePayment = async (id: string) => {
    try {
      await supabase.from("oc_payment_plans").delete().eq("id", id);
      toast({ title: "Pago eliminado" });
      loadRequest();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const getStatusBadge = (plan: PaymentPlan) => {
    if (plan.status === "paid") {
      return <Badge className="bg-green-500 text-[10px]">Pagado</Badge>;
    }
    if (plan.due_date && isPast(new Date(plan.due_date)) && !isToday(new Date(plan.due_date))) {
      return <Badge variant="destructive" className="text-[10px]">Vencido</Badge>;
    }
    return <Badge variant="secondary" className="text-[10px]">Pendiente</Badge>;
  };

  const handleNavigateToContract = (contractId: string) => {
    onOpenChange(false);
    navigate(`/contracts/${contractId}?section=ordenes-compra`);
  };

  const totalPlanned = paymentPlans.reduce((sum, p) => sum + p.amount_uf, 0);
  const totalPaid = paymentPlans.filter(p => p.status === "paid").reduce((sum, p) => sum + p.amount_uf, 0);
  const remaining = (request?.amount_uf || 0) - totalPlanned;

  const isMultiContract = contractAllocations.length > 0;
  const tabCount = isMultiContract ? 4 : 3;

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {request?.status === "converted" ? "Solicitud Convertida" : "Ver/Editar Solicitud de OC"}
            {isMultiContract && (
              <Badge variant="outline" className="text-xs gap-1">
                <Layers className="h-3 w-3" />
                Centralizado
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {request?.request_number}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : request ? (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className={`grid w-full ${isMultiContract ? 'grid-cols-4' : 'grid-cols-3'}`}>
              <TabsTrigger value="info">Información</TabsTrigger>
              {isMultiContract && (
                <TabsTrigger value="contracts" className="gap-1">
                  <Layers className="h-3 w-3" />
                  Contratos ({contractAllocations.length})
                </TabsTrigger>
              )}
              <TabsTrigger value="lines">Líneas ({budgetLines.length})</TabsTrigger>
              <TabsTrigger value="payments">Pagos ({paymentPlans.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="space-y-4 mt-4">
              {/* Status */}
              <div className="flex items-center gap-2">
                <Badge variant={request.status === "converted" ? "default" : "secondary"} 
                  className={request.status === "converted" ? "bg-green-500" : "bg-yellow-500"}>
                  {request.status === "converted" ? "Convertida a OC" : "Pendiente"}
                </Badge>
                {isMultiContract && (
                  <Badge variant="outline" className="text-xs">
                    Multi-contrato: {contractAllocations.length} locales
                  </Badge>
                )}
              </div>

              {/* Summary */}
              <div className="grid grid-cols-2 gap-4 p-3 bg-muted/50 rounded-lg">
                <div>
                  <p className="text-xs text-muted-foreground">Fecha</p>
                  <p className="font-medium">{format(new Date(request.request_date), 'dd/MM/yyyy', { locale: es })}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Monto Total</p>
                  <p className="font-medium">{formatUF(request.amount_uf)}</p>
                  {request.amount_clp > 0 && (
                    <p className="text-xs text-muted-foreground">
                      ${Math.round(request.amount_clp).toLocaleString("es-CL")} CLP
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Proyecto</p>
                  <p className="font-medium truncate">{request.project_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Línea(s)</p>
                  <p className="font-medium truncate">{request.line_name}</p>
                </div>
              </div>

              {/* Quotation file */}
              {request.quotation_url && (
                <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                  <FileText className="h-4 w-4 text-blue-600" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Archivo de cotización</p>
                    <p className="text-sm font-medium">{request.quotation_file_name || "Cotización adjunta"}</p>
                  </div>
                </div>
              )}

              {/* Editable fields */}
              {!readOnly && request.status === "pending" && (
                <>
                  <div className="space-y-2">
                    <Label>Descripción</Label>
                    <Input
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Descripción de la solicitud"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Proveedor</Label>
                    <SupplierSelect
                      value={supplierId}
                      onChange={(id, name) => {
                        setSupplierId(id);
                        setSupplierName(name);
                      }}
                    />
                  </div>

                  <Button onClick={handleSave} disabled={saving} className="gap-2">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Guardar Cambios
                  </Button>
                </>
              )}

              {(readOnly || request.status === "converted") && (
                <div className="space-y-2">
                  <div>
                    <Label className="text-muted-foreground">Descripción</Label>
                    <p>{request.description || "-"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Proveedor</Label>
                    <p>{request.supplier_name || "-"}</p>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Contracts Tab - Only for multi-contract */}
            {isMultiContract && (
              <TabsContent value="contracts" className="space-y-4 mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Asignación por Contrato</span>
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Contrato</TableHead>
                        <TableHead className="text-right">Monto (UF)</TableHead>
                        <TableHead className="text-right">Monto (CLP)</TableHead>
                        <TableHead className="text-right">% del Total</TableHead>
                        <TableHead className="w-[100px]">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contractAllocations.map((alloc) => {
                        const percentage = request.amount_uf > 0 
                          ? ((alloc.amount_uf / request.amount_uf) * 100).toFixed(1) 
                          : "0";
                        
                        return (
                          <TableRow key={alloc.id}>
                            <TableCell className="font-medium">
                              {alloc.contract_name}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatUF(alloc.amount_uf)}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              ${Math.round(alloc.amount_clp).toLocaleString("es-CL")}
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant="outline" className="text-xs">
                                {percentage}%
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleNavigateToContract(alloc.contract_id)}
                                className="h-7 px-2 gap-1"
                              >
                                <ExternalLink className="h-3 w-3" />
                                Ver
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Summary */}
                <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                  <span className="font-medium">Total Asignado</span>
                  <div className="text-right">
                    <span className="font-mono font-medium">
                      {formatUF(contractAllocations.reduce((sum, a) => sum + a.amount_uf, 0))}
                    </span>
                    <span className="text-muted-foreground text-sm ml-2">
                      (${Math.round(contractAllocations.reduce((sum, a) => sum + a.amount_clp, 0)).toLocaleString("es-CL")} CLP)
                    </span>
                  </div>
                </div>
              </TabsContent>
            )}

            <TabsContent value="lines" className="space-y-4 mt-4">
              {budgetLines.length > 0 ? (
                <div className="space-y-2">
                  {budgetLines.map((line) => (
                    <div key={line.id} className="flex justify-between items-center p-2 bg-muted/30 rounded">
                      <span className="text-sm">{line.line_name}</span>
                      <span className="font-mono text-sm">{formatUF(line.amount_uf)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center p-2 border-t font-medium">
                    <span>Total</span>
                    <span className="font-mono">{formatUF(request.amount_uf)}</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  Asignación simple a línea: {request.line_name}
                </div>
              )}
            </TabsContent>

            <TabsContent value="payments" className="space-y-4 mt-4">
              {/* Summary */}
              <div className="grid grid-cols-4 gap-2 p-3 bg-muted/50 rounded-lg text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Total Solicitud</p>
                  <p className="font-medium">{formatUF(request.amount_uf)}</p>
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

              {/* Payment list */}
              {paymentPlans.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead>Vencimiento</TableHead>
                      <TableHead>Estado</TableHead>
                      {!readOnly && request.status === "pending" && <TableHead className="text-right">Acciones</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentPlans.map((plan) => (
                      <TableRow key={plan.id}>
                        <TableCell className="font-mono">{plan.payment_number}</TableCell>
                        <TableCell>{plan.description || "-"}</TableCell>
                        <TableCell className="text-right">{formatUF(plan.amount_uf)}</TableCell>
                        <TableCell className="text-xs">
                          {plan.due_date ? format(new Date(plan.due_date), 'dd/MM/yyyy', { locale: es }) : "-"}
                        </TableCell>
                        <TableCell>{getStatusBadge(plan)}</TableCell>
                        {!readOnly && request.status === "pending" && (
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
                                onClick={() => handleDeletePayment(plan.id)} 
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
              )}

              {/* Add payment form */}
              {!readOnly && request.status === "pending" && (
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <Label>Agregar Pago</Label>
                  </div>
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-4 space-y-1">
                      <Label className="text-xs">Descripción</Label>
                      <Input
                        value={newPayment.description}
                        onChange={(e) => setNewPayment(prev => ({ ...prev, description: e.target.value }))}
                        placeholder={`Pago ${paymentPlans.length + 1}`}
                      />
                    </div>
                    <div className="col-span-3 space-y-1">
                      <Label className="text-xs">Monto (UF) *</Label>
                      <Input
                        type="number"
                        value={newPayment.amount}
                        onChange={(e) => setNewPayment(prev => ({ ...prev, amount: e.target.value }))}
                        placeholder="0.00"
                        step="0.01"
                      />
                    </div>
                    <div className="col-span-3 space-y-1">
                      <Label className="text-xs">Vencimiento (opcional)</Label>
                      <Input
                        type="date"
                        value={newPayment.due_date}
                        onChange={(e) => setNewPayment(prev => ({ ...prev, due_date: e.target.value }))}
                      />
                    </div>
                    <div className="col-span-2 flex items-end">
                      <Button 
                        size="sm" 
                        onClick={handleAddPayment} 
                        disabled={addingPayment}
                        className="w-full gap-1"
                      >
                        {addingPayment ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                        Agregar
                      </Button>
                    </div>
                  </div>
                  {remaining > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Sugerencia: quedan {formatUF(remaining)} sin planificar
                    </p>
                  )}
                </div>
              )}

              {paymentPlans.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-3">
                  No hay pagos planificados
                </p>
              )}
            </TabsContent>
          </Tabs>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
