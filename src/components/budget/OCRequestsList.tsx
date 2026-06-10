import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
// Card component removed - not in use currently
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Upload, Eye, Trash2, Download, Plus, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { OCRequestViewDialog } from "./OCRequestViewDialog";
import { MultipleLinesSelector } from "./MultipleLinesSelector";
import { SupplierSelect } from "@/components/suppliers/SupplierSelect";
import { generateOCRequestTemplate, parseOCRequestExcel } from "@/lib/generateOCRequestTemplate";

interface OCRequest {
  id: string;
  request_number: string;
  request_date: string;
  line_name: string;
  project_name: string;
  description: string | null;
  amount_uf: number;
  amount_clp: number;
  supplier_name: string | null;
  status: "pending" | "converted";
  purchase_order_id: string | null;
  created_at: string;
  budget_id: string | null;
  budget_line_id?: string | null;
  opex_master_id?: string | null;
  budget_type?: string; // Derived from fields or contract_budgets
  quotation_url?: string | null;
  quotation_file_name?: string | null;
  // Multi-contract allocation info
  is_multi_contract?: boolean;
  allocated_amount_uf?: number;
  allocated_amount_clp?: number;
  total_request_amount_uf?: number;
  total_request_amount_clp?: number;
}

interface SelectedLine {
  lineId: string;
  lineName: string;
  amount: number;
  maxAmount: number;
}

interface PaymentPlanItem {
  description: string;
  amount: string;
  due_date: string;
}

interface OCRequestsListProps {
  contractId: string;
  contractName?: string;
  budgetId?: string;
  year: number;
  ufValue: number;
  formatUF: (value: number) => string;
  formatCLP: (value: number) => string;
  onRefresh?: () => void;
  isAdmin?: boolean;
  budgetLineId?: string;
  allowCreate?: boolean;
}

