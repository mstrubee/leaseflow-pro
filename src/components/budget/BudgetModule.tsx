import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Lock, AlertTriangle, RefreshCw, ChevronsUpDown, ChevronsDownUp } from "lucide-react";
import { OpexConsumptionPieChart } from "./OpexConsumptionPieChart";
import { useToast } from "@/hooks/use-toast";
import { BudgetLineTree, BudgetLine, calculateAuthorizedTotal, calculateUnauthorizedTotal, getUnauthorizedLines, getAllDescendantIds, hasDescendants } from "./BudgetLineTree";
import { BudgetSemaphore } from "./BudgetSemaphore";
import { useBudgetContext } from "./BudgetContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { BudgetTemplateSelector, updateBudgetTemplatePreservingValues, getCurrentTemplateId } from "./BudgetTemplateSelector";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OCRequestDialog } from "./OCRequestDialog";
import { QuotationsManager } from "./QuotationsManager";

interface Budget {
  id: string;
  contract_id: string;
  year: number;
  budget_type: string;
  amount_uf: number;
  is_closed: boolean;
  closed_at: string | null;
}

interface BudgetModuleProps {
  contractId: string;
  contractName?: string;
  budgetType: "capex" | "opex";
  title: string;
  selectedYear: number;
  ocTotal?: number;
  onRefresh?: () => void;
}

