import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, TrendingUp, DollarSign, FileText, Receipt, RotateCcw, AlertCircle, Plus, Trash2, Calendar, Lock } from "lucide-react";
import { BudgetProvider, useBudgetContext } from "./BudgetContext";
import { BudgetModule } from "./BudgetModule";
import { PurchaseOrdersModule } from "./PurchaseOrdersModule";
import { BudgetSemaphore } from "./BudgetSemaphore";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BudgetTemplateSelector, applyBudgetTemplate } from "./BudgetTemplateSelector";

interface BudgetSummary {
  budget: number;
  authorized: number;
  unauthorized: number;
}

interface BudgetDashboardProps {
  contractId: string;
  displayCurrency?: "UF" | "CLP";
}

interface BudgetTypeTotals {
  oc: number;
  invoices: number;
}

interface CarryoverData {
  inversion: number;
  capex: number;
  total: number;
}

interface YearBudgetInfo {
  hasBudgets: boolean;
  inversionClosed: boolean;
  capexClosed: boolean;
  allClosed: boolean;
}

const STORAGE_KEY_PREFIX = "budget_selected_year_";

const BudgetDashboardContent = ({ contractId }: BudgetDashboardProps) => {
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}${contractId}`);
    return saved ? parseInt(saved) : new Date().getFullYear();
  });
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [inversionSummary, setInversionSummary] = useState<BudgetSummary>({ budget: 0, authorized: 0, unauthorized: 0 });
  const [capexSummary, setCapexSummary] = useState<BudgetSummary>({ budget: 0, authorized: 0, unauthorized: 0 });
  const [inversionTotals, setInversionTotals] = useState<BudgetTypeTotals>({ oc: 0, invoices: 0 });
  const [capexTotals, setCapexTotals] = useState<BudgetTypeTotals>({ oc: 0, invoices: 0 });
  const [carryover, setCarryover] = useState<CarryoverData>({ inversion: 0, capex: 0, total: 0 });
  const [yearBudgetInfo, setYearBudgetInfo] = useState<YearBudgetInfo>({ hasBudgets: false, inversionClosed: false, capexClosed: false, allClosed: false });
  
  // Dialog states
  const [showNewYearDialog, setShowNewYearDialog] = useState(false);
  const [showDeleteYearDialog1, setShowDeleteYearDialog1] = useState(false);
  const [showDeleteYearDialog2, setShowDeleteYearDialog2] = useState(false);
  const [showCloseYearDialog, setShowCloseYearDialog] = useState(false);
  
  // New year form state
  const [newYear, setNewYear] = useState(new Date().getFullYear());
  const [inversionAmount, setInversionAmount] = useState("");
  const [capexAmount, setCapexAmount] = useState("");
  const [inversionTemplateId, setInversionTemplateId] = useState("");
  const [capexTemplateId, setCapexTemplateId] = useState("");
  const [closeCurrentYearOnCreate, setCloseCurrentYearOnCreate] = useState(false);
  const [previousYearPendingOCs, setPreviousYearPendingOCs] = useState<{
    count: number;
    totalPending: number;
  }>({ count: 0, totalPending: 0 });
  const [creatingYear, setCreatingYear] = useState(false);
  const [deletingYear, setDeletingYear] = useState(false);
  const [closingYear, setClosingYear] = useState(false);

  const { toast } = useToast();
  const { formatPrimary, formatSecondary, formatUF } = useBudgetContext();

  // Refresh key to force BudgetModule to reload
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    loadAvailableYears();
    setLoading(false);
  }, [contractId]);

  useEffect(() => {
    loadSummaries();
    loadCarryover();
    loadYearBudgetInfo();
  }, [contractId, selectedYear, refreshKey]);

  // Save selected year to localStorage when it changes
  const handleYearChange = (year: number) => {
    setSelectedYear(year);
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${contractId}`, year.toString());
  };

  const loadAvailableYears = async () => {
    try {
      // Get years from budgets
      const { data: budgets } = await supabase
        .from("contract_budgets")
        .select("year")
        .eq("contract_id", contractId);

      // Get years from purchase orders
      const { data: orders } = await supabase
        .from("purchase_orders")
        .select("year")
        .eq("contract_id", contractId);

      const yearsSet = new Set<number>();
      yearsSet.add(new Date().getFullYear()); // Always include current year
      
      budgets?.forEach(b => yearsSet.add(b.year));
      orders?.forEach(o => yearsSet.add(o.year));

      const sortedYears = Array.from(yearsSet).sort((a, b) => b - a);
      setAvailableYears(sortedYears);
    } catch (error) {
      console.error("Error loading available years:", error);
    }
  };

  const loadYearBudgetInfo = async () => {
    try {
      const { data: budgets } = await supabase
        .from("contract_budgets")
        .select("budget_type, is_closed")
        .eq("contract_id", contractId)
        .eq("year", selectedYear);

      const invBudget = budgets?.find(b => b.budget_type === "inversion_inicial");
      const capBudget = budgets?.find(b => b.budget_type === "capex");

      setYearBudgetInfo({
        hasBudgets: (budgets?.length || 0) > 0,
        inversionClosed: invBudget?.is_closed || false,
        capexClosed: capBudget?.is_closed || false,
        allClosed: (invBudget?.is_closed || false) && (capBudget?.is_closed || false),
      });
    } catch (error) {
      console.error("Error loading year budget info:", error);
    }
  };

  const loadSummaries = async () => {
    // Cargar resumen de Inversión Inicial
    const invSummary = await loadBudgetTypeSummary(contractId, "inversion_inicial", selectedYear);
    setInversionSummary(invSummary);

    // Cargar resumen de CAPEX
    const capSummary = await loadBudgetTypeSummary(contractId, "capex", selectedYear);
    setCapexSummary(capSummary);

    // Get OC and invoice totals by budget type
    const invTotals = await loadBudgetTypeTotals(contractId, "inversion_inicial", selectedYear);
    setInversionTotals(invTotals);

    const capTotals = await loadBudgetTypeTotals(contractId, "capex", selectedYear);
    setCapexTotals(capTotals);
  };

  const loadCarryover = async () => {
    try {
      // Get carryover data for the selected year
      const { data, error } = await supabase
        .from("budget_carryover")
        .select("budget_type, amount_uf")
        .eq("contract_id", contractId)
        .eq("target_year", selectedYear);

      if (error) throw error;

      const inversionCarryover = (data || [])
        .filter(c => c.budget_type === "inversion_inicial")
        .reduce((acc, c) => acc + (c.amount_uf || 0), 0);

      const capexCarryover = (data || [])
        .filter(c => c.budget_type === "capex")
        .reduce((acc, c) => acc + (c.amount_uf || 0), 0);

      setCarryover({
        inversion: inversionCarryover,
        capex: capexCarryover,
        total: inversionCarryover + capexCarryover,
      });
    } catch (error) {
      console.error("Error loading carryover:", error);
    }
  };

  const loadBudgetTypeTotals = async (contractId: string, budgetType: string, year: number): Promise<BudgetTypeTotals> => {
    // Get budget ID for this type and year
    const { data: budget } = await supabase
      .from("contract_budgets")
      .select("id")
      .eq("contract_id", contractId)
      .eq("budget_type", budgetType)
      .eq("year", year)
      .maybeSingle();

    if (!budget) {
      return { oc: 0, invoices: 0 };
    }

    // Get OC totals for this budget
    const { data: orders } = await supabase
      .from("purchase_orders")
      .select("id, amount_uf")
      .eq("contract_id", contractId)
      .eq("budget_id", budget.id)
      .eq("year", year);

    const ocTotal = (orders || []).reduce((acc, o) => acc + (o.amount_uf || 0), 0);

    // Get invoice totals for these OCs
    let invoicesTotal = 0;
    if (orders && orders.length > 0) {
      const orderIds = orders.map(o => o.id);
      const { data: invoices } = await supabase
        .from("invoices")
        .select("amount_uf")
        .in("purchase_order_id", orderIds);

      invoicesTotal = (invoices || []).reduce((acc, i) => acc + (i.amount_uf || 0), 0);
    }

    return { oc: ocTotal, invoices: invoicesTotal };
  };

  const loadBudgetTypeSummary = async (contractId: string, budgetType: string, year: number): Promise<BudgetSummary> => {
    // Obtener presupuesto del tipo específico
    const { data: budget } = await supabase
      .from("contract_budgets")
      .select("id, amount_uf")
      .eq("contract_id", contractId)
      .eq("budget_type", budgetType)
      .eq("year", year)
      .maybeSingle();

    if (!budget) {
      return { budget: 0, authorized: 0, unauthorized: 0 };
    }

    // Obtener líneas del presupuesto específico con quantity y unit_price
    const { data: lines } = await supabase
      .from("budget_lines")
      .select("id, amount_uf, status, parent_id, quantity, unit_price")
      .eq("budget_id", budget.id);

    // Get all line IDs to identify which are parents
    const parentIds = new Set((lines || []).filter(l => l.parent_id).map(l => l.parent_id));
    
    // Only count leaf nodes (lines that are not parents of other lines) to avoid double counting
    const leafLines = (lines || []).filter(l => !parentIds.has(l.id));
    
    // Helper to get effective amount - use amount_uf directly (it's already calculated from qty * price)
    const getEffectiveAmount = (line: { quantity?: number | null; unit_price?: number | null; amount_uf: number }) => {
      return line.amount_uf || 0;
    };
    
    const authorized = leafLines
      .filter(l => l.status === "autorizado")
      .reduce((acc, l) => acc + getEffectiveAmount(l), 0);

    const unauthorized = leafLines
      .filter(l => l.status === "no_autorizado")
      .reduce((acc, l) => acc + getEffectiveAmount(l), 0);

    return {
      budget: budget.amount_uf || 0,
      authorized,
      unauthorized,
    };
  };

  // Check previous year pending OCs when opening new year dialog
  const checkPreviousYearPendingOCs = async (targetYear: number) => {
    const previousYear = targetYear - 1;
    
    // Get all budgets from previous year
    const { data: prevBudgets } = await supabase
      .from("contract_budgets")
      .select("id")
      .eq("contract_id", contractId)
      .eq("year", previousYear);

    if (!prevBudgets || prevBudgets.length === 0) {
      setPreviousYearPendingOCs({ count: 0, totalPending: 0 });
      return;
    }

    const budgetIds = prevBudgets.map(b => b.id);
    
    // Get OCs from previous year
    const { data: orders } = await supabase
      .from("purchase_orders")
      .select("id, amount_uf")
      .eq("contract_id", contractId)
      .in("budget_id", budgetIds);

    if (!orders || orders.length === 0) {
      setPreviousYearPendingOCs({ count: 0, totalPending: 0 });
      return;
    }

    // Calculate pending amounts
    let count = 0;
    let totalPending = 0;

    for (const order of orders) {
      const { data: invoices } = await supabase
        .from("invoices")
        .select("amount_uf")
        .eq("purchase_order_id", order.id);

      const invoicedAmount = (invoices || []).reduce((acc, inv) => acc + (inv.amount_uf || 0), 0);
      const pendingBalance = order.amount_uf - invoicedAmount;

      if (pendingBalance > 0) {
        count++;
        totalPending += pendingBalance;
      }
    }

    setPreviousYearPendingOCs({ count, totalPending });
  };

  // Handle new year creation
  const handleCreateNewYear = async () => {
    if (!inversionTemplateId && !capexTemplateId) {
      toast({ variant: "destructive", title: "Error", description: "Debe seleccionar al menos una plantilla" });
      return;
    }

    setCreatingYear(true);
    try {
      // Create Inversion Inicial budget if template selected
      if (inversionTemplateId && inversionTemplateId !== "none") {
        const { data: invBudget, error: invError } = await supabase
          .from("contract_budgets")
          .insert({
            contract_id: contractId,
            year: newYear,
            budget_type: "inversion_inicial",
            amount_uf: parseFloat(inversionAmount) || 0,
          })
          .select()
          .single();

        if (invError) throw invError;
        await applyBudgetTemplate(inversionTemplateId, invBudget.id);
      }

      // Create CAPEX budget if template selected
      if (capexTemplateId && capexTemplateId !== "none") {
        const { data: capBudget, error: capError } = await supabase
          .from("contract_budgets")
          .insert({
            contract_id: contractId,
            year: newYear,
            budget_type: "capex",
            amount_uf: parseFloat(capexAmount) || 0,
          })
          .select()
          .single();

        if (capError) throw capError;
        await applyBudgetTemplate(capexTemplateId, capBudget.id);
      }

      // Handle carryover if closing previous year
      if (closeCurrentYearOnCreate && previousYearPendingOCs.count > 0) {
        // Implementation for carryover would go here
        // (Similar to what was in BudgetModule)
      }

      toast({ title: "Año creado", description: `Presupuestos para ${newYear} creados exitosamente` });
      setShowNewYearDialog(false);
      setInversionAmount("");
      setCapexAmount("");
      setInversionTemplateId("");
      setCapexTemplateId("");
      setCloseCurrentYearOnCreate(false);
      await loadAvailableYears();
      handleYearChange(newYear);
      setRefreshKey(k => k + 1);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setCreatingYear(false);
    }
  };

  // Handle delete year
  const handleDeleteYear = async () => {
    setDeletingYear(true);
    try {
      // Get all budgets for this year
      const { data: budgets } = await supabase
        .from("contract_budgets")
        .select("id")
        .eq("contract_id", contractId)
        .eq("year", selectedYear);

      if (budgets) {
        for (const budget of budgets) {
          // Delete budget lines
          await supabase.from("budget_lines").delete().eq("budget_id", budget.id);
          // Delete purchase orders
          await supabase.from("purchase_orders").delete().eq("budget_id", budget.id);
          // Delete budget
          await supabase.from("contract_budgets").delete().eq("id", budget.id);
        }
      }

      // Delete carryover records
      await supabase.from("budget_carryover").delete().eq("contract_id", contractId).eq("target_year", selectedYear);

      toast({ title: "Año eliminado", description: `Presupuestos de ${selectedYear} eliminados` });
      setShowDeleteYearDialog2(false);
      await loadAvailableYears();
      handleYearChange(new Date().getFullYear());
      setRefreshKey(k => k + 1);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setDeletingYear(false);
    }
  };

  // Handle close year
  const handleCloseYear = async () => {
    setClosingYear(true);
    try {
      // Close all budgets for this year
      await supabase
        .from("contract_budgets")
        .update({ is_closed: true, closed_at: new Date().toISOString() })
        .eq("contract_id", contractId)
        .eq("year", selectedYear);

      toast({ title: "Año cerrado", description: `Presupuestos de ${selectedYear} cerrados` });
      setShowCloseYearDialog(false);
      setRefreshKey(k => k + 1);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setClosingYear(false);
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
    <div className="space-y-6">
      {/* Year Selector with Management Buttons */}
      <div className="flex items-center justify-between gap-4 p-4 bg-muted/30 rounded-lg">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-muted-foreground">Año:</span>
          <Select value={selectedYear.toString()} onValueChange={(v) => handleYearChange(parseInt(v))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {yearBudgetInfo.allClosed && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Lock className="h-4 w-4" />
              <span className="text-sm">Cerrado</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {yearBudgetInfo.hasBudgets && !yearBudgetInfo.allClosed && (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowDeleteYearDialog1(true)}>
                <Trash2 className="h-4 w-4 mr-1" />
                Eliminar
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowCloseYearDialog(true)}>
                <Calendar className="h-4 w-4 mr-1" />
                Cerrar Año
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => {
            setNewYear(new Date().getFullYear() + 1);
            checkPreviousYearPendingOCs(new Date().getFullYear() + 1);
            setShowNewYearDialog(true);
          }}>
            <Plus className="h-4 w-4 mr-1" />
            Nuevo Año
          </Button>
        </div>
      </div>

      {/* Summary Cards - 3 columnas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* TOTAL GENERAL */}
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              TOTAL GENERAL {selectedYear}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-primary" />
                <span className="text-muted-foreground">Total Presupuesto:</span>
              </div>
              <span className="font-medium text-right">{formatPrimary(inversionSummary.authorized + capexSummary.authorized + carryover.total)}</span>
              
              {carryover.total > 0 && (
                <>
                  <div className="flex items-center gap-1.5">
                    <RotateCcw className="h-3.5 w-3.5 text-amber-500" />
                    <span className="text-muted-foreground">Arrastre Presup.:</span>
                  </div>
                  <span className="font-medium text-right text-amber-600">{formatPrimary(carryover.total)}</span>
                </>
              )}
              
              <div className="flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-orange-500" />
                <span className="text-muted-foreground">Total OC:</span>
              </div>
              <span className="font-medium text-right">{formatPrimary(inversionTotals.oc + capexTotals.oc)}</span>
              
              <div className="flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5 text-purple-500" />
                <span className="text-muted-foreground">Total Facturación:</span>
              </div>
              <span className="font-medium text-right">{formatPrimary(inversionTotals.invoices + capexTotals.invoices)}</span>
              
              {(inversionSummary.unauthorized + capexSummary.unauthorized) > 0 && (
                <>
                  <div className="flex items-center gap-1.5 border-t pt-2 col-span-2"></div>
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 text-yellow-500" />
                    <span className="text-muted-foreground">Presup. No Autorizado:</span>
                  </div>
                  <span className="font-medium text-right text-yellow-600">{formatPrimary(inversionSummary.unauthorized + capexSummary.unauthorized)}</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* TOTAL INV. INICIAL */}
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              TOTAL INV. INICIAL {selectedYear}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-bold">{formatPrimary(inversionSummary.authorized)}</p>
                <p className="text-xs text-muted-foreground">Presup. de {formatPrimary(inversionSummary.budget)}</p>
              </div>
              <BudgetSemaphore budget={inversionSummary.budget} consumed={inversionSummary.authorized} showLabel={false} size="md" />
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm border-t pt-2">
              <div className="flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-orange-500" />
                <span className="text-muted-foreground">OC:</span>
              </div>
              <span className="font-medium text-right">{formatPrimary(inversionTotals.oc)}</span>
              
              <div className="flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5 text-purple-500" />
                <span className="text-muted-foreground">Facturación:</span>
              </div>
              <span className="font-medium text-right">{formatPrimary(inversionTotals.invoices)}</span>
              
              {inversionSummary.unauthorized > 0 && (
                <>
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 text-yellow-500" />
                    <span className="text-muted-foreground">Presup. No Autorizado:</span>
                  </div>
                  <span className="font-medium text-right text-yellow-600">{formatPrimary(inversionSummary.unauthorized)}</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* TOTAL CAPEX */}
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-500" />
              TOTAL CAPEX {selectedYear}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-bold">{formatPrimary(capexSummary.authorized)}</p>
                <p className="text-xs text-muted-foreground">Presup. de {formatPrimary(capexSummary.budget)}</p>
              </div>
              <BudgetSemaphore budget={capexSummary.budget} consumed={capexSummary.authorized} showLabel={false} size="md" />
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm border-t pt-2">
              <div className="flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-orange-500" />
                <span className="text-muted-foreground">OC:</span>
              </div>
              <span className="font-medium text-right">{formatPrimary(capexTotals.oc)}</span>
              
              <div className="flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5 text-purple-500" />
                <span className="text-muted-foreground">Facturación:</span>
              </div>
              <span className="font-medium text-right">{formatPrimary(capexTotals.invoices)}</span>
              
              {capexSummary.unauthorized > 0 && (
                <>
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 text-yellow-500" />
                    <span className="text-muted-foreground">Presup. No Autorizado:</span>
                  </div>
                  <span className="font-medium text-right text-yellow-600">{formatPrimary(capexSummary.unauthorized)}</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Budget Tabs - CADA TAB COMPLETAMENTE INDEPENDIENTE */}
      <Tabs defaultValue="inversion" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="inversion" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-700">
            Inversión Inicial
          </TabsTrigger>
          <TabsTrigger value="capex" className="data-[state=active]:bg-green-100 data-[state=active]:text-green-700">
            CAPEX
          </TabsTrigger>
          <TabsTrigger value="oc">Órdenes de Compra</TabsTrigger>
        </TabsList>
        <TabsContent value="inversion" className="mt-4">
          <BudgetModule 
            key={`inv-${selectedYear}-${refreshKey}`}
            contractId={contractId} 
            budgetType="inversion_inicial" 
            title="Inversión Inicial" 
            selectedYear={selectedYear}
            ocTotal={inversionTotals.oc}
            onRefresh={() => setRefreshKey(k => k + 1)}
          />
        </TabsContent>
        <TabsContent value="capex" className="mt-4">
          <BudgetModule 
            key={`cap-${selectedYear}-${refreshKey}`}
            contractId={contractId} 
            budgetType="capex" 
            title="CAPEX"
            selectedYear={selectedYear}
            ocTotal={capexTotals.oc}
            onRefresh={() => setRefreshKey(k => k + 1)}
          />
        </TabsContent>
        <TabsContent value="oc" className="mt-4">
          <PurchaseOrdersModule contractId={contractId} initialYear={selectedYear} />
        </TabsContent>
      </Tabs>

      {/* Dialog: Nuevo Año */}
      <Dialog open={showNewYearDialog} onOpenChange={setShowNewYearDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo Año Presupuestario</DialogTitle>
            <DialogDescription>
              Cree los presupuestos para un nuevo año fiscal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Año</Label>
              <Input
                type="number"
                value={newYear}
                onChange={(e) => {
                  const year = parseInt(e.target.value);
                  setNewYear(year);
                  checkPreviousYearPendingOCs(year);
                }}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Inversión Inicial (UF)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={inversionAmount}
                  onChange={(e) => setInversionAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>CAPEX (UF)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={capexAmount}
                  onChange={(e) => setCapexAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <BudgetTemplateSelector
                budgetType="inversion_inicial"
                value={inversionTemplateId}
                onChange={setInversionTemplateId}
                label="Plantilla Inv. Inicial"
              />
              <BudgetTemplateSelector
                budgetType="capex"
                value={capexTemplateId}
                onChange={setCapexTemplateId}
                label="Plantilla CAPEX"
              />
            </div>
            
            {previousYearPendingOCs.count > 0 && (
              <div className="space-y-3 border-t pt-4">
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="closeYearOnCreate"
                    checked={closeCurrentYearOnCreate}
                    onCheckedChange={(checked) => setCloseCurrentYearOnCreate(checked === true)}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="closeYearOnCreate" className="font-medium cursor-pointer">
                      ¿Cerrar año {newYear - 1}?
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {previousYearPendingOCs.count} OC(s) con saldo pendiente por {formatUF(previousYearPendingOCs.totalPending)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewYearDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCreateNewYear} 
              disabled={creatingYear || (!inversionTemplateId && !capexTemplateId)}
            >
              {creatingYear && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Cerrar Año */}
      <Dialog open={showCloseYearDialog} onOpenChange={setShowCloseYearDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cerrar Año {selectedYear}</DialogTitle>
            <DialogDescription>
              Esta acción cerrará todos los presupuestos del año {selectedYear}.
            </DialogDescription>
          </DialogHeader>
          <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-700">Atención</AlertTitle>
            <AlertDescription className="text-amber-600">
              Una vez cerrado, no podrá modificar los presupuestos ni agregar nuevas líneas para este año.
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCloseYearDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCloseYear} disabled={closingYear}>
              {closingYear && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Cerrar Año
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog: Primera confirmación de eliminación */}
      <AlertDialog open={showDeleteYearDialog1} onOpenChange={setShowDeleteYearDialog1}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar presupuestos del año {selectedYear}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará todos los presupuestos, líneas y datos asociados al año {selectedYear}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                setShowDeleteYearDialog1(false);
                setShowDeleteYearDialog2(true);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog: Segunda confirmación de eliminación */}
      <AlertDialog open={showDeleteYearDialog2} onOpenChange={setShowDeleteYearDialog2}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">⚠️ Confirmación Final</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p className="font-semibold">Esta acción es IRREVERSIBLE.</p>
              <p>Se eliminarán permanentemente todos los presupuestos del año {selectedYear}.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteYear}
              disabled={deletingYear}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingYear && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Eliminar Definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export const BudgetDashboard = ({ contractId, displayCurrency = "UF" }: BudgetDashboardProps) => {
  return (
    <BudgetProvider initialCurrency={displayCurrency}>
      <BudgetDashboardContent contractId={contractId} />
    </BudgetProvider>
  );
};