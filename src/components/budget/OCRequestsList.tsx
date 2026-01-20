import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, FileText, Upload, Eye, Trash2, Download, Edit, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { OCRequestViewDialog } from "./OCRequestViewDialog";
import { MultipleLinesSelector } from "./MultipleLinesSelector";
import { SupplierSelect } from "@/components/suppliers/SupplierSelect";

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
  budget_type?: string; // Joined from contract_budgets
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
    supplier_id: null as string | null,
    supplier_name: null as string | null
  });
  const [creatingRequest, setCreatingRequest] = useState(false);
  const [projectName, setProjectName] = useState(contractName);
  
  const { toast } = useToast();

  useEffect(() => {
    loadRequests();
  }, [contractId, year, budgetLineId]);

  const loadRequests = async () => {
    setLoading(true);
    try {
      // First get the requests
      let query = supabase
        .from("oc_requests")
        .select("*")
        .eq("contract_id", contractId)
        .eq("year", year)
        .order("created_at", { ascending: false });
      
      if (budgetLineId) {
        query = query.eq("budget_line_id", budgetLineId);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Get budget types for each request
      const requestsWithType: OCRequest[] = [];
      const budgetIds = [...new Set((data || []).map(r => r.budget_id).filter(Boolean))];
      
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

      for (const req of (data || [])) {
        requestsWithType.push({
          ...req,
          budget_type: req.budget_id ? budgetTypeMap[req.budget_id] : undefined
        } as OCRequest);
      }

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
      // Create the actual purchase order
      const { data: ocData, error: ocError } = await supabase.from("purchase_orders").insert({
        contract_id: selectedRequest.id ? contractId : contractId,
        budget_id: budgetId,
        budget_line_id: selectedRequest.id, // This should be the original budget_line_id from request
        order_number: convertForm.order_number,
        supplier_name: convertForm.supplier_name || selectedRequest.supplier_name,
        description: selectedRequest.description,
        amount_uf: selectedRequest.amount_uf,
        amount_clp: selectedRequest.amount_clp,
        input_currency: "UF",
        uf_value_at_entry: ufValue,
        year: year,
        status: "abierta"
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
    setNewRequestForm({ description: "", supplier_id: null, supplier_name: null });
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
      
      // Load available budgets for this contract and year
      const { data: budgets } = await supabase
        .from("contract_budgets")
        .select("id, budget_type")
        .eq("contract_id", contractId)
        .eq("year", year)
        .eq("is_closed", false);
      
      if (budgets && budgets.length > 0) {
        // Check which budgets have lines with available amounts
        const budgetsWithLines = await Promise.all(budgets.map(async (budget) => {
          const { count } = await supabase
            .from("budget_lines")
            .select("*", { count: "exact", head: true })
            .eq("budget_id", budget.id)
            .eq("status", "autorizado");
          
          return {
            id: budget.id,
            type: budget.budget_type,
            hasLines: (count || 0) > 0
          };
        }));
        
        setAvailableBudgets(budgetsWithLines);
        
        // Auto-select first available budget
        const firstWithLines = budgetsWithLines.find(b => b.hasLines);
        if (firstWithLines) {
          setBudgetType(firstWithLines.type as "capex" | "opex");
          setSelectedBudgetId(firstWithLines.id);
        }
      } else {
        setAvailableBudgets([]);
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
    const validLines = selectedLines.filter(l => l.amount > 0);
    if (validLines.length === 0) {
      toast({ variant: "destructive", title: "Error", description: "Seleccione al menos una línea con monto" });
      return;
    }

    const totalAmount = Math.round(validLines.reduce((sum, l) => sum + l.amount, 0) * 10000) / 10000;
    const lineNames = validLines.map(l => l.lineName);
    const displayLineName = lineNames.join(' + ');

    setCreatingRequest(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { number, correlative } = await generateRequestNumber(lineNames);
      
      // Use provided UF value or fallback
      const currentUfValue = ufValue > 0 ? ufValue : 38000;
      const amountClp = Math.round(totalAmount * currentUfValue);

      // Create request
      const { data: requestData, error } = await supabase.from("oc_requests").insert({
        contract_id: contractId,
        budget_id: selectedBudgetId,
        budget_line_id: validLines.length === 1 ? validLines[0].lineId : null,
        request_number: number,
        correlative_of_day: correlative,
        request_date: new Date().toISOString().split('T')[0],
        line_name: displayLineName,
        project_name: projectName,
        description: newRequestForm.description,
        amount_uf: totalAmount,
        amount_clp: amountClp,
        input_currency: "UF",
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
            .map((p, idx) => ({
              oc_request_id: requestData.id,
              payment_number: idx + 1,
              description: p.description || `Pago ${idx + 1}`,
              amount_uf: parseFloat(p.amount),
              due_date: p.due_date || null,
              status: "pending"
            }));
          if (planEntries.length > 0) {
            await supabase.from("oc_payment_plans").insert(planEntries);
          }
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

  // Filter requests by budget type
  const filteredRequests = budgetTypeFilter === "all" 
    ? requests 
    : requests.filter(r => r.budget_type === budgetTypeFilter);
  
  const pendingRequests = filteredRequests.filter(r => r.status === "pending");
  const convertedRequests = filteredRequests.filter(r => r.status === "converted");

  const totalPlanned = paymentPlan.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const totalSelected = selectedLines.reduce((sum, l) => sum + l.amount, 0);

  const capexBudget = availableBudgets.find(b => b.type === "capex");
  const opexBudget = availableBudgets.find(b => b.type === "opex");

  // Count by type for filter badges
  const capexCount = requests.filter(r => r.budget_type === "capex").length;
  const opexCount = requests.filter(r => r.budget_type === "opex").length;

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
              Todos ({requests.length})
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
          <Button size="sm" onClick={handleOpenNewRequestDialog} className="gap-2">
            <Plus className="h-4 w-4" />
            Nueva Solicitud
          </Button>
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
                  <TableCell className="text-right">{formatUF(request.amount_uf)}</TableCell>
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
                  <TableCell className="text-right">{formatUF(request.amount_uf)}</TableCell>
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
                <span className="font-medium">{selectedRequest && formatUF(selectedRequest.amount_uf)}</span>
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
        onRefresh={() => {
          loadRequests();
          onRefresh?.();
        }}
      />

      {/* New Request Dialog */}
      <Dialog open={showNewRequestDialog} onOpenChange={setShowNewRequestDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva Solicitud de OC</DialogTitle>
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
                  <Label>Descripción</Label>
                  <Textarea
                    value={newRequestForm.description}
                    onChange={(e) => setNewRequestForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Descripción de la solicitud"
                    rows={2}
                  />
                </div>

                {/* Supplier */}
                <div className="space-y-2">
                  <Label>Proveedor (opcional)</Label>
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
                    No hay pagos planificados. Puede agregar pagos ahora o después.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {paymentPlan.map((item, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-4 space-y-1">
                          <Label className="text-xs">Descripción</Label>
                          <Input
                            value={item.description}
                            onChange={(e) => updatePaymentItem(idx, "description", e.target.value)}
                            placeholder={`Pago ${idx + 1}`}
                          />
                        </div>
                        <div className="col-span-3 space-y-1">
                          <Label className="text-xs">Monto (UF)</Label>
                          <Input
                            type="number"
                            value={item.amount}
                            onChange={(e) => updatePaymentItem(idx, "amount", e.target.value)}
                            placeholder="0.00"
                            step="0.01"
                          />
                        </div>
                        <div className="col-span-4 space-y-1">
                          <Label className="text-xs">Vencimiento (opcional)</Label>
                          <Input
                            type="date"
                            value={item.due_date}
                            onChange={(e) => updatePaymentItem(idx, "due_date", e.target.value)}
                          />
                        </div>
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
                    ))}

                    <div className="p-3 bg-muted/50 rounded-lg text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total planificado:</span>
                        <span className={`font-medium ${totalPlanned > totalSelected ? 'text-destructive' : ''}`}>
                          {formatUF(totalPlanned)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total solicitud:</span>
                        <span className="font-medium">{formatUF(totalSelected)}</span>
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
            <Button variant="outline" onClick={() => setShowNewRequestDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCreateNewRequest} 
              disabled={creatingRequest || selectedLines.length === 0 || availableBudgets.length === 0}
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
