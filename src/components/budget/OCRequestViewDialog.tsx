import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Trash2, Plus, Calendar, AlertCircle, Layers, ExternalLink, FileText, Pencil, X, Wrench } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SupplierSelect } from "@/components/suppliers/SupplierSelect";
import { format, isPast, isToday } from "date-fns";
import { es } from "date-fns/locale";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCLP } from "@/lib/utils";
import { MultipleLinesSelector } from "./MultipleLinesSelector";

interface OCRequest {
  id: string;
  contract_id: string;
  budget_id: string | null;
  budget_line_id: string | null;
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
  uf_value_at_entry?: number;
}

interface EditableLine {
  lineId: string;
  lineName: string;
  amount: number;
  maxAmount: number;
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

// Helper: get effective UF value for this request
const getEffectiveUf = (request: OCRequest | null, fallbackUf: number) =>
  request?.uf_value_at_entry || fallbackUf;

// Helper: convert UF to CLP using request's locked UF
const ufToClp = (uf: number, request: OCRequest | null, fallbackUf: number) =>
  Math.round(uf * getEffectiveUf(request, fallbackUf));

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
  // Techo para "Monto Total": suma del disponible real de la(s) línea(s)
  // asignada(s) (excluyendo el consumo de esta misma solicitud). null = sin
  // línea asignada aún, no se puede acotar.
  const [maxTotalUf, setMaxTotalUf] = useState<number | null>(null);
  const [contractAllocations, setContractAllocations] = useState<ContractAllocation[]>([]);
  const [paymentPlans, setPaymentPlans] = useState<PaymentPlan[]>([]);
  const [activeTab, setActiveTab] = useState("info");
  
