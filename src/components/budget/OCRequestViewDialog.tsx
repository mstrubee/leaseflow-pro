import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Trash2, Plus, Calendar, Check, AlertCircle, Layers, ExternalLink, FileText, Pencil, X, Wrench } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SupplierSelect } from "@/components/suppliers/SupplierSelect";
import { format, isPast, isToday } from "date-fns";
import { es } from "date-fns/locale";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface OCRequest {
  id: string;
  contract_id: string;
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

interface EditableAllocation {
  id?: string;
  contract_id: string;
  contract_name: string;
  amount_uf: number;
  isNew?: boolean;
}

interface FormAssignment {
  id?: string;
  maintenance_form_id: string | null;
  form_number: string;
  amount_uf: number;
  description: string;
  isNew?: boolean;
}

interface AvailableForm {
  id: string;
  form_number: string;
  general_description: string | null;
  electrical_description: string | null;
  civil_description: string | null;
  hvac_description: string | null;
  fixed_assets_description: string | null;
  created_date: string | null;
}

interface Contract {
  id: string;
  name: string;
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
  ufValue?: number;
}

export const OCRequestViewDialog = ({
  open,
  onOpenChange,
  requestId,
  formatUF,
  onRefresh,
  readOnly = false,
  ufValue = 39700
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

  // Contract allocations edit state
  const [isEditingAllocations, setIsEditingAllocations] = useState(false);
  const [editableAllocations, setEditableAllocations] = useState<EditableAllocation[]>([]);
  const [availableContracts, setAvailableContracts] = useState<Contract[]>([]);
  const [savingAllocations, setSavingAllocations] = useState(false);

  // Form assignments state
  const [formAssignments, setFormAssignments] = useState<FormAssignment[]>([]);
  const [availableForms, setAvailableForms] = useState<AvailableForm[]>([]);
  const [savingForms, setSavingForms] = useState(false);
  const [loadingForms, setLoadingForms] = useState(false);
  
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

      // Load form assignments
      const { data: formsData } = await supabase
        .from("oc_request_forms")
        .select("id, maintenance_form_id, amount_uf, amount_clp, description")
        .eq("oc_request_id", requestId);
      
      if (formsData && formsData.length > 0) {
        // Get form numbers
        const formIds = formsData.filter(f => f.maintenance_form_id).map(f => f.maintenance_form_id);
        let formNumberMap = new Map<string, string>();
        if (formIds.length > 0) {
          const { data: formNames } = await (supabase.from("maintenance_forms" as any) as any)
            .select("id, form_number")
            .in("id", formIds);
          formNames?.forEach((f: any) => formNumberMap.set(f.id, f.form_number));
        }
        setFormAssignments(formsData.map(f => ({
          id: f.id,
          maintenance_form_id: f.maintenance_form_id,
          form_number: f.maintenance_form_id ? formNumberMap.get(f.maintenance_form_id) || "?" : "",
          amount_uf: f.amount_uf || 0,
          description: f.description || "",
        })));
      } else {
        setFormAssignments([]);
      }
    } catch (error) {
      console.error("Error loading request:", error);
      toast({ variant: "destructive", title: "Error", description: "No se pudo cargar la solicitud" });
    } finally {
      setLoading(false);
    }
  };

  // Load all contracts for allocation editing
  const loadContracts = async () => {
    const { data } = await supabase
      .from("contracts")
      .select("id, name")
      .is("deleted_at", null)
      .order("name");
    setAvailableContracts(data || []);
  };

  // Start editing allocations
  const handleStartEditAllocations = () => {
    loadContracts();
    setEditableAllocations(
      contractAllocations.map(a => ({
        id: a.id,
        contract_id: a.contract_id,
        contract_name: a.contract_name,
        amount_uf: a.amount_uf
      }))
    );
    setIsEditingAllocations(true);
  };

  // Cancel editing
  const handleCancelEditAllocations = () => {
    setIsEditingAllocations(false);
    setEditableAllocations([]);
  };

  // Add new allocation
  const handleAddAllocation = () => {
    const usedContractIds = editableAllocations.map(a => a.contract_id);
    const availableContract = availableContracts.find(c => !usedContractIds.includes(c.id));
    
    if (availableContract) {
      setEditableAllocations(prev => [
        ...prev,
        {
          contract_id: availableContract.id,
          contract_name: availableContract.name,
          amount_uf: 0,
          isNew: true
        }
      ]);
    } else {
      toast({ variant: "destructive", title: "Sin contratos disponibles", description: "Todos los contratos ya están asignados" });
    }
  };

  // Update allocation
  const handleUpdateAllocation = (index: number, field: "contract_id" | "amount_uf", value: any) => {
    setEditableAllocations(prev => {
      const updated = [...prev];
      if (field === "contract_id") {
        const contract = availableContracts.find(c => c.id === value);
        updated[index] = { ...updated[index], contract_id: value, contract_name: contract?.name || "" };
      } else {
        updated[index] = { ...updated[index], amount_uf: parseFloat(value) || 0 };
      }
      return updated;
    });
  };

  // Remove allocation
  const handleRemoveAllocation = (index: number) => {
    setEditableAllocations(prev => prev.filter((_, i) => i !== index));
  };

  // Save allocations
  const handleSaveAllocations = async () => {
    if (!request) return;

    // Validate
    if (editableAllocations.length === 0) {
      toast({ variant: "destructive", title: "Error", description: "Debe asignar al menos un contrato" });
      return;
    }

    const totalAllocated = editableAllocations.reduce((sum, a) => sum + a.amount_uf, 0);
    const tolerance = 0.01;
    if (Math.abs(totalAllocated - request.amount_uf) > tolerance) {
      toast({ 
        variant: "destructive", 
        title: "Error de distribución", 
        description: `El total asignado (${formatUF(totalAllocated)}) no coincide con el monto total (${formatUF(request.amount_uf)})` 
      });
      return;
    }

    setSavingAllocations(true);
    try {
      // Delete existing allocations
      await supabase
        .from("oc_request_contract_allocations")
        .delete()
        .eq("oc_request_id", request.id);

      // Insert new allocations
      const allocations = editableAllocations.map(a => ({
        oc_request_id: request.id,
        contract_id: a.contract_id,
        amount_uf: Math.round(a.amount_uf * 10000) / 10000,
        amount_clp: Math.round(a.amount_uf * ufValue)
      }));

      const { error } = await supabase
        .from("oc_request_contract_allocations")
        .insert(allocations);

      if (error) throw error;

      toast({ title: "Asignaciones actualizadas" });
      setIsEditingAllocations(false);
      loadRequest();
      onRefresh?.();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setSavingAllocations(false);
    }
  };

  // Load available maintenance forms for the contract
  const loadAvailableForms = async () => {
    if (!request) return;
    setLoadingForms(true);
    try {
      const { data } = await (supabase.from("maintenance_forms" as any) as any)
        .select("id, form_number, general_description, electrical_description, civil_description, hvac_description, fixed_assets_description, created_date")
        .eq("contract_id", request.contract_id || "")
        .eq("status", "proceso")
        .is("deleted_at", null)
        .order("created_date", { ascending: false });
      setAvailableForms(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingForms(false);
    }
  };

  const handleAddFormAssignment = () => {
    setFormAssignments(prev => [
      ...prev,
      { maintenance_form_id: null, form_number: "", amount_uf: 0, description: "", isNew: true }
    ]);
  };

  const handleRemoveFormAssignment = (index: number) => {
    setFormAssignments(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateFormAssignment = (index: number, field: keyof FormAssignment, value: any) => {
    setFormAssignments(prev => {
      const updated = [...prev];
      if (field === "maintenance_form_id") {
        if (value === "__none__") {
          updated[index] = { ...updated[index], maintenance_form_id: null, form_number: "" };
        } else {
          const form = availableForms.find(f => f.id === value);
          const desc = form ? (form.general_description || form.electrical_description || form.civil_description || form.hvac_description || form.fixed_assets_description || "") : "";
          updated[index] = { 
            ...updated[index], 
            maintenance_form_id: value, 
            form_number: form?.form_number || "",
            description: updated[index].description || desc
          };
        }
      } else if (field === "amount_uf") {
        updated[index] = { ...updated[index], amount_uf: parseFloat(value) || 0 };
      } else if (field === "description") {
        updated[index] = { ...updated[index], description: value };
      }
      return updated;
    });
  };

  const handleSaveFormAssignments = async () => {
    if (!request) return;

    // Validate: items without form must have description
    for (const fa of formAssignments) {
      if (!fa.maintenance_form_id && !fa.description.trim()) {
        toast({ variant: "destructive", title: "Error", description: "Los items sin FORM deben tener una descripción" });
        return;
      }
      if (fa.amount_uf <= 0) {
        toast({ variant: "destructive", title: "Error", description: "Todos los items deben tener un monto mayor a 0" });
        return;
      }
    }

    setSavingForms(true);
    try {
      // Delete existing
      await supabase.from("oc_request_forms").delete().eq("oc_request_id", request.id);

      // Insert all
      if (formAssignments.length > 0) {
        const inserts = formAssignments.map(fa => ({
          oc_request_id: request.id,
          maintenance_form_id: fa.maintenance_form_id,
          amount_uf: Math.round(fa.amount_uf * 10000) / 10000,
          amount_clp: Math.round(fa.amount_uf * ufValue),
          description: fa.description || null
        }));
        const { error } = await supabase.from("oc_request_forms").insert(inserts);
        if (error) throw error;
      }

      toast({ title: "FORMs actualizados" });
      loadRequest();
      onRefresh?.();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setSavingForms(false);
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
            <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${(isMultiContract ? 4 : 3) + 1}, minmax(0, 1fr))` }}>
              <TabsTrigger value="info">Información</TabsTrigger>
              {isMultiContract && (
                <TabsTrigger value="contracts" className="gap-1">
                  <Layers className="h-3 w-3" />
                  Contratos ({contractAllocations.length})
                </TabsTrigger>
              )}
              <TabsTrigger value="forms" className="gap-1" onClick={() => { if (availableForms.length === 0) loadAvailableForms(); }}>
                <Wrench className="h-3 w-3" />
                FORMs ({formAssignments.length})
              </TabsTrigger>
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
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Asignación por Contrato</span>
                  </div>
                  {!readOnly && request.status === "pending" && !isEditingAllocations && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleStartEditAllocations}
                      className="gap-1"
                    >
                      <Pencil className="h-3 w-3" />
                      Editar
                    </Button>
                  )}
                  {isEditingAllocations && (
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleCancelEditAllocations}
                        className="gap-1"
                      >
                        <X className="h-3 w-3" />
                        Cancelar
                      </Button>
                      <Button 
                        size="sm" 
                        onClick={handleSaveAllocations}
                        disabled={savingAllocations}
                        className="gap-1"
                      >
                        {savingAllocations ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        Guardar
                      </Button>
                    </div>
                  )}
                </div>

                {/* View Mode */}
                {!isEditingAllocations && (
                  <>
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
                  </>
                )}

                {/* Edit Mode */}
                {isEditingAllocations && (
                  <>
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Contrato</TableHead>
                            <TableHead className="text-right w-[150px]">Monto (UF)</TableHead>
                            <TableHead className="text-right">% del Total</TableHead>
                            <TableHead className="w-[80px]">Acciones</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {editableAllocations.map((alloc, index) => {
                            const percentage = request.amount_uf > 0 
                              ? ((alloc.amount_uf / request.amount_uf) * 100).toFixed(1) 
                              : "0";
                            const usedContractIds = editableAllocations.filter((_, i) => i !== index).map(a => a.contract_id);
                            const availableForThisRow = availableContracts.filter(
                              c => c.id === alloc.contract_id || !usedContractIds.includes(c.id)
                            );
                            
                            return (
                              <TableRow key={alloc.id || `new-${index}`}>
                                <TableCell>
                                  <Select
                                    value={alloc.contract_id}
                                    onValueChange={(value) => handleUpdateAllocation(index, "contract_id", value)}
                                  >
                                    <SelectTrigger className="h-8">
                                      <SelectValue placeholder="Seleccionar contrato" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {availableForThisRow.map(contract => (
                                        <SelectItem key={contract.id} value={contract.id}>
                                          {contract.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell className="text-right">
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={alloc.amount_uf || ""}
                                    onChange={(e) => handleUpdateAllocation(index, "amount_uf", e.target.value)}
                                    className="h-8 text-right font-mono w-[130px]"
                                    placeholder="0.00"
                                  />
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
                                    onClick={() => handleRemoveAllocation(index)}
                                    className="h-7 px-2 text-destructive hover:text-destructive"
                                    disabled={editableAllocations.length <= 1}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Add button */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAddAllocation}
                      className="gap-1"
                      disabled={editableAllocations.length >= availableContracts.length}
                    >
                      <Plus className="h-3 w-3" />
                      Agregar Contrato
                    </Button>

                    {/* Edit Summary */}
                    {(() => {
                      const totalEditable = editableAllocations.reduce((sum, a) => sum + a.amount_uf, 0);
                      const diff = request.amount_uf - totalEditable;
                      const isBalanced = Math.abs(diff) < 0.01;
                      
                      return (
                        <div className={`flex justify-between items-center p-3 rounded-lg ${isBalanced ? 'bg-green-50 dark:bg-green-950/30' : 'bg-yellow-50 dark:bg-yellow-950/30'}`}>
                          <div className="flex flex-col">
                            <span className="font-medium">Total Asignado</span>
                            {!isBalanced && (
                              <span className="text-xs text-yellow-600 dark:text-yellow-400">
                                {diff > 0 ? `Faltan ${formatUF(diff)} por asignar` : `Exceso de ${formatUF(Math.abs(diff))}`}
                              </span>
                            )}
                          </div>
                          <div className="text-right">
                            <span className={`font-mono font-medium ${isBalanced ? 'text-green-600' : 'text-yellow-600'}`}>
                              {formatUF(totalEditable)}
                            </span>
                            <span className="text-muted-foreground text-sm ml-2">
                              / {formatUF(request.amount_uf)}
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
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

            {/* FORMs Tab */}
            <TabsContent value="forms" className="space-y-4 mt-4">
              {loadingForms ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : (
                <>
                  {formAssignments.length > 0 && (
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>FORM</TableHead>
                            <TableHead>Descripción</TableHead>
                            <TableHead className="text-right w-[130px]">Monto (UF)</TableHead>
                            {!readOnly && request.status === "pending" && <TableHead className="w-[60px]" />}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {formAssignments.map((fa, index) => {
                            const usedFormIds = formAssignments.filter((_, i) => i !== index).map(f => f.maintenance_form_id).filter(Boolean);
                            const formsForRow = availableForms.filter(f => f.id === fa.maintenance_form_id || !usedFormIds.includes(f.id));
                            
                            return (
                              <TableRow key={fa.id || `new-${index}`}>
                                <TableCell className="w-[180px]">
                                  {!readOnly && request.status === "pending" ? (
                                    <Select
                                      value={fa.maintenance_form_id || "__none__"}
                                      onValueChange={(v) => handleUpdateFormAssignment(index, "maintenance_form_id", v)}
                                    >
                                      <SelectTrigger className="h-8 text-xs">
                                        <SelectValue placeholder="Sin FORM" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="__none__">Sin FORM (libre)</SelectItem>
                                        {formsForRow.map(f => (
                                          <SelectItem key={f.id} value={f.id}>
                                            FORM {f.form_number}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <span className="font-mono text-sm">
                                      {fa.form_number ? `FORM ${fa.form_number}` : "Sin FORM"}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {!readOnly && request.status === "pending" ? (
                                    <Input
                                      value={fa.description}
                                      onChange={(e) => handleUpdateFormAssignment(index, "description", e.target.value)}
                                      placeholder="Descripción del item"
                                      className="h-8 text-xs"
                                    />
                                  ) : (
                                    <span className="text-sm">{fa.description || "-"}</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  {!readOnly && request.status === "pending" ? (
                                    <Input
                                      type="number"
                                      step="0.01"
                                      value={fa.amount_uf || ""}
                                      onChange={(e) => handleUpdateFormAssignment(index, "amount_uf", e.target.value)}
                                      className="h-8 text-right font-mono w-[120px] text-xs"
                                      placeholder="0.00"
                                    />
                                  ) : (
                                    <span className="font-mono text-sm">{formatUF(fa.amount_uf)}</span>
                                  )}
                                </TableCell>
                                {!readOnly && request.status === "pending" && (
                                  <TableCell>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleRemoveFormAssignment(index)}
                                      className="h-7 px-2 text-destructive hover:text-destructive"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </TableCell>
                                )}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  {formAssignments.length === 0 && (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                      No hay FORMs asignados a esta solicitud
                    </div>
                  )}

                  {/* Summary */}
                  {formAssignments.length > 0 && (
                    <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                      <span className="font-medium text-sm">Total FORMs</span>
                      <span className="font-mono font-medium">
                        {formatUF(formAssignments.reduce((sum, fa) => sum + fa.amount_uf, 0))}
                      </span>
                    </div>
                  )}

                  {/* Actions */}
                  {!readOnly && request.status === "pending" && (
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={handleAddFormAssignment} className="gap-1">
                        <Plus className="h-3 w-3" />
                        Agregar Item
                      </Button>
                      {formAssignments.length > 0 && (
                        <Button size="sm" onClick={handleSaveFormAssignments} disabled={savingForms} className="gap-1">
                          {savingForms ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                          Guardar FORMs
                        </Button>
                      )}
                    </div>
                  )}
                </>
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