export const OCRequestsList = ({
  contractId,
  contractName = "",
  budgetId,
  year,
  ufValue,
  formatUF,
  formatCLP,
  onRefresh,
  isAdmin = false,
  budgetLineId,
  allowCreate = true
}: OCRequestsListProps) => {
  const [requests, setRequests] = useState<OCRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<OCRequest | null>(null);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [viewRequestId, setViewRequestId] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [convertForm, setConvertForm] = useState({
    order_number: "",
    supplier_name: ""
  });
  
  // Filter state
  const [budgetTypeFilter, setBudgetTypeFilter] = useState<"all" | "capex" | "opex">("all");
  
  // New request dialog state
  const [showNewRequestDialog, setShowNewRequestDialog] = useState(false);
  const [newRequestTab, setNewRequestTab] = useState("basic");
  const [budgetType, setBudgetType] = useState<"capex" | "opex">("capex");
  const [availableBudgets, setAvailableBudgets] = useState<{ id: string; type: string; hasLines: boolean }[]>([]);
  const [selectedBudgetId, setSelectedBudgetId] = useState("");
  const [loadingBudgets, setLoadingBudgets] = useState(false);
  const [selectedLines, setSelectedLines] = useState<SelectedLine[]>([]);
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlanItem[]>([]);
  const [newRequestForm, setNewRequestForm] = useState({
    description: "",
    amount: "",
    currency: "CLP" as "UF" | "CLP",
    supplier_id: null as string | null,
    supplier_name: null as string | null
  });
  const [creatingRequest, setCreatingRequest] = useState(false);
  const [showCancelConfirmDialog, setShowCancelConfirmDialog] = useState(false);
  const [projectName, setProjectName] = useState(contractName);
  const [importingFile, setImportingFile] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);
  
  const { toast } = useToast();

  useEffect(() => {
    loadRequests();
  }, [contractId, year, budgetLineId]);

  const loadRequests = async () => {
    setLoading(true);
    try {
      // First get direct requests for this contract
      let query = supabase
        .from("oc_requests")
        .select("*")
        .eq("contract_id", contractId)
        .eq("year", year)
        .order("created_at", { ascending: false });
      
      if (budgetLineId) {
        query = query.eq("budget_line_id", budgetLineId);
      }

      const { data: directData, error: directError } = await query;
      if (directError) throw directError;

      // Also get multi-contract allocations for this contract
      const { data: allocationsData, error: allocError } = await supabase
        .from("oc_request_contract_allocations")
        .select(`
          oc_request_id,
          amount_uf,
          amount_clp,
          oc_requests!inner(
            id, request_number, request_date, line_name, project_name,
            description, amount_uf, amount_clp, supplier_name, status,
            purchase_order_id, created_at, budget_id, budget_line_id, opex_master_id, quotation_url, quotation_file_name
          )
        `)
        .eq("contract_id", contractId);

      // Build a map of allocations by request ID for this contract
      const allocationsByRequestId: Record<string, { amount_uf: number; amount_clp: number }> = {};
      for (const alloc of (allocationsData || [])) {
        allocationsByRequestId[alloc.oc_request_id] = {
          amount_uf: alloc.amount_uf,
          amount_clp: alloc.amount_clp
        };
      }

      // Process direct requests - check if they have allocations and update amounts accordingly
      const processedDirectRequests = (directData || []).map(req => {
        const allocation = allocationsByRequestId[req.id];
        if (allocation) {
          // This direct request has an allocation for this contract - use allocated amounts
          return {
            ...req,
            is_multi_contract: true,
            allocated_amount_uf: allocation.amount_uf,
            allocated_amount_clp: allocation.amount_clp,
            total_request_amount_uf: req.amount_uf,
            total_request_amount_clp: req.amount_clp,
            // Override displayed amounts with allocated amounts
            amount_uf: allocation.amount_uf,
            amount_clp: allocation.amount_clp
          };
        }
        return req;
      });

      const multiContractRequests: OCRequest[] = [];

      // Process multi-contract allocations that are NOT already in direct requests
      const directIds = new Set(processedDirectRequests.map(r => r.id));
      for (const alloc of (allocationsData || [])) {
        const req = alloc.oc_requests as any;
        if (req && !directIds.has(req.id)) {
          // Filter by year
          const reqDate = new Date(req.request_date);
          if (reqDate.getFullYear() === year) {
            multiContractRequests.push({
              ...req,
              is_multi_contract: true,
              allocated_amount_uf: alloc.amount_uf,
              allocated_amount_clp: alloc.amount_clp,
              total_request_amount_uf: req.amount_uf,
              total_request_amount_clp: req.amount_clp,
              // Override displayed amounts with allocated amounts
              amount_uf: alloc.amount_uf,
              amount_clp: alloc.amount_clp
            });
          }
        }
      }

      const combinedRequests = [...processedDirectRequests, ...multiContractRequests];
      const budgetIds = [...new Set(combinedRequests.map(r => r.budget_id).filter(Boolean))];
      
      let budgetTypeMap: Record<string, string> = {};
      if (budgetIds.length > 0) {
        const { data: budgets } = await supabase
          .from("contract_budgets")
          .select("id, budget_type")
          .in("id", budgetIds);
        
        budgetTypeMap = (budgets || []).reduce((acc, b) => {
          acc[b.id] = b.budget_type;
          return acc;
        }, {} as Record<string, string>);
      }

      // Derive budget_type using the same logic as BudgetDashboard/PurchaseOrdersModule
      const deriveBudgetType = (req: any): string => {
        if (req.opex_master_id) return "opex";
        if (req.budget_id && budgetTypeMap[req.budget_id]) return budgetTypeMap[req.budget_id];
        if (req.budget_line_id) return "capex";
        return "capex";
      };

      const requestsWithType: OCRequest[] = combinedRequests.map(req => ({
        ...req,
        budget_type: deriveBudgetType(req)
      })) as OCRequest[];

      // Sort by created_at descending
      requestsWithType.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setRequests(requestsWithType);
    } catch (error) {
      console.error("Error loading OC requests:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleConvertToOC = async () => {
    if (!selectedRequest) return;
    if (!convertForm.order_number.trim()) {
      toast({ variant: "destructive", title: "Error", description: "Ingrese el número de OC" });
      return;
    }

    setConverting(true);
    try {
      // Create the actual purchase order using the budget_id from the request
      const { data: ocData, error: ocError } = await supabase.from("purchase_orders").insert({
        contract_id: contractId,
        budget_id: selectedRequest.budget_id || budgetId, // Use request's budget_id first
        order_number: convertForm.order_number,
        supplier_name: convertForm.supplier_name || selectedRequest.supplier_name,
        description: selectedRequest.description,
        amount_uf: selectedRequest.amount_uf,
        amount_clp: selectedRequest.amount_clp,
        input_currency: "UF",
        uf_value_at_entry: ufValue,
        year: year,
        status: "abierta",
        attachment_url: selectedRequest.quotation_url || null
      }).select("id").single();

      if (ocError) throw ocError;

      // Update the request status to converted
      const { error: updateError } = await supabase
        .from("oc_requests")
        .update({ 
          status: "converted",
          purchase_order_id: ocData.id
        })
        .eq("id", selectedRequest.id);

      if (updateError) throw updateError;

      toast({ title: "Solicitud convertida", description: `OC ${convertForm.order_number} creada exitosamente` });
      setShowConvertDialog(false);
      setSelectedRequest(null);
      setConvertForm({ order_number: "", supplier_name: "" });
      loadRequests();
      onRefresh?.();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setConverting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedRequest) return;

    try {
      const { error } = await supabase
        .from("oc_requests")
        .delete()
        .eq("id", selectedRequest.id);

      if (error) throw error;

      toast({ title: "Solicitud eliminada" });
      setShowDeleteDialog(false);
      setSelectedRequest(null);
      loadRequests();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const exportToExcel = (request: OCRequest) => {
    // Generate CSV content
    const BOM = '\uFEFF';
    const headers = ['Número Solicitud', 'Fecha', 'Línea', 'Proyecto', 'Descripción', 'Monto UF', 'Monto CLP', 'Proveedor', 'Estado'];
    const row = [
      request.request_number,
      format(new Date(request.request_date), 'dd/MM/yyyy'),
      request.line_name,
      request.project_name,
      request.description || '',
      request.amount_uf.toFixed(2),
      Math.round(request.amount_clp).toString(),
      request.supplier_name || '',
      request.status === 'pending' ? 'Pendiente' : 'Convertida'
    ];

    const csvContent = BOM + [
      headers.join(';'),
      row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(';')
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${request.request_number}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Load available budgets when opening new request dialog
  const handleOpenNewRequestDialog = async () => {
    setShowNewRequestDialog(true);
    setNewRequestTab("basic");
    setBudgetType("capex");
    setSelectedLines([]);
    setPaymentPlan([]);
    setNewRequestForm({ description: "", amount: "", currency: "CLP", supplier_id: null, supplier_name: null });
    setLoadingBudgets(true);
    
    try {
      // Get contract name if not provided
      if (!projectName) {
        const { data: contract } = await supabase
          .from("contracts")
          .select("name")
          .eq("id", contractId)
          .single();
        if (contract) setProjectName(contract.name);
      }
      
      // Load CAPEX budgets for this contract and year
      const { data: capexBudgets } = await supabase
        .from("contract_budgets")
        .select("id, budget_type")
        .eq("contract_id", contractId)
        .eq("year", year)
        .eq("budget_type", "capex")
        .eq("is_closed", false);
      
      // Check for centralized OPEX master budget (not per contract)
      const { count: opexMasterCount } = await supabase
        .from("opex_master_budget")
        .select("*", { count: "exact", head: true })
        .eq("year", year)
        .eq("is_closed", false);
      
      const hasOpexMaster = (opexMasterCount || 0) > 0;
      
      const budgetsWithLines: { id: string; type: string; hasLines: boolean }[] = [];
      
      // Check CAPEX budgets have lines
      if (capexBudgets && capexBudgets.length > 0) {
        for (const budget of capexBudgets) {
          const { count } = await supabase
            .from("budget_lines")
            .select("*", { count: "exact", head: true })
            .eq("budget_id", budget.id)
            .eq("status", "autorizado");
          
          budgetsWithLines.push({
            id: budget.id,
            type: "capex",
            hasLines: (count || 0) > 0
          });
        }
      }
      
      // For OPEX, check if there's an OPEX budget for this contract OR use centralized
      // First check for contract-specific OPEX budget
      const { data: opexContractBudget } = await supabase
        .from("contract_budgets")
        .select("id")
        .eq("contract_id", contractId)
        .eq("year", year)
        .eq("budget_type", "opex")
        .eq("is_closed", false)
        .maybeSingle();
      
      if (opexContractBudget) {
        // Has contract-specific OPEX budget with lines
        const { count } = await supabase
          .from("budget_lines")
          .select("*", { count: "exact", head: true })
          .eq("budget_id", opexContractBudget.id)
          .eq("status", "autorizado");
        
        budgetsWithLines.push({
          id: opexContractBudget.id,
          type: "opex",
          hasLines: (count || 0) > 0
        });
      } else if (hasOpexMaster) {
        // Use centralized OPEX master budget (virtual entry)
        budgetsWithLines.push({
          id: "opex_master",
          type: "opex",
          hasLines: true // OPEX master categories are available
        });
      }
      
      setAvailableBudgets(budgetsWithLines);
      
      // Auto-select first available budget
      const firstWithLines = budgetsWithLines.find(b => b.hasLines);
      if (firstWithLines) {
        setBudgetType(firstWithLines.type as "capex" | "opex");
        setSelectedBudgetId(firstWithLines.id);
      }
    } catch (error) {
      console.error("Error loading budgets:", error);
    } finally {
      setLoadingBudgets(false);
    }
  };

  const handleBudgetTypeChange = (type: "capex" | "opex") => {
    setBudgetType(type);
    setSelectedLines([]);
    const budget = availableBudgets.find(b => b.type === type);
    setSelectedBudgetId(budget?.id || "");
  };

  const addPaymentItem = () => {
    setPaymentPlan(prev => [...prev, { description: `Pago ${prev.length + 1}`, amount: "", due_date: "" }]);
  };

  const removePaymentItem = (index: number) => {
    setPaymentPlan(prev => prev.filter((_, i) => i !== index));
  };

  const updatePaymentItem = (index: number, field: keyof PaymentPlanItem, value: string) => {
    setPaymentPlan(prev => prev.map((item, i) => 
      i === index ? { ...item, [field]: value } : item
    ));
  };

  const generateRequestNumber = async (lineNames: string[]): Promise<{ number: string; correlative: number }> => {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '.');
    
    const { count } = await supabase
      .from("oc_requests")
      .select("*", { count: "exact", head: true })
      .eq("request_date", today.toISOString().split('T')[0]);
    
    const correlative = (count || 0) + 1;
    const correlativeStr = correlative.toString().padStart(3, '0');
    
    const cleanLineNames = lineNames.map(name => 
      name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s]/g, '').trim().replace(/\s+/g, '_')
    ).join('+').substring(0, 60);
    
    const cleanProjectName = projectName.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s]/g, '').trim().replace(/\s+/g, '_').substring(0, 30);
    
    return { number: `${dateStr}_${correlativeStr}_${cleanLineNames}_${cleanProjectName}`, correlative };
  };

  const handleCreateNewRequest = async () => {
    // Validate amount from form
    const enteredAmount = parseFloat(newRequestForm.amount) || 0;
    if (enteredAmount <= 0) {
      toast({ variant: "destructive", title: "Error", description: "Ingrese un monto válido" });
      return;
    }

    // Supplier is required
    if (!newRequestForm.supplier_id) {
      toast({ variant: "destructive", title: "Error", description: "Seleccione un proveedor" });
      return;
    }

    // Payment plan must not exceed total requested
    const totalPlanAmt = paymentPlan.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    if (paymentPlan.length > 0 && totalPlanAmt > enteredAmount) {
      toast({ variant: "destructive", title: "Error", description: "El total planificado de pagos supera el monto de la solicitud. Use 'Cuadrar' para ajustar." });
      return;
    }

    const validLines = selectedLines.filter(l => l.lineId);
    if (validLines.length === 0) {
      toast({ variant: "destructive", title: "Error", description: "Seleccione al menos una línea de imputación" });
      return;
    }

    // Use provided UF value or fallback
    const currentUfValue = ufValue > 0 ? ufValue : 38000;
    
    // Convert amount based on currency and budget type
    // OPEX always works in CLP, CAPEX can be UF or CLP
    let totalAmountUf: number;
    let totalAmountClp: number;
    const inputCurrency = newRequestForm.currency;
    
    if (inputCurrency === "CLP") {
      totalAmountClp = Math.round(enteredAmount);
      totalAmountUf = Math.round((enteredAmount / currentUfValue) * 10000) / 10000;
    } else {
      // UF
      totalAmountUf = Math.round(enteredAmount * 10000) / 10000;
      totalAmountClp = Math.round(enteredAmount * currentUfValue);
    }

    const lineNames = validLines.map(l => l.lineName);
    const displayLineName = lineNames.join(' + ');

    setCreatingRequest(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { number, correlative } = await generateRequestNumber(lineNames);

      // For OPEX master, budget_id is "opex_master" - we need to handle this
      const isOpexMaster = selectedBudgetId === "opex_master";
      
      // Create request
      const { data: requestData, error } = await supabase.from("oc_requests").insert({
        contract_id: contractId,
        budget_id: isOpexMaster ? null : selectedBudgetId,
        budget_line_id: validLines.length === 1 && !isOpexMaster ? validLines[0].lineId : null,
        opex_master_id: isOpexMaster && validLines.length === 1 ? validLines[0].lineId : null,
        request_number: number,
        correlative_of_day: correlative,
        request_date: new Date().toISOString().split('T')[0],
        line_name: displayLineName,
        project_name: projectName,
        description: newRequestForm.description,
        amount_uf: totalAmountUf,
        amount_clp: totalAmountClp,
        input_currency: inputCurrency,
        uf_value_at_entry: currentUfValue,
        supplier_id: newRequestForm.supplier_id,
        supplier_name: newRequestForm.supplier_name,
        year: year,
        status: "pending",
        created_by: user?.id
      }).select().single();

      if (error) throw error;

      // Create budget line assignments
      if (requestData) {
        const lineAssignments = validLines.map(l => ({
          oc_request_id: requestData.id,
          budget_line_id: l.lineId,
          amount_uf: l.amount
        }));
        await supabase.from("oc_budget_lines").insert(lineAssignments);

        // Create payment plans
        if (paymentPlan.length > 0) {
          const planEntries = paymentPlan
            .filter(p => parseFloat(p.amount) > 0)
            .map((p, idx) => {
              const pAmount = parseFloat(p.amount);
              const amountUf = inputCurrency === "CLP" && currentUfValue > 0 
                ? Math.round((pAmount / currentUfValue) * 10000) / 10000 
                : pAmount;
              return {
                oc_request_id: requestData.id,
                payment_number: idx + 1,
                description: p.description || `Pago ${idx + 1}`,
                amount_uf: amountUf,
                due_date: p.due_date || null,
                status: "pending"
              };
            });
          if (planEntries.length > 0) {
            await supabase.from("oc_payment_plans").insert(planEntries);
          }
        } else {
          // No payment plan defined - assume single payment with full amount
          await supabase.from("oc_payment_plans").insert({
            oc_request_id: requestData.id,
            payment_number: 1,
            description: "Pago único",
            amount_uf: totalAmountUf,
            due_date: null,
            status: "pending"
          });
        }
      }

      toast({ title: "Solicitud creada", description: `Solicitud ${number} creada exitosamente` });
      setShowNewRequestDialog(false);
      loadRequests();
      onRefresh?.();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setCreatingRequest(false);
    }
  };

  // Filter requests by budget type — converted requests are always visible
  const visibleRequests = requests;
    
  const filteredRequests = budgetTypeFilter === "all" 
    ? visibleRequests 
    : visibleRequests.filter(r => r.budget_type === budgetTypeFilter);
  
  const pendingRequests = filteredRequests.filter(r => r.status === "pending");
  const convertedRequests = filteredRequests.filter(r => r.status === "converted");

  const totalPlanned = paymentPlan.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  // totalSelected in same currency as form input
  const totalSelected = parseFloat(newRequestForm.amount) || 0;

  const capexBudget = availableBudgets.find(b => b.type === "capex");
  const opexBudget = availableBudgets.find(b => b.type === "opex");

  // Count by type for filter badges (only visible requests)
  const capexCount = visibleRequests.filter(r => r.budget_type === "capex").length;
  const opexCount = visibleRequests.filter(r => r.budget_type === "opex").length;

  const handleImportOCRequest = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setImportingFile(true);
    try {
      const parsed = await parseOCRequestExcel(file);
      
      // Open the new request dialog and pre-fill with parsed data
      await handleOpenNewRequestDialog();
      
      setNewRequestForm(prev => ({
        ...prev,
        description: parsed.description || prev.description,
        amount: parsed.amount > 0 ? String(parsed.amount) : prev.amount,
        currency: parsed.currency as "UF" | "CLP",
        supplier_name: parsed.supplier_name || prev.supplier_name,
      }));

      if (parsed.paymentPlan.length > 0) {
        setPaymentPlan(parsed.paymentPlan.map(p => ({
          description: p.description,
          amount: p.amount > 0 ? String(p.amount) : "",
          due_date: p.due_date,
        })));
      }

      toast({ title: "Datos importados", description: "Los campos se han completado con los datos del archivo" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error al importar", description: error.message });
    } finally {
      setImportingFile(false);
      if (importFileRef.current) importFileRef.current.value = "";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with filters and New Request button */}
      <div className="flex items-center justify-between gap-4">
        {/* Budget type filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filtrar:</span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={budgetTypeFilter === "all" ? "default" : "outline"}
              onClick={() => setBudgetTypeFilter("all")}
              className="h-7 text-xs"
            >
              Todos ({visibleRequests.length})
            </Button>
            <Button
              size="sm"
              variant={budgetTypeFilter === "capex" ? "default" : "outline"}
              onClick={() => setBudgetTypeFilter("capex")}
              className="h-7 text-xs"
              disabled={capexCount === 0}
            >
              CAPEX ({capexCount})
            </Button>
            <Button
              size="sm"
              variant={budgetTypeFilter === "opex" ? "default" : "outline"}
              onClick={() => setBudgetTypeFilter("opex")}
              className="h-7 text-xs"
              disabled={opexCount === 0}
            >
              OPEX ({opexCount})
            </Button>
          </div>
        </div>
        
        {allowCreate && (
          <div className="flex items-center gap-2">
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => generateOCRequestTemplate(contractName)}
              title="Descargar plantilla Excel"
              className="gap-1"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Plantilla</span>
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => importFileRef.current?.click()}
              disabled={importingFile}
              title="Importar solicitud desde Excel"
              className="gap-1"
            >
              {importingFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              <span className="hidden sm:inline">Importar</span>
            </Button>
            <input
              ref={importFileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleImportOCRequest}
            />
            <Button size="sm" onClick={handleOpenNewRequestDialog} className="gap-2">
              <Plus className="h-4 w-4" />
              Nueva Solicitud
            </Button>
          </div>
        )}
      </div>

      {filteredRequests.length === 0 && (
        <div className="text-center py-6 text-muted-foreground text-sm">
          {requests.length === 0 
            ? "No hay solicitudes de OC para este año"
            : `No hay solicitudes de OC ${budgetTypeFilter.toUpperCase()}`
          }
        </div>
      )}
      
      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <div>
          <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
            <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
              Pendientes ({pendingRequests.length})
            </Badge>
          </h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Número</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Línea</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingRequests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className={request.budget_type === "capex" 
                        ? "bg-blue-50 text-blue-700 border-blue-300 text-[10px]" 
                        : "bg-orange-50 text-orange-700 border-orange-300 text-[10px]"
                      }>
                        {request.budget_type?.toUpperCase() || "N/A"}
                      </Badge>
                      {request.is_multi_contract && (
                        <Badge variant="secondary" className="text-[9px] px-1">
                          Multi
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{request.request_number}</TableCell>
                  <TableCell>{format(new Date(request.request_date), 'dd/MM/yyyy', { locale: es })}</TableCell>
                  <TableCell className="truncate max-w-[150px]">{request.line_name}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end">
                      <span>{formatCLP(request.amount_clp || Math.round(request.amount_uf * ufValue))}</span>
                      <span className="text-[10px] text-muted-foreground">{formatUF(request.amount_uf)}</span>
                      {request.is_multi_contract && request.total_request_amount_uf && (
                        <span className="text-[10px] text-muted-foreground">
                          (Total: {formatCLP(request.total_request_amount_clp || Math.round(request.total_request_amount_uf * ufValue))})
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="truncate max-w-[120px]">{request.supplier_name || '-'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setViewRequestId(request.id);
                          setShowViewDialog(true);
                        }}
                        className="h-7 px-2"
                        title="Ver/Editar Solicitud"
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => exportToExcel(request)}
                        className="h-7 px-2"
                        title="Descargar Excel"
                      >
                        <Download className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          setSelectedRequest(request);
                          setConvertForm({ 
                            order_number: "", 
                            supplier_name: request.supplier_name || "" 
                          });
                          setShowConvertDialog(true);
                        }}
                        className="h-7 px-2 gap-1"
                      >
                        <Upload className="h-3 w-3" />
                        Cargar OC
                      </Button>
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedRequest(request);
                            setShowDeleteDialog(true);
                          }}
                          className="h-7 px-2 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Converted Requests */}
      {convertedRequests.length > 0 && (
        <div>
          <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
              Convertidas ({convertedRequests.length})
            </Badge>
          </h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Número Solicitud</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Línea</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {convertedRequests.map((request) => (
                <TableRow key={request.id} className="opacity-60">
                  <TableCell>
                    <Badge variant="outline" className={request.budget_type === "capex" 
                      ? "bg-blue-50 text-blue-700 border-blue-300 text-[10px]" 
                      : "bg-orange-50 text-orange-700 border-orange-300 text-[10px]"
                    }>
                      {request.budget_type?.toUpperCase() || "N/A"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{request.request_number}</TableCell>
                  <TableCell>{format(new Date(request.request_date), 'dd/MM/yyyy', { locale: es })}</TableCell>
                  <TableCell className="truncate max-w-[150px]">{request.line_name}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end">
                      <span>{formatCLP(request.amount_clp || Math.round(request.amount_uf * ufValue))}</span>
                      <span className="text-[10px] text-muted-foreground">{formatUF(request.amount_uf)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="default" className="bg-green-500">
                      Convertida a OC
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Convert to OC Dialog */}
      <Dialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cargar OC a Solicitud</DialogTitle>
            <DialogDescription>
              Solicitud: <strong>{selectedRequest?.request_number}</strong>
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="p-3 rounded-md bg-muted/50 border text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Monto:</span>
                <span className="font-medium">{selectedRequest && formatCLP(selectedRequest.amount_clp || Math.round(selectedRequest.amount_uf * ufValue))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">UF:</span>
                <span className="text-xs">{selectedRequest && formatUF(selectedRequest.amount_uf)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Línea:</span>
                <span>{selectedRequest?.line_name}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Número de OC *</Label>
              <Input
                value={convertForm.order_number}
                onChange={(e) => setConvertForm(prev => ({ ...prev, order_number: e.target.value }))}
                placeholder="Ej: OC-2024-001"
              />
            </div>

            <div className="space-y-2">
              <Label>Proveedor</Label>
              <Input
                value={convertForm.supplier_name}
                onChange={(e) => setConvertForm(prev => ({ ...prev, supplier_name: e.target.value }))}
                placeholder="Nombre del proveedor"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConvertDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConvertToOC} disabled={converting}>
              {converting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crear OC
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar solicitud?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará la solicitud {selectedRequest?.request_number}. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View/Edit Dialog */}
      <OCRequestViewDialog
        open={showViewDialog}
        onOpenChange={setShowViewDialog}
        requestId={viewRequestId}
        formatUF={formatUF}
        ufValue={ufValue}
        onRefresh={() => {
          loadRequests();
          onRefresh?.();
        }}
      />

      {/* Cancel new request confirmation */}
      <AlertDialog open={showCancelConfirmDialog} onOpenChange={setShowCancelConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar solicitud?</AlertDialogTitle>
            <AlertDialogDescription>
              Se perderán todos los datos ingresados. ¿Desea continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowCancelConfirmDialog(false);
                setShowNewRequestDialog(false);
              }}
            >
              Sí, cancelar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* New Request Dialog */}
      <Dialog open={showNewRequestDialog} onOpenChange={setShowNewRequestDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva Solicitud de OC{contractName ? `, ${contractName}` : ""}</DialogTitle>
            <DialogDescription>
              Crear solicitud para el año {year}
            </DialogDescription>
          </DialogHeader>

          {loadingBudgets ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : availableBudgets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No hay presupuestos disponibles para el año {year}.</p>
              <p className="text-sm mt-2">Cree un presupuesto CAPEX u OPEX primero.</p>
            </div>
          ) : (
            <Tabs value={newRequestTab} onValueChange={setNewRequestTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="basic">Tipo y Datos</TabsTrigger>
                <TabsTrigger value="lines" disabled={!selectedBudgetId}>Líneas</TabsTrigger>
                <TabsTrigger value="payments" disabled={selectedLines.length === 0}>Pagos</TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="space-y-4 mt-4">
                {/* Budget Type Selection */}
                <div className="space-y-2">
                  <Label>Tipo de Presupuesto *</Label>
                  <div className="flex gap-4">
                    <Button
                      type="button"
                      variant={budgetType === "capex" ? "default" : "outline"}
                      onClick={() => handleBudgetTypeChange("capex")}
                      disabled={!capexBudget?.hasLines}
                      className="flex-1"
                    >
                      CAPEX
                      {capexBudget?.hasLines ? (
                        <Badge variant="secondary" className="ml-2 bg-green-100 text-green-700">Disponible</Badge>
                      ) : (
                        <Badge variant="secondary" className="ml-2">Sin líneas</Badge>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant={budgetType === "opex" ? "default" : "outline"}
                      onClick={() => handleBudgetTypeChange("opex")}
                      disabled={!opexBudget?.hasLines}
                      className="flex-1"
                    >
                      OPEX
                      {opexBudget?.hasLines ? (
                        <Badge variant="secondary" className="ml-2 bg-green-100 text-green-700">Disponible</Badge>
                      ) : (
                        <Badge variant="secondary" className="ml-2">Sin líneas</Badge>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label>Titulo</Label>
                  <Textarea
                    value={newRequestForm.description}
                    onChange={(e) => setNewRequestForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Titulo"
                    rows={2}
                  />
                </div>

                {/* Amount + Currency */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Monto *</Label>
                    <Input
                      type="number"
                      value={newRequestForm.amount}
                      onChange={(e) => setNewRequestForm(prev => ({ ...prev, amount: e.target.value }))}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Moneda</Label>
                    <Select 
                      value={newRequestForm.currency} 
                      onValueChange={(v: "UF" | "CLP") => setNewRequestForm(prev => ({ ...prev, currency: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UF">UF</SelectItem>
                        <SelectItem value="CLP">$</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Show equivalent */}
                {parseFloat(newRequestForm.amount) > 0 && ufValue > 0 && (
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {newRequestForm.currency === "CLP" ? (
                      <>
                        <p className="font-medium text-foreground">$ {Math.round(parseFloat(newRequestForm.amount)).toLocaleString("es-CL")}</p>
                        <p>Equivalente: UF {(parseFloat(newRequestForm.amount) / ufValue).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </>
                    ) : (
                      <>
                        <p className="font-medium text-foreground">$ {Math.round(parseFloat(newRequestForm.amount) * ufValue).toLocaleString("es-CL")}</p>
                        <p>Ingresado: UF {parseFloat(newRequestForm.amount).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </>
                    )}
                  </div>
                )}

                {/* Supplier */}
                <div className="space-y-2">
                  <Label>Proveedor *</Label>
                  <SupplierSelect
                    value={newRequestForm.supplier_id}
                    onChange={(id, name) => setNewRequestForm(prev => ({ 
                      ...prev, 
                      supplier_id: id, 
                      supplier_name: name 
                    }))}
                  />
                </div>

                {selectedBudgetId && (
                  <Button 
                    onClick={() => setNewRequestTab("lines")} 
                    className="w-full"
                  >
                    Continuar a Selección de Líneas
                  </Button>
                )}
              </TabsContent>

              <TabsContent value="lines" className="space-y-4 mt-4">
                {selectedBudgetId && (
                  <MultipleLinesSelector
                    budgetId={selectedBudgetId}
                    selectedLines={selectedLines}
                    onSelectionChange={setSelectedLines}
                    formatUF={formatUF}
                    formatCLP={formatCLP}
                    year={year}
                    contractId={contractId}
                    ufValue={ufValue}
                  />
                )}

                {selectedLines.length > 0 && (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setNewRequestTab("basic")}>
                      Atrás
                    </Button>
                    <Button onClick={() => setNewRequestTab("payments")} className="flex-1">
                      Continuar a Plan de Pagos
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="payments" className="space-y-4 mt-4">
                <div className="flex items-center justify-between">
                  <Label>Plan de Pagos (opcional)</Label>
                  <Button size="sm" variant="outline" onClick={addPaymentItem} className="gap-1">
                    <Plus className="h-3 w-3" />
                    Agregar Pago
                  </Button>
                </div>

                {paymentPlan.length === 0 ? (
                  <div className="p-4 bg-muted/30 rounded-lg text-center text-sm text-muted-foreground">
                    <p>No hay pagos planificados.</p>
                    <p className="text-xs mt-1">Se asumirá un pago único por el total de la solicitud.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {paymentPlan.map((item, idx) => {
                      const isLastRow = idx === paymentPlan.length - 1;
                      const showCuadrar = isLastRow && totalPlanned > totalSelected;
                      return (
                        <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                          <div className={`space-y-1 ${showCuadrar ? "col-span-3" : "col-span-4"}`}>
                            <Label className="text-xs">Descripción</Label>
                            <Input
                              value={item.description}
                              onChange={(e) => updatePaymentItem(idx, "description", e.target.value)}
                              placeholder={`Pago ${idx + 1}`}
                            />
                          </div>
                          <div className="col-span-3 space-y-1">
                            <Label className="text-xs">Monto ({newRequestForm.currency})</Label>
                            <Input
                              type="number"
                              value={item.amount}
                              onChange={(e) => updatePaymentItem(idx, "amount", e.target.value)}
                              placeholder="0.00"
                              step="0.01"
                            />
                          </div>
                          <div className={`space-y-1 ${showCuadrar ? "col-span-3" : "col-span-4"}`}>
                            <Label className="text-xs">Vencimiento (opcional)</Label>
                            <Input
                              type="date"
                              value={item.due_date}
                              onChange={(e) => updatePaymentItem(idx, "due_date", e.target.value)}
                            />
                          </div>
                          {showCuadrar && (
                            <div className="col-span-2">
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-9 w-full text-xs"
                                title="Ajustar este pago para que el total no supere el monto de la solicitud"
                                onClick={() => {
                                  const otherSum = paymentPlan.slice(0, -1).reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
                                  const adjusted = Math.max(0, totalSelected - otherSum);
                                  updatePaymentItem(idx, "amount", adjusted.toFixed(2));
                                }}
                              >
                                Cuadrar
                              </Button>
                            </div>
                          )}
                          <div className="col-span-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removePaymentItem(idx)}
                              className="h-9 w-9 text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}

                    <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-1">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total planificado:</span>
                        <div className="text-right">
                          <span className={`font-medium ${totalPlanned > totalSelected ? 'text-destructive' : ''}`}>
                            {newRequestForm.currency === "CLP" 
                              ? formatCLP(totalPlanned) 
                              : formatCLP(totalPlanned * (ufValue > 0 ? ufValue : 38000))}
                          </span>
                          <div className="text-[11px] text-muted-foreground">
                            {newRequestForm.currency === "CLP" 
                              ? formatUF(ufValue > 0 ? totalPlanned / ufValue : 0)
                              : formatUF(totalPlanned)}
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total solicitud:</span>
                        <div className="text-right">
                          <span className="font-medium">
                            {newRequestForm.currency === "CLP" 
                              ? formatCLP(totalSelected) 
                              : formatCLP(totalSelected * (ufValue > 0 ? ufValue : 38000))}
                          </span>
                          <div className="text-[11px] text-muted-foreground">
                            {newRequestForm.currency === "CLP" 
                              ? formatUF(ufValue > 0 ? totalSelected / ufValue : 0)
                              : formatUF(totalSelected)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setNewRequestTab("lines")}>
                    Atrás
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowCancelConfirmDialog(true)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreateNewRequest}
              disabled={
                creatingRequest ||
                selectedLines.length === 0 ||
                availableBudgets.length === 0 ||
                !newRequestForm.amount ||
                parseFloat(newRequestForm.amount) <= 0 ||
                !newRequestForm.supplier_id ||
                (paymentPlan.length > 0 && totalPlanned > totalSelected)
              }
            >
              {creatingRequest && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crear Solicitud
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