  // Edit form state
  const [description, setDescription] = useState("");
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplierName, setSupplierName] = useState<string | null>(null);
  
  // New payment form
  const [newPayment, setNewPayment] = useState({ description: "", amount: "", due_date: "", input_mode: "clp" as "clp" | "percent" | "balance" });
  const [addingPayment, setAddingPayment] = useState(false);

  // Contract allocations edit state
  const [isEditingAllocations, setIsEditingAllocations] = useState(false);
  const [editableAllocations, setEditableAllocations] = useState<EditableAllocation[]>([]);
  const [availableContracts, setAvailableContracts] = useState<Contract[]>([]);
  const [savingAllocations, setSavingAllocations] = useState(false);

  // Budget line assignment edit state
  const [isEditingLines, setIsEditingLines] = useState(false);
  const [editableLines, setEditableLines] = useState<EditableLine[]>([]);
  const [savingLines, setSavingLines] = useState(false);

  // Form assignments state
  const [formAssignments, setFormAssignments] = useState<FormAssignment[]>([]);
  const [availableForms, setAvailableForms] = useState<AvailableForm[]>([]);
  const [savingForms, setSavingForms] = useState(false);
  const [loadingForms, setLoadingForms] = useState(false);

  // Inline editing state for payments
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [editingPaymentField, setEditingPaymentField] = useState<"description" | "amount" | null>(null);
  const [editingPaymentValue, setEditingPaymentValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  // Inline editing for total amount
  const [editingTotalAmount, setEditingTotalAmount] = useState(false);
  const [editingTotalValue, setEditingTotalValue] = useState("");
  const totalAmountInputRef = useRef<HTMLInputElement>(null);
  
  const { toast } = useToast();

  useEffect(() => {
    if (open && requestId) {
      loadRequest();
    }
  }, [open, requestId]);

  // Focus input when inline editing starts
  useEffect(() => {
    if (editingPaymentId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingPaymentId, editingPaymentField]);

  useEffect(() => {
    if (editingTotalAmount && totalAmountInputRef.current) {
      totalAmountInputRef.current.focus();
      totalAmountInputRef.current.select();
    }
  }, [editingTotalAmount]);

  const loadRequest = async () => {
    if (!requestId) return;
    
    setLoading(true);
    try {
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

      // Techo del monto total: suma del disponible real de la(s) línea(s)
      // asignada(s), excluyendo el consumo de esta misma solicitud (si no,
      // se restaría a sí misma y el techo quedaría subestimado).
      const assignedLineIds = linesData && linesData.length > 0
        ? linesData.map(l => l.budget_line_id)
        : (reqData.budget_line_id ? [reqData.budget_line_id] : []);

      if (assignedLineIds.length > 0) {
        const [{ data: lineRows }, { data: poRows }, { data: reqRows }] = await Promise.all([
          supabase.from("budget_lines").select("id, amount_uf").in("id", assignedLineIds),
          supabase.from("purchase_orders").select("amount_uf, budget_line_id").in("budget_line_id", assignedLineIds).is("deleted_at", null),
          supabase.from("oc_requests").select("id, amount_uf, budget_line_id").in("budget_line_id", assignedLineIds).eq("status", "pending"),
        ]);
        let ceiling = 0;
        for (const line of lineRows || []) {
          const usedByOC = (poRows || []).filter(p => p.budget_line_id === line.id).reduce((s, p) => s + p.amount_uf, 0);
          const usedByOtherRequests = (reqRows || [])
            .filter(r => r.budget_line_id === line.id && r.id !== requestId)
            .reduce((s, r) => s + r.amount_uf, 0);
          ceiling += Math.max(0, line.amount_uf - usedByOC - usedByOtherRequests);
        }
        setMaxTotalUf(Math.round(ceiling * 10000) / 10000);
      } else {
        setMaxTotalUf(null);
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

  const handleCancelEditAllocations = () => {
    setIsEditingAllocations(false);
    setEditableAllocations([]);
  };

  const handleAddAllocation = () => {
    const usedContractIds = editableAllocations.map(a => a.contract_id);
    const availableContract = availableContracts.find(c => !usedContractIds.includes(c.id));
    
    if (availableContract) {
      setEditableAllocations(prev => [
        ...prev,
        { contract_id: availableContract.id, contract_name: availableContract.name, amount_uf: 0, isNew: true }
      ]);
    } else {
      toast({ variant: "destructive", title: "Sin contratos disponibles", description: "Todos los contratos ya están asignados" });
    }
  };

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

  const handleRemoveAllocation = (index: number) => {
    setEditableAllocations(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveAllocations = async () => {
    if (!request) return;

    if (editableAllocations.length === 0) {
      toast({ variant: "destructive", title: "Error", description: "Debe asignar al menos un contrato" });
      return;
    }

    const totalAllocated = editableAllocations.reduce((sum, a) => sum + a.amount_uf, 0);
    const tolerance = 0.01;
    if (Math.abs(totalAllocated - request.amount_uf) > tolerance) {
      const effectiveUf = getEffectiveUf(request, ufValue);
      toast({ 
        variant: "destructive", 
        title: "Error de distribución", 
        description: `El total asignado (${formatCLP(totalAllocated * effectiveUf)}) no coincide con el monto total (${formatCLP(request.amount_clp || request.amount_uf * effectiveUf)})` 
      });
      return;
    }

    setSavingAllocations(true);
    try {
      await supabase
        .from("oc_request_contract_allocations")
        .delete()
        .eq("oc_request_id", request.id);

      const effectiveUf = getEffectiveUf(request, ufValue);
      const allocations = editableAllocations.map(a => ({
        oc_request_id: request.id,
        contract_id: a.contract_id,
        amount_uf: Math.round(a.amount_uf * 10000) / 10000,
        amount_clp: Math.round(a.amount_uf * effectiveUf)
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

  // Start editing the budget line assignment — precarga la asignación actual,
  // sea simple (budget_line_id directo) o múltiple (oc_budget_lines), con su
  // monto actual. MultipleLinesSelector corrige maxAmount apenas calcula el
  // disponible real (excluyendo el consumo de esta misma solicitud).
  const handleStartEditLines = () => {
    if (!request) return;
    if (budgetLines.length > 0) {
      setEditableLines(budgetLines.map(l => ({
        lineId: l.budget_line_id,
        lineName: l.line_name || "Línea desconocida",
        amount: l.amount_uf,
        maxAmount: l.amount_uf,
      })));
    } else if (request.budget_line_id) {
      setEditableLines([{
        lineId: request.budget_line_id,
        lineName: request.line_name,
        amount: request.amount_uf,
        maxAmount: request.amount_uf,
      }]);
    } else {
      setEditableLines([]);
    }
    setIsEditingLines(true);
  };

  const handleCancelEditLines = () => {
    setIsEditingLines(false);
    setEditableLines([]);
  };

  const handleSaveLines = async () => {
    if (!request) return;

    const validLines = editableLines.filter(l => l.lineId && l.amount > 0);
    if (validLines.length === 0) {
      toast({ variant: "destructive", title: "Error", description: "Debe asignar al menos una línea de presupuesto" });
      return;
    }

    const totalAssigned = validLines.reduce((sum, l) => sum + l.amount, 0);
    const tolerance = 0.01;
    if (Math.abs(totalAssigned - request.amount_uf) > tolerance) {
      toast({
        variant: "destructive",
        title: "Error de distribución",
        description: `El total asignado (${formatUF(totalAssigned)}) no coincide con el monto total de la solicitud (${formatUF(request.amount_uf)})`,
      });
      return;
    }

    setSavingLines(true);
    try {
      // Limpiar siempre la tabla puente primero — evita dejar filas residuales
      // sin importar si el resultado final es asignación simple o múltiple.
      await supabase.from("oc_budget_lines").delete().eq("oc_request_id", request.id);

      if (validLines.length === 1) {
        const { error } = await supabase
          .from("oc_requests")
          .update({ budget_line_id: validLines[0].lineId, line_name: validLines[0].lineName })
          .eq("id", request.id);
        if (error) throw error;
      } else {
        const { error: clearError } = await supabase
          .from("oc_requests")
          .update({ budget_line_id: null, line_name: validLines.map(l => l.lineName).join(" + ") })
          .eq("id", request.id);
        if (clearError) throw clearError;

        const inserts = validLines.map(l => ({
          oc_request_id: request.id,
          budget_line_id: l.lineId,
          amount_uf: Math.round(l.amount * 10000) / 10000,
        }));
        const { error: insertError } = await supabase.from("oc_budget_lines").insert(inserts);
        if (insertError) throw insertError;
      }

      toast({ title: "Asignación de líneas actualizada" });
      setIsEditingLines(false);
      loadRequest();
      onRefresh?.();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setSavingLines(false);
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
      await supabase.from("oc_request_forms").delete().eq("oc_request_id", request.id);

      if (formAssignments.length > 0) {
        const effectiveUf = getEffectiveUf(request, ufValue);
        const inserts = formAssignments.map(fa => ({
          oc_request_id: request.id,
          maintenance_form_id: fa.maintenance_form_id,
          amount_uf: Math.round(fa.amount_uf * 10000) / 10000,
          amount_clp: Math.round(fa.amount_uf * effectiveUf),
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

  // Save total amount edit (CLP -> recalculate UF)
  const handleSaveTotalAmount = async () => {
    if (!request) return;
    const newClp = parseFloat(editingTotalValue) || 0;
    if (newClp <= 0) {
      toast({ variant: "destructive", title: "Error", description: "Monto inválido" });
      return;
    }
    const effectiveUf = getEffectiveUf(request, ufValue);
    const newUf = newClp / effectiveUf;

    if (maxTotalUf !== null && newUf > maxTotalUf + 0.01) {
      toast({
        variant: "destructive",
        title: "Monto excede lo autorizado",
        description: `El monto (${formatCLP(newClp)}) supera el disponible en la(s) línea(s) asignada(s) (${formatCLP(Math.round(maxTotalUf * effectiveUf))})`,
      });
      return;
    }

    try {
      const { error } = await supabase
        .from("oc_requests")
        .update({
          amount_clp: Math.round(newClp),
          amount_uf: Math.round(newUf * 10000) / 10000,
        })
        .eq("id", request.id);
      if (error) throw error;
      toast({ title: "Monto actualizado" });
      setEditingTotalAmount(false);
      setEditingTotalValue("");
      loadRequest();
      onRefresh?.();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const handleAddPayment = async () => {
    if (!request) return;
    
    const effectiveUf = getEffectiveUf(request, ufValue);
    let amountClp = 0;

    if (newPayment.input_mode === "balance") {
      amountClp = remainingClp;
    } else if (newPayment.input_mode === "percent") {
      const pct = parseFloat(newPayment.amount) || 0;
      if (pct <= 0 || pct > 100) {
        toast({ variant: "destructive", title: "Error", description: "Ingrese un porcentaje válido (1-100)" });
        return;
      }
      amountClp = totalRequestClp * pct / 100;
    } else {
      amountClp = parseFloat(newPayment.amount) || 0;
    }

    if (amountClp <= 0) {
      toast({ variant: "destructive", title: "Error", description: "Ingrese un monto válido" });
      return;
    }

    setAddingPayment(true);
    try {
      const nextNumber = paymentPlans.length + 1;
      const amountUf = amountClp / effectiveUf;
      
      const { error } = await supabase.from("oc_payment_plans").insert({
        oc_request_id: request.id,
        payment_number: nextNumber,
        description: newPayment.description || `Pago ${nextNumber}`,
        amount_uf: Math.round(amountUf * 10000) / 10000,
        due_date: newPayment.due_date || null,
        status: "pending"
      });

      if (error) throw error;

      toast({ title: "Pago agregado" });
      setNewPayment({ description: "", amount: "", due_date: "", input_mode: "clp" });
      loadRequest();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setAddingPayment(false);
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

  // Inline editing handlers
  const handleStartInlineEdit = (plan: PaymentPlan, field: "description" | "amount") => {
    if (readOnly || request?.status !== "pending") return;
    setEditingPaymentId(plan.id);
    setEditingPaymentField(field);
    if (field === "amount") {
      setEditingPaymentValue(String(ufToClp(plan.amount_uf, request, ufValue)));
    } else {
      setEditingPaymentValue(plan.description || "");
    }
  };

  const handleCancelInlineEdit = () => {
    setEditingPaymentId(null);
    setEditingPaymentField(null);
    setEditingPaymentValue("");
  };

  const handleSaveInlineEdit = async () => {
    if (!editingPaymentId || !editingPaymentField || !request) return;

    try {
      if (editingPaymentField === "amount") {
        const amountClp = parseFloat(editingPaymentValue) || 0;
        if (amountClp <= 0) {
          toast({ variant: "destructive", title: "Error", description: "Monto inválido" });
          return;
        }
        const effectiveUf = getEffectiveUf(request, ufValue);
        const amountUf = amountClp / effectiveUf;
        await supabase
          .from("oc_payment_plans")
          .update({ amount_uf: Math.round(amountUf * 10000) / 10000 })
          .eq("id", editingPaymentId);
      } else {
        await supabase
          .from("oc_payment_plans")
          .update({ description: editingPaymentValue })
          .eq("id", editingPaymentId);
      }

      toast({ title: "Pago actualizado" });
      handleCancelInlineEdit();
      loadRequest();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const handleInlineEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      handleCancelInlineEdit();
    }
    // Enter is handled by Input's default blur behavior
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

  // All CLP-based calculations
  const effectiveUfVal = getEffectiveUf(request, ufValue);
  const totalPlannedClp = paymentPlans.reduce((sum, p) => sum + ufToClp(p.amount_uf, request, ufValue), 0);
  const totalPaidClp = paymentPlans.filter(p => p.status === "paid").reduce((sum, p) => sum + ufToClp(p.amount_uf, request, ufValue), 0);
  const totalRequestClp = request?.amount_clp || ufToClp(request?.amount_uf || 0, request, ufValue);
  const remainingClp = totalRequestClp - totalPlannedClp;

  const isMultiContract = contractAllocations.length > 0;
  // budgetLines solo cubre la asignación múltiple (oc_budget_lines); la
  // asignación simple vive directo en oc_requests.budget_line_id y no
  // aparece ahí, así que sin este fallback el contador siempre mostraba (0).
  const assignedLinesCount = budgetLines.length > 0 ? budgetLines.length : (request?.budget_line_id ? 1 : 0);

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
              <TabsTrigger value="lines">Líneas ({assignedLinesCount})</TabsTrigger>
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

              {/* Summary - CLP principal */}
              <div className="grid grid-cols-2 gap-4 p-3 bg-muted/50 rounded-lg">
                <div>
                  <p className="text-xs text-muted-foreground">Fecha</p>
                  <p className="font-medium">{format(new Date(request.request_date), 'dd/MM/yyyy', { locale: es })}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Monto Total</p>
                  {editingTotalAmount ? (
                    <div>
                      <Input
                        ref={totalAmountInputRef}
                        type="number"
                        value={editingTotalValue}
                        onChange={(e) => setEditingTotalValue(e.target.value)}
                        onBlur={handleSaveTotalAmount}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setEditingTotalAmount(false);
                            setEditingTotalValue("");
                          }
                        }}
                        max={maxTotalUf !== null ? Math.round(maxTotalUf * getEffectiveUf(request, ufValue)) : undefined}
                        className="h-7 text-sm font-mono w-[140px]"
                      />
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        ≈ {formatUF((parseFloat(editingTotalValue) || 0) / getEffectiveUf(request, ufValue))}
                      </p>
                      {maxTotalUf !== null && (
                        <p className="text-[10px] text-muted-foreground">
                          Disponible en la línea: {formatCLP(Math.round(maxTotalUf * getEffectiveUf(request, ufValue)))}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div
                      className={!readOnly && request.status === "pending" ? "cursor-pointer" : ""}
                      onDoubleClick={() => {
                        if (!readOnly && request.status === "pending") {
                          setEditingTotalAmount(true);
                          setEditingTotalValue(String(totalRequestClp));
                        }
                      }}
                      title={!readOnly && request.status === "pending" ? "Doble click para editar" : undefined}
                    >
                      <p className="font-medium">{formatCLP(totalRequestClp)}</p>
                      <p className="text-[10px] text-muted-foreground">{formatUF(request.amount_uf)}</p>
                    </div>
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
                    <Label>Titulo</Label>
                    <Input
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Titulo"
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
                    <Button variant="outline" size="sm" onClick={handleStartEditAllocations} className="gap-1">
                      <Pencil className="h-3 w-3" />
                      Editar
                    </Button>
                  )}
                  {isEditingAllocations && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={handleCancelEditAllocations} className="gap-1">
                        <X className="h-3 w-3" />
                        Cancelar
                      </Button>
                      <Button size="sm" onClick={handleSaveAllocations} disabled={savingAllocations} className="gap-1">
                        {savingAllocations ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        Guardar
                      </Button>
                    </div>
                  )}
                </div>

                {/* View Mode - CLP principal */}
                {!isEditingAllocations && (
                  <>
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Contrato</TableHead>
                            <TableHead className="text-right">Monto</TableHead>
                            <TableHead className="text-right">% del Total</TableHead>
                            <TableHead className="w-[100px]">Acciones</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {contractAllocations.map((alloc) => {
                            const percentage = request.amount_uf > 0 
                              ? ((alloc.amount_uf / request.amount_uf) * 100).toFixed(1) 
                              : "0";
                            const allocClp = alloc.amount_clp || ufToClp(alloc.amount_uf, request, ufValue);
                            
                            return (
                              <TableRow key={alloc.id}>
                                <TableCell className="font-medium">
                                  {alloc.contract_name}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex flex-col items-end">
                                    <span className="font-mono">{formatCLP(allocClp)}</span>
                                    <span className="text-[10px] text-muted-foreground">{formatUF(alloc.amount_uf)}</span>
                                  </div>
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

                    {/* Summary - CLP principal */}
                    <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                      <span className="font-medium">Total Asignado</span>
                      <div className="text-right">
                        <span className="font-mono font-medium">
                          {formatCLP(contractAllocations.reduce((sum, a) => sum + (a.amount_clp || ufToClp(a.amount_uf, request, ufValue)), 0))}
                        </span>
                        <span className="text-muted-foreground text-xs ml-2">
                          {formatUF(contractAllocations.reduce((sum, a) => sum + a.amount_uf, 0))}
                        </span>
                      </div>
                    </div>
                  </>
                )}

                {/* Edit Mode - CLP display */}
                {isEditingAllocations && (
                  <>
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Contrato</TableHead>
                            <TableHead className="text-right w-[150px]">Monto ($)</TableHead>
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
                                  <p className="text-[10px] text-muted-foreground text-right mt-0.5">
                                    ≈ {formatCLP(alloc.amount_uf * effectiveUfVal)}
                                  </p>
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

                    {/* Edit Summary - CLP */}
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
                                {diff > 0 ? `Faltan ${formatCLP(diff * effectiveUfVal)} por asignar` : `Exceso de ${formatCLP(Math.abs(diff) * effectiveUfVal)}`}
                              </span>
                            )}
                          </div>
                          <div className="text-right">
                            <span className={`font-mono font-medium ${isBalanced ? 'text-green-600' : 'text-yellow-600'}`}>
                              {formatCLP(totalEditable * effectiveUfVal)}
                            </span>
                            <span className="text-muted-foreground text-sm ml-2">
                              / {formatCLP(totalRequestClp)}
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
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">Asignación a Línea(s) de Presupuesto</span>
                {!readOnly && request.status === "pending" && !isEditingLines && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleStartEditLines}
                    disabled={!request.budget_id}
                    title={!request.budget_id ? "Esta solicitud no está asociada a un presupuesto CAPEX" : undefined}
                    className="gap-1"
                  >
                    <Pencil className="h-3 w-3" />
                    Editar
                  </Button>
                )}
                {isEditingLines && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleCancelEditLines} className="gap-1">
                      <X className="h-3 w-3" />
                      Cancelar
                    </Button>
                    <Button size="sm" onClick={handleSaveLines} disabled={savingLines} className="gap-1">
                      {savingLines ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      Guardar
                    </Button>
                  </div>
                )}
              </div>

              {isEditingLines ? (
                request.budget_id ? (
                  <MultipleLinesSelector
                    budgetId={request.budget_id}
                    selectedLines={editableLines}
                    onSelectionChange={setEditableLines}
                    formatUF={formatUF}
                    formatCLP={formatCLP}
                    ufValue={ufValue}
                    excludeRequestId={request.id}
                  />
                ) : null
              ) : budgetLines.length > 0 ? (
                <div className="space-y-2">
                  {budgetLines.map((line) => (
                    <div key={line.id} className="flex justify-between items-center p-2 bg-muted/30 rounded">
                      <span className="text-sm">{line.line_name}</span>
                      <div className="flex flex-col items-end">
                        <span className="font-mono text-sm">{formatCLP(ufToClp(line.amount_uf, request, ufValue))}</span>
                        <span className="text-[10px] text-muted-foreground">{formatUF(line.amount_uf)}</span>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between items-center p-2 border-t font-medium">
                    <span>Total</span>
                    <div className="flex flex-col items-end">
                      <span className="font-mono">{formatCLP(totalRequestClp)}</span>
                      <span className="text-[10px] text-muted-foreground">{formatUF(request.amount_uf)}</span>
                    </div>
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
                            <TableHead className="text-right w-[130px]">Monto</TableHead>
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
                                    <div>
                                      <Input
                                        type="number"
                                        step="0.01"
                                        value={fa.amount_uf || ""}
                                        onChange={(e) => handleUpdateFormAssignment(index, "amount_uf", e.target.value)}
                                        className="h-8 text-right font-mono w-[120px] text-xs"
                                        placeholder="0.00"
                                      />
                                      <p className="text-[10px] text-muted-foreground text-right mt-0.5">
                                        ≈ {formatCLP(fa.amount_uf * effectiveUfVal)}
                                      </p>
                                    </div>
                                  ) : (
                                    <div className="flex flex-col items-end">
                                      <span className="font-mono text-sm">{formatCLP(ufToClp(fa.amount_uf, request, ufValue))}</span>
                                      <span className="text-[10px] text-muted-foreground">{formatUF(fa.amount_uf)}</span>
                                    </div>
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

                  {/* Summary - CLP */}
                  {formAssignments.length > 0 && (
                    <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                      <span className="font-medium text-sm">Total FORMs</span>
                      <div className="flex flex-col items-end">
                        <span className="font-mono font-medium">
                          {formatCLP(formAssignments.reduce((sum, fa) => sum + ufToClp(fa.amount_uf, request, ufValue), 0))}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatUF(formAssignments.reduce((sum, fa) => sum + fa.amount_uf, 0))}
                        </span>
                      </div>
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
              {/* Summary - CLP */}
              <div className="grid grid-cols-4 gap-2 p-3 bg-muted/50 rounded-lg text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Total Solicitud</p>
                  <p className="font-medium">{formatCLP(totalRequestClp)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Planificado</p>
                  <p className="font-medium">{formatCLP(totalPlannedClp)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Pagado</p>
                  <p className="font-medium text-green-600">{formatCLP(totalPaidClp)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Sin Planificar</p>
                  <p className={`font-medium ${remainingClp > 0 ? "text-yellow-600" : remainingClp < 0 ? "text-destructive" : ""}`}>
                    {formatCLP(remainingClp)}
                  </p>
                </div>
              </div>

              {remainingClp < 0 && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  Los pagos planificados exceden el monto total
                </div>
              )}

              {/* Payment list with inline editing */}
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
                    {paymentPlans.map((plan) => {
                      const isEditingDesc = editingPaymentId === plan.id && editingPaymentField === "description";
                      const isEditingAmount = editingPaymentId === plan.id && editingPaymentField === "amount";
                      const canEdit = !readOnly && request.status === "pending";

                      return (
                        <TableRow key={plan.id}>
                          <TableCell className="font-mono">{plan.payment_number}</TableCell>
                          <TableCell
                            className={canEdit ? "cursor-pointer" : ""}
                            onDoubleClick={() => canEdit && handleStartInlineEdit(plan, "description")}
                            title={canEdit ? "Doble click para editar" : undefined}
                          >
                            {isEditingDesc ? (
                              <Input
                                ref={editInputRef}
                                value={editingPaymentValue}
                                onChange={(e) => setEditingPaymentValue(e.target.value)}
                                onBlur={handleSaveInlineEdit}
                                onKeyDown={handleInlineEditKeyDown}
                                className="h-7 text-sm"
                              />
                            ) : (
                              plan.description || "-"
                            )}
                          </TableCell>
                          <TableCell
                            className={`text-right ${canEdit ? "cursor-pointer" : ""}`}
                            onDoubleClick={() => canEdit && handleStartInlineEdit(plan, "amount")}
                            title={canEdit ? "Doble click para editar" : undefined}
                          >
                            {isEditingAmount ? (
                              <Input
                                ref={editInputRef}
                                type="number"
                                value={editingPaymentValue}
                                onChange={(e) => setEditingPaymentValue(e.target.value)}
                                onBlur={handleSaveInlineEdit}
                                onKeyDown={handleInlineEditKeyDown}
                                className="h-7 text-sm text-right font-mono w-[120px] ml-auto"
                              />
                            ) : (
                              <div className="flex flex-col items-end">
                                <span>{formatCLP(ufToClp(plan.amount_uf, request, ufValue))}</span>
                                <span className="text-[10px] text-muted-foreground">{formatUF(plan.amount_uf)}</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {plan.due_date ? format(new Date(plan.due_date), 'dd/MM/yyyy', { locale: es }) : "-"}
                          </TableCell>
                          <TableCell>{getStatusBadge(plan)}</TableCell>
                          {canEdit && (
                            <TableCell className="text-right">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => handleDeletePayment(plan.id)} 
                                className="h-6 px-2 text-destructive"
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
              )}

              {/* Add payment form - CLP */}
              {!readOnly && request.status === "pending" && (
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <Label>Agregar Pago</Label>
                  </div>
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-3 space-y-1">
                      <Label className="text-xs">Descripción</Label>
                      <Input
                        value={newPayment.description}
                        onChange={(e) => setNewPayment(prev => ({ ...prev, description: e.target.value }))}
                        placeholder={`Pago ${paymentPlans.length + 1}`}
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Tipo</Label>
                      <Select
                        value={newPayment.input_mode}
                        onValueChange={(v: "clp" | "percent" | "balance") => setNewPayment(prev => ({ ...prev, input_mode: v, amount: v === "balance" ? "" : prev.amount }))}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="clp">$ Monto</SelectItem>
                          <SelectItem value="percent">% del Total</SelectItem>
                          {paymentPlans.length >= 1 && (
                            <SelectItem value="balance">Saldo</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-3 space-y-1">
                      <Label className="text-xs">
                        {newPayment.input_mode === "percent" ? "Porcentaje *" : "Monto ($) *"}
                      </Label>
                      {newPayment.input_mode === "balance" ? (
                        <div className="h-9 flex items-center px-3 border rounded-md bg-muted/50 text-sm font-mono">
                          {formatCLP(remainingClp)}
                        </div>
                      ) : (
                        <Input
                          type="number"
                          value={newPayment.amount}
                          onChange={(e) => setNewPayment(prev => ({ ...prev, amount: e.target.value }))}
                          placeholder={newPayment.input_mode === "percent" ? "0-100" : "0"}
                          step={newPayment.input_mode === "percent" ? "0.01" : "1"}
                          min="0"
                          max={newPayment.input_mode === "percent" ? "100" : undefined}
                        />
                      )}
                      {/* Show calculated equivalencies */}
                      {(() => {
                        const effectiveUf = request ? getEffectiveUf(request, ufValue) : ufValue;
                        if (newPayment.input_mode === "percent" && parseFloat(newPayment.amount) > 0) {
                          const calcClp = totalRequestClp * parseFloat(newPayment.amount) / 100;
                          return (
                            <p className="text-[10px] text-muted-foreground">
                              = {formatCLP(calcClp)} · {formatUF(calcClp / effectiveUf)}
                            </p>
                          );
                        }
                        if (newPayment.input_mode === "balance" && remainingClp > 0) {
                          return (
                            <p className="text-[10px] text-muted-foreground">
                              ≈ {formatUF(remainingClp / effectiveUf)}
                            </p>
                          );
                        }
                        if (newPayment.input_mode === "clp" && parseFloat(newPayment.amount) > 0) {
                          return (
                            <p className="text-[10px] text-muted-foreground">
                              ≈ {formatUF(parseFloat(newPayment.amount) / effectiveUf)}
                            </p>
                          );
                        }
                        return null;
                      })()}
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Vencimiento</Label>
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
                  {remainingClp > 0 && newPayment.input_mode !== "balance" && (
                    <p className="text-xs text-muted-foreground">
                      Sugerencia: quedan {formatCLP(remainingClp)} sin planificar
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
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No se encontró la solicitud
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