export const BudgetModule = ({ contractId, contractName = "", budgetType, title, selectedYear, ocTotal = 0, onRefresh }: BudgetModuleProps) => {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Update template state
  const [showUpdateTemplateDialog, setShowUpdateTemplateDialog] = useState(false);
  const [showUpdateTemplateConfirm, setShowUpdateTemplateConfirm] = useState(false);
  const [updateTemplateId, setUpdateTemplateId] = useState("");
  const [updatingTemplate, setUpdatingTemplate] = useState(false);
  
  // State propagation dialog
  const [showStatePropagation, setShowStatePropagation] = useState(false);
  const [pendingStatusChange, setPendingStatusChange] = useState<{ id: string; newStatus: "autorizado" | "no_autorizado"; hasChildren: boolean } | null>(null);
  
  // OC Dialog state
  const [showOCDialog, setShowOCDialog] = useState(false);
  const [ocBudgetLineId, setOcBudgetLineId] = useState("");
  const [ocLineName, setOcLineName] = useState("");
  const [ocLineAvailable, setOcLineAvailable] = useState(0);
  const [ocLineBudget, setOcLineBudget] = useState(0);
  const [loadingLineAvailable, setLoadingLineAvailable] = useState(false);
  const [ocForm, setOcForm] = useState({
    order_number: "",
    supplier_name: "",
    description: "",
    amount: "",
    currency: "UF"
  });
  const [creatingOC, setCreatingOC] = useState(false);

  // Invoice Dialog state  
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [invoiceBudgetLineId, setInvoiceBudgetLineId] = useState("");
  const [invoiceLineName, setInvoiceLineName] = useState("");
  const [lineOCs, setLineOCs] = useState<{ id: string; order_number: string; supplier_name: string | null; amount_uf: number }[]>([]);
  const [loadingLineOCs, setLoadingLineOCs] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({
    invoice_number: "",
    invoice_date: new Date().toISOString().split('T')[0],
    amount: "",
    currency: "UF",
    purchase_order_id: ""
  });
  const [creatingInvoice, setCreatingInvoice] = useState(false);

  // Line Details Dialog state
  const [showLineDetailsDialog, setShowLineDetailsDialog] = useState(false);
  const [lineDetailsId, setLineDetailsId] = useState("");
  const [lineDetailsName, setLineDetailsName] = useState("");
  const [lineDetailsOCs, setLineDetailsOCs] = useState<{
    id: string;
    order_number: string;
    supplier_name: string | null;
    amount_uf: number;
    status: string;
    invoices: { id: string; invoice_number: string; amount_uf: number; invoice_date: string }[];
    credit_notes: { id: string; credit_note_number: string; amount_uf: number; invoice_id: string }[];
  }[]>([]);
  const [lineDetailsRequests, setLineDetailsRequests] = useState<{
    id: string;
    request_number: string;
    amount_uf: number;
    status: string;
    supplier_name: string | null;
    request_date: string;
  }[]>([]);
  const [loadingLineDetails, setLoadingLineDetails] = useState(false);
  
  // Global expand/collapse state
  const [globalExpandState, setGlobalExpandState] = useState<"expanded" | "collapsed" | null>(null);
  
  // OC Request Dialog state
  const [showOCRequestDialog, setShowOCRequestDialog] = useState(false);
  const [ocRequestLineId, setOcRequestLineId] = useState("");
  const [ocRequestLineName, setOcRequestLineName] = useState("");
  const [ocRequestLineAvailable, setOcRequestLineAvailable] = useState(0);
  const [ocRequestLineBudget, setOcRequestLineBudget] = useState(0);
  
  const { toast } = useToast();
  const { formatUF, formatCLP, convertUFToPesos, ufValue } = useBudgetContext();

  useEffect(() => {
    loadBudgets();
  }, [contractId, budgetType]);

  useEffect(() => {
    if (budgets.length > 0) {
      const budget = budgets.find((b) => b.year === selectedYear);
      if (budget) {
        loadLines(budget.id);
      } else {
        setLines([]);
      }
    } else {
      setLines([]);
    }
  }, [selectedYear, budgets]);

  const loadBudgets = async () => {
    try {
      const { data, error } = await supabase
        .from("contract_budgets")
        .select("*")
        .eq("contract_id", contractId)
        .eq("budget_type", budgetType)
        .order("year", { ascending: false });

      if (error) throw error;
      setBudgets(data || []);
    } catch (error) {
      console.error("Error loading budgets:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadLines = async (budgetId: string) => {
    try {
      const { data, error } = await supabase
        .from("budget_lines")
        .select("*")
        .eq("budget_id", budgetId)
        .order("display_order");

      if (error) throw error;
      setLines(buildTree((data || []) as BudgetLine[]));
    } catch (error) {
      console.error("Error loading lines:", error);
    }
  };

  const buildTree = (flatLines: BudgetLine[]): BudgetLine[] => {
    const map = new Map<string, BudgetLine>();
    const roots: BudgetLine[] = [];

    flatLines.forEach((line) => {
      map.set(line.id, { ...line, children: [] });
    });

    flatLines.forEach((line) => {
      const node = map.get(line.id)!;
      if (line.parent_id) {
        const parent = map.get(line.parent_id);
        if (parent) {
          parent.children!.push(node);
        }
      } else {
        roots.push(node);
      }
    });

    return roots;
  };

  const handleAddLine = async (parentId: string | null) => {
    const budget = budgets.find((b) => b.year === selectedYear);
    if (!budget || budget.is_closed) return;

    try {
      const { error } = await supabase.from("budget_lines").insert({
        budget_id: budget.id,
        parent_id: parentId,
        name: "Nueva línea",
        amount_uf: 0,
        status: "no_autorizado",
        quantity: 0,
        unit_type: "m2",
        currency: "UF",
        unit_price: 0,
      });

      if (error) throw error;
      loadLines(budget.id);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const handleUpdateLine = async (id: string, data: Partial<BudgetLine>) => {
    const budget = budgets.find((b) => b.year === selectedYear);
    if (budget?.is_closed) return;

    // Check if this is a status change and the line has children
    if (data.status) {
      const hasChildren = hasDescendantsCheck(id);
      if (hasChildren) {
        setPendingStatusChange({ id, newStatus: data.status, hasChildren: true });
        setShowStatePropagation(true);
        return;
      }
    }

    await applyLineUpdate(id, data);
  };

  const hasDescendantsCheck = (lineId: string): boolean => {
    return hasDescendants(lines, lineId);
  };

  const applyLineUpdate = async (id: string, data: Partial<BudgetLine>) => {
    const budget = budgets.find((b) => b.year === selectedYear);
    try {
      const { error } = await supabase.from("budget_lines").update(data).eq("id", id);
      if (error) throw error;
      
      if (budget) loadLines(budget.id);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const handleConfirmStatusPropagation = async (applyToChildren: boolean) => {
    if (!pendingStatusChange) return;
    
    const budget = budgets.find((b) => b.year === selectedYear);
    if (!budget) return;

    try {
      // Update the parent line
      await supabase.from("budget_lines").update({ status: pendingStatusChange.newStatus }).eq("id", pendingStatusChange.id);

      // If apply to children, update all descendants
      if (applyToChildren) {
        const descendantIds = getAllDescendantIds(lines, pendingStatusChange.id);
        if (descendantIds.length > 0) {
          await supabase
            .from("budget_lines")
            .update({ status: pendingStatusChange.newStatus })
            .in("id", descendantIds);
        }
      }

      loadLines(budget.id);
      toast({ 
        title: "Estado actualizado", 
        description: applyToChildren 
          ? "Estado aplicado a la línea y todas sus sublíneas" 
          : "Estado aplicado solo a la línea seleccionada"
      });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setShowStatePropagation(false);
      setPendingStatusChange(null);
    }
  };

  const handleDeleteLine = async (id: string) => {
    const budget = budgets.find((b) => b.year === selectedYear);
    if (budget?.is_closed) return;

    try {
      const { error } = await supabase.from("budget_lines").delete().eq("id", id);
      if (error) throw error;
      
      if (budget) loadLines(budget.id);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  // Handle opening OC Request dialog from budget line
  const handleCreateOCRequestFromLine = async (budgetLineId: string, lineName: string) => {
    setOcRequestLineId(budgetLineId);
    setOcRequestLineName(lineName);
    
    // Find the line recursively
    const findLine = (items: BudgetLine[]): BudgetLine | null => {
      for (const item of items) {
        if (item.id === budgetLineId) return item;
        if (item.children?.length) {
          const found = findLine(item.children);
          if (found) return found;
        }
      }
      return null;
    };
    
    const budgetLine = findLine(lines);
    const lineAmount = budgetLine?.amount_uf || 0;
    setOcRequestLineBudget(lineAmount);
    
    // Calculate available (budget - existing OCs - existing requests)
    try {
      const [{ data: existingOCs }, { data: existingRequests }] = await Promise.all([
        supabase
          .from("purchase_orders")
          .select("amount_uf")
          .eq("budget_line_id", budgetLineId)
          .eq("year", selectedYear),
        supabase
          .from("oc_requests")
          .select("amount_uf")
          .eq("budget_line_id", budgetLineId)
          .eq("year", selectedYear)
          .eq("status", "pending")
      ]);
      
      const usedByOC = (existingOCs || []).reduce((sum, oc) => sum + oc.amount_uf, 0);
      const usedByRequests = (existingRequests || []).reduce((sum, r) => sum + r.amount_uf, 0);
      setOcRequestLineAvailable(lineAmount - usedByOC - usedByRequests);
    } catch (error) {
      console.error("Error calculating available:", error);
      setOcRequestLineAvailable(lineAmount);
    }
    
    setShowOCRequestDialog(true);
  };

  // Handle opening OC dialog from budget line
  const handleCreateOCFromLine = async (budgetLineId: string, lineName: string) => {
    setOcBudgetLineId(budgetLineId);
    setOcLineName(lineName);
    setOcForm({
      order_number: "",
      supplier_name: "",
      description: lineName,
      amount: "",
      currency: "UF"
    });
    setShowOCDialog(true);
    setLoadingLineAvailable(true);
    
    try {
      // Find the line recursively
      const findLine = (items: BudgetLine[]): BudgetLine | null => {
        for (const item of items) {
          if (item.id === budgetLineId) return item;
          if (item.children?.length) {
            const found = findLine(item.children);
            if (found) return found;
          }
        }
        return null;
      };
      
      const budgetLine = findLine(lines);
      const lineAmount = budgetLine?.amount_uf || 0;
      setOcLineBudget(lineAmount);
      
      // Get existing OCs for this line to calculate used amount
      const { data: existingOCs } = await supabase
        .from("purchase_orders")
        .select("amount_uf")
        .eq("budget_line_id", budgetLineId)
        .eq("year", selectedYear);
      
      const usedAmount = (existingOCs || []).reduce((sum, oc) => sum + oc.amount_uf, 0);
      setOcLineAvailable(lineAmount - usedAmount);
    } catch (error) {
      console.error("Error calculating available amount:", error);
      setOcLineAvailable(0);
    } finally {
      setLoadingLineAvailable(false);
    }
  };

  // Handle creating OC
  const handleCreateOC = async () => {
    const budget = budgets.find((b) => b.year === selectedYear);
    if (!budget) return;

    const amount = parseFloat(ocForm.amount) || 0;
    let amountUf = amount;

    if (ocForm.currency === "CLP" && ufValue > 0) {
      amountUf = amount / ufValue;
    }

    // Validate that the OC doesn't exceed available amount
    if (amountUf > ocLineAvailable + 0.01) {
      toast({ 
        variant: "destructive", 
        title: "Monto excede disponible", 
        description: `El monto de la OC (${formatUF(amountUf)}) supera el disponible de la línea (${formatUF(ocLineAvailable)})` 
      });
      return;
    }

    setCreatingOC(true);
    try {
      let amountClp = 0;

      if (ocForm.currency === "CLP" && ufValue > 0) {
        amountClp = amount;
      } else {
        amountClp = amount * ufValue;
      }

      const { error } = await supabase.from("purchase_orders").insert({
        contract_id: contractId,
        budget_id: budget.id,
        budget_line_id: ocBudgetLineId,
        order_number: ocForm.order_number,
        supplier_name: ocForm.supplier_name,
        description: ocForm.description,
        amount_uf: amountUf,
        amount_clp: amountClp,
        input_currency: ocForm.currency,
        uf_value_at_entry: ufValue,
        year: selectedYear,
        status: "abierta"
      });

      if (error) throw error;

      toast({ title: "OC creada", description: `Orden de compra ${ocForm.order_number} creada exitosamente` });
      setShowOCDialog(false);
      onRefresh?.();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setCreatingOC(false);
    }
  };

  // Handle opening Invoice dialog from budget line
  const handleCreateInvoiceFromLine = async (budgetLineId: string, lineName: string) => {
    setInvoiceBudgetLineId(budgetLineId);
    setInvoiceLineName(lineName);
    setInvoiceForm({
      invoice_number: "",
      invoice_date: new Date().toISOString().split('T')[0],
      amount: "",
      currency: "UF",
      purchase_order_id: ""
    });
    setShowInvoiceDialog(true);
    
    // Load existing OCs for this budget line
    setLoadingLineOCs(true);
    try {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, order_number, supplier_name, amount_uf")
        .eq("budget_line_id", budgetLineId)
        .eq("year", selectedYear)
        .order("order_date", { ascending: false });

      if (error) throw error;
      setLineOCs(data || []);
    } catch (error) {
      console.error("Error loading OCs for line:", error);
      setLineOCs([]);
    } finally {
      setLoadingLineOCs(false);
    }
  };

  // Handle creating Invoice - must select existing OC
  const handleCreateInvoice = async () => {
    if (!invoiceForm.purchase_order_id) {
      toast({ variant: "destructive", title: "Error", description: "Debe seleccionar una Orden de Compra" });
      return;
    }

    setCreatingInvoice(true);
    try {
      const amount = parseFloat(invoiceForm.amount) || 0;
      let amountUf = amount;
      let amountClp = 0;

      if (invoiceForm.currency === "CLP" && ufValue > 0) {
        amountUf = amount / ufValue;
        amountClp = amount;
      } else {
        amountClp = amount * ufValue;
      }

      // Create the invoice with selected OC
      const { error } = await supabase.from("invoices").insert({
        purchase_order_id: invoiceForm.purchase_order_id,
        invoice_number: invoiceForm.invoice_number,
        invoice_date: invoiceForm.invoice_date,
        amount_uf: amountUf,
        amount_clp: amountClp,
        input_currency: invoiceForm.currency,
        uf_value_at_entry: ufValue,
        reception_status: "pendiente"
      });

      if (error) throw error;

      toast({ title: "Factura registrada", description: `Factura ${invoiceForm.invoice_number} creada exitosamente` });
      setShowInvoiceDialog(false);
      onRefresh?.();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setCreatingInvoice(false);
    }
  };

  // Handler to view line details (OCs, invoices, credit notes, requests)
  const handleViewLineDetails = async (budgetLineId: string, lineName: string) => {
    setLineDetailsId(budgetLineId);
    setLineDetailsName(lineName);
    setShowLineDetailsDialog(true);
    setLoadingLineDetails(true);

    try {
      // Fetch OCs for this budget line
      const { data: ocs, error: ocsError } = await supabase
        .from("purchase_orders")
        .select("id, order_number, supplier_name, amount_uf, status")
        .eq("budget_line_id", budgetLineId)
        .order("order_date", { ascending: false });

      if (ocsError) throw ocsError;

      // Fetch OC Requests for this line
      const { data: requests } = await supabase
        .from("oc_requests")
        .select("id, request_number, amount_uf, status, supplier_name, request_date")
        .eq("budget_line_id", budgetLineId)
        .order("created_at", { ascending: false });
      
      setLineDetailsRequests((requests || []) as any);

      // For each OC, fetch invoices and credit notes
      const ocsWithDetails = await Promise.all(
        (ocs || []).map(async (oc) => {
          const { data: invoices } = await supabase
            .from("invoices")
            .select("id, invoice_number, amount_uf, invoice_date")
            .eq("purchase_order_id", oc.id)
            .order("invoice_date", { ascending: false });

          const { data: creditNotes } = await supabase
            .from("credit_notes")
            .select("id, credit_note_number, amount_uf, invoice_id")
            .eq("purchase_order_id", oc.id)
            .order("credit_note_date", { ascending: false });

          return {
            ...oc,
            invoices: invoices || [],
            credit_notes: creditNotes || [],
          };
        })
      );

      setLineDetailsOCs(ocsWithDetails);
    } catch (error) {
      console.error("Error loading line details:", error);
      toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar los detalles" });
    } finally {
      setLoadingLineDetails(false);
    }
  };

  const handleUpdateTemplate = async () => {
    const budget = budgets.find((b) => b.year === selectedYear);
    if (!budget || !updateTemplateId) return;

    setUpdatingTemplate(true);
    try {
      // Use the new function that preserves user values
      const success = await updateBudgetTemplatePreservingValues(updateTemplateId, budget.id);
      if (!success) {
        throw new Error("Error al aplicar la plantilla");
      }

      toast({
        title: "Plantilla actualizada",
        description: "La estructura del presupuesto ha sido actualizada. Los valores existentes se han conservado.",
      });
      
      setShowUpdateTemplateConfirm(false);
      setShowUpdateTemplateDialog(false);
      setUpdateTemplateId("");
      loadLines(budget.id);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setUpdatingTemplate(false);
    }
  };

  const currentBudget = budgets.find((b) => b.year === selectedYear);
  const authorizedTotal = calculateAuthorizedTotal(lines);
  const unauthorizedTotal = calculateUnauthorizedTotal(lines);
  const budgetAmount = currentBudget?.amount_uf || 0;
  const isClosed = currentBudget?.is_closed || false;
  const unauthorizedCount = getUnauthorizedLines(lines).length;

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
          {title}
          {isClosed && (
            <div className="flex items-center gap-1 text-muted-foreground text-sm font-normal">
              <Lock className="h-4 w-4" />
              <span>Cerrado</span>
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {currentBudget ? (
          <>
            <div className="grid grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Autorizado</p>
                <p className="text-xl font-bold text-green-600">{formatUF(authorizedTotal)}</p>
                <BudgetSemaphore budget={authorizedTotal} consumed={ocTotal} />
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Consumido (OC)</p>
                <p className="text-xl font-bold text-orange-600">{formatUF(ocTotal)}</p>
                <p className="text-sm text-muted-foreground">{formatCLP(convertUFToPesos(ocTotal))}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Disponible</p>
                {(() => {
                  const disponible = authorizedTotal - ocTotal;
                  const isSobrepasado = ocTotal > authorizedTotal;
                  return (
                    <>
                      <p className={`text-xl font-bold ${isSobrepasado ? "text-destructive" : "text-foreground"}`}>
                        {isSobrepasado ? "-" : ""}{formatUF(Math.abs(disponible))}
                        {isSobrepasado && " (Sobrepasado)"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatCLP(convertUFToPesos(Math.abs(disponible)))}
                      </p>
                    </>
                  );
                })()}
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">No Autorizado</p>
                <p className="text-xl font-bold text-yellow-600">{formatUF(unauthorizedTotal)}</p>
                <p className="text-xs text-muted-foreground">Se arrastra al próx. año</p>
              </div>
            </div>

            {unauthorizedCount > 0 && !isClosed && (
              <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <AlertTitle className="text-yellow-700">Ítems pendientes de autorización</AlertTitle>
                <AlertDescription className="text-yellow-600">
                  {unauthorizedCount} ítem(s) no autorizado(s) por {formatUF(unauthorizedTotal)}. 
                  Al cerrar el año, estos se arrastrarán automáticamente al año siguiente.
                </AlertDescription>
              </Alert>
            )}

            {!isClosed && currentBudget && (
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setGlobalExpandState(null);
                    setTimeout(() => setGlobalExpandState("expanded"), 0);
                  }}
                  className="gap-1"
                  title="Expandir todas las líneas"
                >
                  <ChevronsUpDown className="h-4 w-4" />
                  Expandir
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setGlobalExpandState(null);
                    setTimeout(() => setGlobalExpandState("collapsed"), 0);
                  }}
                  className="gap-1"
                  title="Colapsar todas las líneas"
                >
                  <ChevronsDownUp className="h-4 w-4" />
                  Colapsar
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={async () => {
                    // Pre-load the current template ID
                    const currentTemplateIdLoaded = await getCurrentTemplateId(currentBudget.id);
                    setUpdateTemplateId(currentTemplateIdLoaded || "");
                    setShowUpdateTemplateDialog(true);
                  }}
                  className="gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Actualizar Plantilla
                </Button>
              </div>
            )}

            <BudgetLineTree
              lines={lines}
              onAddLine={handleAddLine}
              onUpdateLine={handleUpdateLine}
              onDeleteLine={handleDeleteLine}
              onCreateOC={handleCreateOCFromLine}
              onCreateOCRequest={handleCreateOCRequestFromLine}
              onCreateInvoice={handleCreateInvoiceFromLine}
              onViewLineDetails={handleViewLineDetails}
              readOnly={isClosed}
              globalExpandState={globalExpandState}
            />
          </>
        ) : budgetType === "opex" ? (
          <OpexConsumptionPieChart contractId={contractId} year={selectedYear} />
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>No hay presupuesto de {title.toLowerCase()} para el año {selectedYear}</p>
            <p className="text-sm mt-2">Use "+ Nuevo Año CAPEX" para crear un presupuesto.</p>
          </div>
        )}
      </CardContent>

      {/* AlertDialog: Propagación de estado */}
      <AlertDialog open={showStatePropagation} onOpenChange={setShowStatePropagation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cambiar estado de línea</AlertDialogTitle>
            <AlertDialogDescription>
              Esta línea tiene sublíneas dependientes. ¿Desea aplicar el estado "{pendingStatusChange?.newStatus === "autorizado" ? "Autorizado" : "No Autorizado"}" a todas las subcategorías?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowStatePropagation(false);
              setPendingStatusChange(null);
            }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => handleConfirmStatusPropagation(false)}>
              Solo esta línea
            </AlertDialogAction>
            <AlertDialogAction onClick={() => handleConfirmStatusPropagation(true)}>
              Aplicar a todas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: Actualizar Plantilla */}
      <Dialog open={showUpdateTemplateDialog} onOpenChange={setShowUpdateTemplateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Actualizar Plantilla - {title}</DialogTitle>
            <DialogDescription>
              Seleccione una nueva plantilla para reemplazar la estructura actual del presupuesto.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <BudgetTemplateSelector
              budgetType={budgetType}
              value={updateTemplateId}
              onChange={setUpdateTemplateId}
              label="Seleccionar plantilla"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowUpdateTemplateDialog(false);
              setUpdateTemplateId("");
            }}>
              Cancelar
            </Button>
            <Button 
              onClick={() => {
                setShowUpdateTemplateDialog(false);
                setShowUpdateTemplateConfirm(true);
              }}
              disabled={!updateTemplateId}
            >
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog: Confirmación de actualización de plantilla */}
      <AlertDialog open={showUpdateTemplateConfirm} onOpenChange={setShowUpdateTemplateConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-amber-600">⚠️ Confirmar Actualización de Plantilla</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>¿Está seguro de reemplazar el presupuesto actual por esta plantilla?</p>
              <p className="font-semibold">Todos los montos se reiniciarán a 0.</p>
              <p className="text-sm text-muted-foreground">
                Las líneas actuales serán eliminadas y reemplazadas por la estructura de la nueva plantilla.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowUpdateTemplateConfirm(false);
              setUpdateTemplateId("");
            }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleUpdateTemplate}
              disabled={updatingTemplate}
            >
              {updatingTemplate && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Sí, reemplazar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: Create OC from Budget Line */}
      <Dialog open={showOCDialog} onOpenChange={setShowOCDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear Orden de Compra</DialogTitle>
            <DialogDescription>
              Nueva OC para: <strong>{ocLineName}</strong>
            </DialogDescription>
          </DialogHeader>
          
          {/* Available amount info */}
          <div className="p-3 rounded-md bg-muted/50 border">
            {loadingLineAvailable ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Calculando disponible...
              </div>
            ) : (
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Presupuesto de línea:</span>
                  <span className="font-medium">{formatUF(ocLineBudget)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Disponible para OC:</span>
                  <span className={`font-semibold ${ocLineAvailable <= 0 ? 'text-destructive' : 'text-green-600 dark:text-green-400'}`}>
                    {formatUF(ocLineAvailable)}
                  </span>
                </div>
              </div>
            )}
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="oc_number">Número de OC *</Label>
              <Input
                id="oc_number"
                value={ocForm.order_number}
                onChange={(e) => setOcForm({ ...ocForm, order_number: e.target.value })}
                placeholder="Ej: OC-001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="oc_supplier">Proveedor</Label>
              <Input
                id="oc_supplier"
                value={ocForm.supplier_name}
                onChange={(e) => setOcForm({ ...ocForm, supplier_name: e.target.value })}
                placeholder="Nombre del proveedor"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="oc_description">Descripción</Label>
              <Input
                id="oc_description"
                value={ocForm.description}
                onChange={(e) => setOcForm({ ...ocForm, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="oc_amount">Monto *</Label>
                <Input
                  id="oc_amount"
                  type="number"
                  value={ocForm.amount}
                  onChange={(e) => setOcForm({ ...ocForm, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="oc_currency">Moneda</Label>
                <Select value={ocForm.currency} onValueChange={(val) => setOcForm({ ...ocForm, currency: val })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UF">UF</SelectItem>
                    <SelectItem value="CLP">CLP ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOCDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCreateOC} 
              disabled={creatingOC || !ocForm.order_number || !ocForm.amount || ocLineAvailable <= 0 || loadingLineAvailable}
            >
              {creatingOC && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crear OC
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Create Invoice from Budget Line */}
      <Dialog open={showInvoiceDialog} onOpenChange={setShowInvoiceDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Factura</DialogTitle>
            <DialogDescription>
              Nueva factura para: <strong>{invoiceLineName}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* OC Selection */}
            <div className="space-y-2">
              <Label htmlFor="inv_oc">Orden de Compra *</Label>
              {loadingLineOCs ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cargando OC...
                </div>
              ) : lineOCs.length === 0 ? (
                <div className="p-3 border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20 rounded-md">
                  <p className="text-sm text-yellow-700 dark:text-yellow-400">
                    No hay órdenes de compra asociadas a esta línea. 
                    Primero debe crear una OC para poder registrar facturas.
                  </p>
                </div>
              ) : (
                <Select 
                  value={invoiceForm.purchase_order_id} 
                  onValueChange={(val) => setInvoiceForm({ ...invoiceForm, purchase_order_id: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccione una OC" />
                  </SelectTrigger>
                  <SelectContent>
                    {lineOCs.map((oc) => (
                      <SelectItem key={oc.id} value={oc.id}>
                        {oc.order_number} - {oc.supplier_name || "Sin proveedor"} ({formatUF(oc.amount_uf)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="inv_number">Número de Factura *</Label>
              <Input
                id="inv_number"
                value={invoiceForm.invoice_number}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, invoice_number: e.target.value })}
                placeholder="Ej: F-001"
                disabled={lineOCs.length === 0}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv_date">Fecha</Label>
              <Input
                id="inv_date"
                type="date"
                value={invoiceForm.invoice_date}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, invoice_date: e.target.value })}
                disabled={lineOCs.length === 0}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="inv_amount">Monto *</Label>
                <Input
                  id="inv_amount"
                  type="number"
                  value={invoiceForm.amount}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.target.value })}
                  placeholder="0.00"
                  disabled={lineOCs.length === 0}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv_currency">Moneda</Label>
                <Select 
                  value={invoiceForm.currency} 
                  onValueChange={(val) => setInvoiceForm({ ...invoiceForm, currency: val })}
                  disabled={lineOCs.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UF">UF</SelectItem>
                    <SelectItem value="CLP">CLP ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvoiceDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCreateInvoice} 
              disabled={creatingInvoice || !invoiceForm.invoice_number || !invoiceForm.amount || !invoiceForm.purchase_order_id || lineOCs.length === 0}
            >
              {creatingInvoice && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Registrar Factura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Line Details - OCs, Invoices, Credit Notes */}
      <Dialog open={showLineDetailsDialog} onOpenChange={setShowLineDetailsDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle de Línea: {lineDetailsName}</DialogTitle>
            <DialogDescription>
              Órdenes de compra, facturas y notas de crédito asociadas
            </DialogDescription>
          </DialogHeader>
          
          {loadingLineDetails ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="ml-2">Cargando...</span>
            </div>
          ) : lineDetailsOCs.length === 0 && lineDetailsRequests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No hay órdenes de compra ni solicitudes asociadas a esta línea.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* OC Requests Section */}
              {lineDetailsRequests.length > 0 && (
                <div className="border rounded-lg p-4 space-y-2 bg-purple-50/50 dark:bg-purple-950/20">
                  <h4 className="font-medium text-sm text-purple-700 dark:text-purple-300">
                    Solicitudes de OC ({lineDetailsRequests.length})
                  </h4>
                  {lineDetailsRequests.map((req) => (
                    <div key={req.id} className="flex items-center justify-between text-sm p-2 bg-background rounded">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs">{req.request_number}</span>
                        <Badge variant={req.status === "converted" ? "default" : "secondary"}
                          className={req.status === "converted" ? "bg-green-500" : "bg-yellow-500"}>
                          {req.status === "converted" ? "Convertida" : "Pendiente"}
                        </Badge>
                      </div>
                      <span className="font-mono">{formatUF(req.amount_uf)}</span>
                    </div>
                  ))}
                </div>
              )}
              
              {/* OCs Section */}
              {lineDetailsOCs.map((oc) => {
                const totalInvoiced = oc.invoices.reduce((sum, inv) => sum + inv.amount_uf, 0);
                const totalCreditNotes = oc.credit_notes.reduce((sum, cn) => sum + cn.amount_uf, 0);
                const netInvoiced = totalInvoiced - totalCreditNotes;
                
                return (
                  <div key={oc.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{oc.order_number}</span>
                        <span className="text-sm text-muted-foreground">
                          {oc.supplier_name || "Sin proveedor"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{formatUF(oc.amount_uf)}</span>
                        <Badge 
                          variant={
                            oc.status === "cerrada" ? "default" : 
                            oc.status === "descuadrada" ? "destructive" : 
                            "secondary"
                          }
                          className={oc.status === "cerrada" ? "bg-blue-500" : oc.status === "abierta" ? "bg-green-500" : ""}
                        >
                          {oc.status === "cerrada" ? "Cerrada" : oc.status === "descuadrada" ? "Sobrepasado" : "OK"}
                        </Badge>
                      </div>
                    </div>

                    {/* Invoices */}
                    {oc.invoices.length > 0 && (
                      <div className="pl-4 border-l-2 border-green-200">
                        <p className="text-xs font-medium text-green-700 mb-1">Facturas</p>
                        <div className="space-y-1">
                          {oc.invoices.map((inv) => {
                            const invCreditNotes = oc.credit_notes.filter(cn => cn.invoice_id === inv.id);
                            return (
                              <div key={inv.id} className="text-sm flex items-center justify-between py-1">
                                <span>{inv.invoice_number}</span>
                                <div className="flex items-center gap-4">
                                  <span className="text-muted-foreground text-xs">
                                    {new Date(inv.invoice_date).toLocaleDateString("es-CL")}
                                  </span>
                                  <span className="font-mono">{formatUF(inv.amount_uf)}</span>
                                  {invCreditNotes.length > 0 && (
                                    <span className="text-xs text-red-600">
                                      - {formatUF(invCreditNotes.reduce((s, c) => s + c.amount_uf, 0))} NC
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Credit Notes Summary */}
                    {oc.credit_notes.length > 0 && (
                      <div className="pl-4 border-l-2 border-red-200">
                        <p className="text-xs font-medium text-red-700 mb-1">Notas de Crédito</p>
                        <div className="space-y-1">
                          {oc.credit_notes.map((cn) => (
                            <div key={cn.id} className="text-sm flex items-center justify-between py-1">
                              <span>{cn.credit_note_number}</span>
                              <span className="font-mono text-red-600">-{formatUF(cn.amount_uf)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Summary */}
                    <div className="flex justify-end gap-6 pt-2 border-t text-sm">
                      <div className="text-muted-foreground">
                        Facturado: <span className="font-medium text-foreground">{formatUF(totalInvoiced)}</span>
                      </div>
                      {totalCreditNotes > 0 && (
                        <div className="text-muted-foreground">
                          NC: <span className="font-medium text-red-600">-{formatUF(totalCreditNotes)}</span>
                        </div>
                      )}
                      <div className="text-muted-foreground">
                        Neto: <span className="font-medium text-foreground">{formatUF(netInvoiced)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Quotations Section */}
          <div className="border-t pt-4">
            <QuotationsManager
              budgetLineId={lineDetailsId}
              contractId={contractId}
              lineName={lineDetailsName}
              projectName={contractName}
              ufValue={ufValue}
              formatUF={formatUF}
              onRefresh={onRefresh}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLineDetailsDialog(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* OC Request Dialog */}
      <OCRequestDialog
        open={showOCRequestDialog}
        onOpenChange={setShowOCRequestDialog}
        contractId={contractId}
        contractName={contractName}
        budgetId={currentBudget?.id || ""}
        budgetLineId={ocRequestLineId}
        lineName={ocRequestLineName}
        lineAvailable={ocRequestLineAvailable}
        lineBudget={ocRequestLineBudget}
        year={selectedYear}
        ufValue={ufValue}
        formatUF={formatUF}
        onSuccess={onRefresh}
      />
    </Card>
  );
};