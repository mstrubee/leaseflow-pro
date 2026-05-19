import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, TrendingUp, DollarSign, FileText, Receipt, RotateCcw, AlertCircle, Plus, Trash2, Calendar, Lock, Clock, Edit2 } from "lucide-react";
import { BudgetProvider, useBudgetContext } from "./BudgetContext";
import { BudgetModule } from "./BudgetModule";
import { PurchaseOrdersModule } from "./PurchaseOrdersModule";
import { DeletedOrdersModule } from "./DeletedOrdersModule";
import { OCRequestsList } from "./OCRequestsList";
import { BudgetSemaphore } from "./BudgetSemaphore";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BudgetTemplateSelector, applyBudgetTemplate } from "./BudgetTemplateSelector";
import { CapexCloseYearDialog } from "./CapexCloseYearDialog";
import { loadBudgetTotals } from "@/lib/budgetTotals";

interface BudgetSummary {
  budget: number;
  authorized: number;
  unauthorized: number;
}

interface BudgetDashboardProps {
  contractId: string;
  displayCurrency?: "UF" | "CLP";
  initialTab?: string;
}

interface BudgetTypeTotals {
  ocClp: number;       // Suma de amount_clp de OCs (valor real bloqueado)
  ocUf: number;        // Suma de amount_uf de OCs (informativo)
  invoicesClp: number;  // Suma de amount_clp de facturas - notas de credito
  invoicesUf: number;   // Suma de amount_uf de facturas - notas de credito (informativo)
}

interface CarryoverData {
  capex: number;
  opex: number;
  total: number;
}

interface YearBudgetInfo {
  hasBudgets: boolean;
  capexClosed: boolean;
  opexClosed: boolean;
  allClosed: boolean;
}

const STORAGE_KEY_PREFIX = "budget_selected_year_";

const BudgetDashboardContent = ({ contractId, initialTab }: BudgetDashboardProps) => {
  const [loading, setLoading] = useState(true);
  const [contractName, setContractName] = useState("");
  const [contractCebe, setContractCebe] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}${contractId}`);
    return saved ? parseInt(saved) : new Date().getFullYear();
  });
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [capexSummary, setCapexSummary] = useState<BudgetSummary>({ budget: 0, authorized: 0, unauthorized: 0 });
  const [opexSummary, setOpexSummary] = useState<BudgetSummary>({ budget: 0, authorized: 0, unauthorized: 0 });
  const [capexTotals, setCapexTotals] = useState<BudgetTypeTotals>({ ocClp: 0, ocUf: 0, invoicesClp: 0, invoicesUf: 0 });
  const [opexTotals, setOpexTotals] = useState<BudgetTypeTotals>({ ocClp: 0, ocUf: 0, invoicesClp: 0, invoicesUf: 0 });
  const [carryover, setCarryover] = useState<CarryoverData>({ capex: 0, opex: 0, total: 0 });
  const [yearBudgetInfo, setYearBudgetInfo] = useState<YearBudgetInfo>({ hasBudgets: false, capexClosed: false, opexClosed: false, allClosed: false });
  
  // Dialog states
  const [showNewYearDialog, setShowNewYearDialog] = useState(false);
  const [showEditCapexDialog, setShowEditCapexDialog] = useState(false);
  const [showDeleteYearDialog1, setShowDeleteYearDialog1] = useState(false);
  const [showDeleteYearDialog2, setShowDeleteYearDialog2] = useState(false);
  const [showCloseYearDialog, setShowCloseYearDialog] = useState(false);
  
  // Edit CAPEX form state
  const [editCapexAmount, setEditCapexAmount] = useState("");
  const [editCapexCurrency, setEditCapexCurrency] = useState<"UF" | "CLP">("UF");
  const [editingCapex, setEditingCapex] = useState(false);
  
  // New year form state
  const [newYear, setNewYear] = useState(new Date().getFullYear());
  const [capexAmount, setCapexAmount] = useState("");
  const [capexCurrency, setCapexCurrency] = useState<"UF" | "CLP">("UF");
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
  const { formatPrimary, formatSecondary, formatUF, formatCLP, ufValue, convertUFToPesos } = useBudgetContext();

  // Refresh key to force BudgetModule to reload
  const [refreshKey, setRefreshKey] = useState(0);
  const [superficieEdificada, setSuperficieEdificada] = useState(0);

  useEffect(() => {
    loadAvailableYears();
    loadContractName();
    setLoading(false);
  }, [contractId]);

  const loadContractName = async () => {
    const { data } = await supabase
      .from("contracts")
      .select("name, superficie_edificada_local")
      .eq("id", contractId)
      .single();
    if (data) {
      setContractName(data.name);
      setSuperficieEdificada(data.superficie_edificada_local || 0);
    }
    
    // Load CEBE custom field
    const { data: cebeFieldData } = await supabase
      .from("contract_custom_fields")
      .select("id")
      .ilike("field_name", "cebe")
      .eq("is_active", true)
      .limit(1)
      .single();
    
    if (cebeFieldData) {
      const { data: cebeValue } = await supabase
        .from("contract_custom_field_values")
        .select("field_value")
        .eq("contract_id", contractId)
        .eq("field_id", cebeFieldData.id)
        .single();
      
      if (cebeValue?.field_value) {
        setContractCebe(cebeValue.field_value);
      }
    }
  };

  const refreshData = async () => {
    await Promise.all([
      loadSummaries(),
      loadCarryover(),
      loadYearBudgetInfo(),
    ]);
  };

  useEffect(() => {
    // CRITICAL: Only calculate summaries when ufValue is loaded.
    // Without ufValue, CLP budget lines would be treated as UF values,
    // producing astronomically wrong numbers (e.g. $9M CLP shown as 9M UF).
    if (ufValue > 0) {
      refreshData();
    }
  }, [contractId, selectedYear, refreshKey, ufValue]);

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

      const capBudget = budgets?.find(b => b.budget_type === "capex");
      const opxBudget = budgets?.find(b => b.budget_type === "opex");

      setYearBudgetInfo({
        hasBudgets: (budgets?.length || 0) > 0,
        capexClosed: capBudget?.is_closed || false,
        opexClosed: opxBudget?.is_closed || false,
        allClosed: (capBudget?.is_closed || false) && (opxBudget?.is_closed || false),
      });
    } catch (error) {
      console.error("Error loading year budget info:", error);
    }
  };

  const loadSummaries = async () => {
    // Cargar resumen de CAPEX
    const capSummary = await loadBudgetTypeSummary(contractId, "capex", selectedYear);
    setCapexSummary(capSummary);

    // Cargar resumen de OPEX
    const opxSummary = await loadBudgetTypeSummary(contractId, "opex", selectedYear);
    setOpexSummary(opxSummary);

    // Get OC and invoice totals by budget type
    const capTotals = await loadBudgetTypeTotals(contractId, "capex", selectedYear);
    setCapexTotals(capTotals);

    const opxTotals = await loadBudgetTypeTotals(contractId, "opex", selectedYear);
    setOpexTotals(opxTotals);
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

      const capexCarryover = (data || [])
        .filter(c => c.budget_type === "capex")
        .reduce((acc, c) => acc + (c.amount_uf || 0), 0);

      const opexCarryover = (data || [])
        .filter(c => c.budget_type === "opex")
        .reduce((acc, c) => acc + (c.amount_uf || 0), 0);

      setCarryover({
        capex: capexCarryover,
        opex: opexCarryover,
        total: capexCarryover + opexCarryover,
      });
    } catch (error) {
      console.error("Error loading carryover:", error);
    }
  };

  const loadBudgetTypeTotals = async (contractId: string, budgetType: string, year: number): Promise<BudgetTypeTotals> => {
    // For CAPEX: use budget_classification = 'CAPEX' OR budget_line_id is not null
    // For OPEX: use opex_master_id is not null (centralized OPEX) or opex_category_id is not null
    
    // Helper to resolve CLP for a record (fallback for legacy data without amount_clp)
    const resolveClp = (rec: { amount_clp?: number | null; amount_uf: number; uf_value_at_entry?: number | null }): number => {
      if (rec.amount_clp != null && rec.amount_clp !== 0) return rec.amount_clp;
      if (rec.uf_value_at_entry) return Math.round(rec.amount_uf * rec.uf_value_at_entry);
      return Math.round(rec.amount_uf * (ufValue || 1));
    };

    let directOrders: { id: string; amount_uf: number; amount_clp: number; order_number: string; is_multi_contract: boolean }[] = [];
    
    // Get direct orders for this contract
    if (budgetType === "capex") {
      const { data: capexOrders } = await supabase
        .from("purchase_orders")
        .select("id, amount_uf, amount_clp, uf_value_at_entry, budget_classification, budget_line_id, opex_master_id, opex_category_id, order_number, is_multi_contract")
        .eq("contract_id", contractId)
        .eq("year", year)
        .is("deleted_at", null);
      
      directOrders = (capexOrders || []).filter(o => {
        const isOpex = o.opex_master_id || o.opex_category_id || o.budget_classification === "OPEX";
        if (isOpex) return false;
        // CAPEX explicit, or has budget_line without opex markers, or completely unclassified (fallback to CAPEX)
        if (o.budget_classification === "CAPEX" || o.budget_line_id) return true;
        // Unclassified OC: no budget_classification, no budget_line_id, no opex markers → CAPEX by default
        if (!o.budget_classification && !o.budget_line_id) {
          console.warn(`[BudgetDashboard] OC ${o.order_number} (${o.id}) sin clasificación → asignada a CAPEX por defecto`);
          return true;
        }
        return false;
      }).map(o => ({
        id: o.id,
        amount_uf: o.amount_uf,
        amount_clp: resolveClp(o),
        order_number: o.order_number,
        is_multi_contract: o.is_multi_contract || false
      }));
    } else {
      const { data: opexOrders } = await supabase
        .from("purchase_orders")
        .select("id, amount_uf, amount_clp, uf_value_at_entry, opex_master_id, opex_category_id, budget_classification, order_number, is_multi_contract")
        .eq("contract_id", contractId)
        .eq("year", year)
        .is("deleted_at", null);
      
      directOrders = (opexOrders || []).filter(o => 
        o.opex_master_id || o.opex_category_id || o.budget_classification === "OPEX"
      ).map(o => ({
        id: o.id,
        amount_uf: o.amount_uf,
        amount_clp: resolveClp(o),
        order_number: o.order_number,
        is_multi_contract: o.is_multi_contract || false
      }));
    }

    const ocTotalClp = directOrders.reduce((acc, o) => acc + (o.amount_clp || 0), 0);
    const ocTotalUf = directOrders.reduce((acc, o) => acc + (o.amount_uf || 0), 0);

    // Get invoice totals
    let invoicesTotalClp = 0;
    let invoicesTotalUf = 0;
    
    if (directOrders.length > 0) {
      const singleContractOrders = directOrders.filter(o => !o.is_multi_contract);
      const multiContractOrders = directOrders.filter(o => o.is_multi_contract);
      
      if (singleContractOrders.length > 0) {
        const singleOrderIds = singleContractOrders.map(o => o.id);
        
        const { data: invoices } = await supabase
          .from("invoices")
          .select("purchase_order_id, amount_uf, amount_clp, uf_value_at_entry")
          .in("purchase_order_id", singleOrderIds)
          .is("deleted_at", null);
        
        const { data: creditNotes } = await supabase
          .from("credit_notes")
          .select("purchase_order_id, amount_uf, amount_clp, uf_value_at_entry")
          .in("purchase_order_id", singleOrderIds)
          .is("deleted_at", null);
        
        for (const inv of (invoices || [])) {
          invoicesTotalClp += resolveClp(inv);
          invoicesTotalUf += inv.amount_uf || 0;
        }
        for (const cn of (creditNotes || [])) {
          invoicesTotalClp -= resolveClp(cn);
          invoicesTotalUf -= cn.amount_uf || 0;
        }
      }
      
      if (multiContractOrders.length > 0) {
        const orderNumbers = [...new Set(multiContractOrders.map(o => o.order_number))];
        
        const { data: allMultiPOs } = await supabase
          .from("purchase_orders")
          .select("id, order_number, amount_uf, amount_clp, uf_value_at_entry")
          .in("order_number", orderNumbers)
          .is("deleted_at", null);
        
        const allMultiPOIds = (allMultiPOs || []).map(po => po.id);
        
        if (allMultiPOIds.length > 0) {
          const { data: multiInvoices } = await supabase
            .from("invoices")
            .select("purchase_order_id, amount_uf, amount_clp, uf_value_at_entry")
            .in("purchase_order_id", allMultiPOIds)
            .is("deleted_at", null);
          
          const { data: multiCreditNotes } = await supabase
            .from("credit_notes")
            .select("purchase_order_id, amount_uf, amount_clp, uf_value_at_entry")
            .in("purchase_order_id", allMultiPOIds)
            .is("deleted_at", null);
          
          // Build maps for proportional calculation using CLP
          const orderNumberTotalsClp = new Map<string, number>();
          for (const po of (allMultiPOs || [])) {
            const current = orderNumberTotalsClp.get(po.order_number) || 0;
            orderNumberTotalsClp.set(po.order_number, current + resolveClp(po));
          }
          
          const poIdToOrderNumber = new Map<string, string>();
          for (const po of (allMultiPOs || [])) {
            poIdToOrderNumber.set(po.id, po.order_number);
          }
          
          for (const order of multiContractOrders) {
            const totalGroupClp = orderNumberTotalsClp.get(order.order_number) || 0;
            if (totalGroupClp <= 0) continue;
            
            const proportion = order.amount_clp / totalGroupClp;
            
            let groupInvoiceClp = 0;
            let groupInvoiceUf = 0;
            for (const inv of (multiInvoices || [])) {
              const invOrderNumber = poIdToOrderNumber.get(inv.purchase_order_id);
              if (invOrderNumber === order.order_number) {
                groupInvoiceClp += resolveClp(inv);
                groupInvoiceUf += inv.amount_uf || 0;
              }
            }
            
            let groupCreditNoteClp = 0;
            let groupCreditNoteUf = 0;
            for (const cn of (multiCreditNotes || [])) {
              const cnOrderNumber = poIdToOrderNumber.get(cn.purchase_order_id);
              if (cnOrderNumber === order.order_number) {
                groupCreditNoteClp += resolveClp(cn);
                groupCreditNoteUf += cn.amount_uf || 0;
              }
            }
            
            invoicesTotalClp += (groupInvoiceClp - groupCreditNoteClp) * proportion;
            invoicesTotalUf += (groupInvoiceUf - groupCreditNoteUf) * proportion;
          }
        }
      }
    }

    return { ocClp: ocTotalClp, ocUf: ocTotalUf, invoicesClp: invoicesTotalClp, invoicesUf: invoicesTotalUf };
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

    // Usar la misma cañería que el árbol "Control de Presupuesto"
    // (loadBudgetTotals) para que la tarjeta superior y el árbol coincidan.
    const totals = await loadBudgetTotals([budget.id], ufValue || 0);
    const t = totals.get(budget.id);

    return {
      budget: budget.amount_uf || 0,
      authorized: t?.authorized || 0,
      unauthorized: t?.unauthorized || 0,
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

  // Handle new year creation - Only CAPEX
  const handleCreateNewYear = async () => {
    const numAmount = parseFloat(capexAmount) || 0;

    setCreatingYear(true);
    try {
      // Convert CLP to UF if needed
      let amountUf = numAmount;
      if (capexCurrency === "CLP" && ufValue > 0) {
        amountUf = numAmount / ufValue;
      }

      // Create CAPEX budget
      const { data: capBudget, error: capError } = await supabase
        .from("contract_budgets")
        .insert({
          contract_id: contractId,
          year: newYear,
          budget_type: "capex",
          amount_uf: amountUf,
        })
        .select()
        .single();

      if (capError) throw capError;
      
      // Apply template only if one is selected
      if (capexTemplateId && capexTemplateId !== "none") {
        await applyBudgetTemplate(capexTemplateId, capBudget.id, contractId);
      }

      // Handle carryover if closing previous year
      if (closeCurrentYearOnCreate && previousYearPendingOCs.count > 0) {
        // Implementation for carryover would go here
        // (Similar to what was in BudgetModule)
      }

      toast({ title: "Año CAPEX creado", description: amountUf > 0 ? `Presupuesto CAPEX para ${newYear} creado exitosamente con ${formatUF(amountUf)}` : `Presupuesto CAPEX para ${newYear} creado (sin monto asignado)` });
      setShowNewYearDialog(false);
      setCapexAmount("");
      setCapexCurrency("UF");
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



  // Handle edit CAPEX amount
  const handleOpenEditCapex = () => {
    setEditCapexAmount(capexSummary.budget.toString());
    setEditCapexCurrency("UF");
    setShowEditCapexDialog(true);
  };

  const handleSaveCapexAmount = async () => {
    const numAmount = parseFloat(editCapexAmount) || 0;
    if (numAmount < 0) {
      toast({ variant: "destructive", title: "Error", description: "El monto debe ser mayor o igual a 0" });
      return;
    }

    setEditingCapex(true);
    try {
      // Convert CLP to UF if needed
      let amountUf = numAmount;
      if (editCapexCurrency === "CLP" && ufValue > 0) {
        amountUf = numAmount / ufValue;
      }

      // Update or create CAPEX budget
      const { data: existingBudget } = await supabase
        .from("contract_budgets")
        .select("id")
        .eq("contract_id", contractId)
        .eq("year", selectedYear)
        .eq("budget_type", "capex")
        .maybeSingle();

      if (existingBudget) {
        // Update existing
        await supabase
          .from("contract_budgets")
          .update({ amount_uf: amountUf })
          .eq("id", existingBudget.id);
      } else {
        // Create new
        await supabase
          .from("contract_budgets")
          .insert({
            contract_id: contractId,
            year: selectedYear,
            budget_type: "capex",
            amount_uf: amountUf,
          });
      }

      toast({ title: "CAPEX actualizado", description: `Monto CAPEX actualizado a ${formatUF(amountUf)}` });
      setShowEditCapexDialog(false);
      setRefreshKey(k => k + 1);
      await refreshData();
      await loadAvailableYears();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setEditingCapex(false);
    }
  };

  if (loading || ufValue <= 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
        {ufValue <= 0 && <span className="ml-2 text-sm text-muted-foreground">Cargando indicadores económicos...</span>}
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
            Nuevo Año CAPEX
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
              <div className="text-right">
                {(() => {
                  const capexAuthorizedClp = convertUFToPesos(capexSummary.budget > 0 ? capexSummary.budget : capexSummary.authorized);
                  const totalPresupuesto = capexAuthorizedClp + opexTotals.ocClp;
                  const capexAuthorizedUf = capexSummary.budget > 0 ? capexSummary.budget : capexSummary.authorized;
                  const totalPresupuestoUf = capexAuthorizedUf + opexTotals.ocUf;
                  return (
                    <>
                      <span className="font-medium">{formatCLP(totalPresupuesto)}</span>
                      <span className="text-xs text-muted-foreground ml-1">({formatUF(totalPresupuestoUf)})</span>
                    </>
                  );
                })()}
              </div>

              {carryover.total > 0 && (
                <>
                  <div className="flex items-center gap-1.5">
                    <RotateCcw className="h-3.5 w-3.5 text-amber-500" />
                    <span className="text-muted-foreground">Arrastre Presup.:</span>
                  </div>
                  <div className="text-right">
                    <span className="font-medium text-amber-600">{formatCLP(convertUFToPesos(carryover.total))}</span>
                    <span className="text-xs text-muted-foreground ml-1">({formatUF(carryover.total)})</span>
                  </div>
                </>
              )}
              
              <div className="flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-orange-500" />
                <span className="text-muted-foreground">Total OC:</span>
              </div>
              <div className="text-right">
                <span className="font-medium">{formatCLP(capexTotals.ocClp + opexTotals.ocClp)}</span>
                <span className="text-xs text-muted-foreground ml-1">({formatUF(capexTotals.ocUf + opexTotals.ocUf)})</span>
              </div>
              
              <div className="flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5 text-purple-500" />
                <span className="text-muted-foreground">Total Facturación:</span>
              </div>
              <div className="text-right">
                <span className="font-medium">{formatCLP(capexTotals.invoicesClp + opexTotals.invoicesClp)}</span>
                <span className="text-xs text-muted-foreground ml-1">({formatUF(capexTotals.invoicesUf + opexTotals.invoicesUf)})</span>
              </div>
              
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-red-500" />
                <span className="text-muted-foreground">Total No Facturado:</span>
              </div>
              <div className="text-right">
                <span className="font-medium text-red-600">{formatCLP((capexTotals.ocClp - capexTotals.invoicesClp) + (opexTotals.ocClp - opexTotals.invoicesClp))}</span>
                <span className="text-xs text-muted-foreground ml-1">({formatUF((capexTotals.ocUf - capexTotals.invoicesUf) + (opexTotals.ocUf - opexTotals.invoicesUf))})</span>
              </div>
              
              {(capexSummary.unauthorized + opexSummary.unauthorized) > 0 && (
                <>
                  <div className="flex items-center gap-1.5 border-t pt-2 col-span-2"></div>
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 text-yellow-500" />
                    <span className="text-muted-foreground">Presup. No Autorizado:</span>
                  </div>
                  <div className="text-right">
                    <span className="font-medium text-yellow-600">{formatCLP(convertUFToPesos(capexSummary.unauthorized + opexSummary.unauthorized))}</span>
                    <span className="text-xs text-muted-foreground ml-1">({formatUF(capexSummary.unauthorized + opexSummary.unauthorized)})</span>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* TOTAL CAPEX */}
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                TOTAL CAPEX {selectedYear}
              </div>
              {!yearBudgetInfo.capexClosed && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 w-6 p-0" 
                  onClick={handleOpenEditCapex}
                  title="Editar monto CAPEX"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-bold">{formatCLP(convertUFToPesos(capexSummary.budget > 0 ? capexSummary.budget : capexSummary.authorized))}</p>
                <p className="text-xs text-muted-foreground">{formatUF(capexSummary.budget > 0 ? capexSummary.budget : capexSummary.authorized)}</p>
              </div>
              <BudgetSemaphore budget={convertUFToPesos(capexSummary.budget > 0 ? capexSummary.budget : capexSummary.authorized)} consumed={capexTotals.ocClp} showLabel={false} size="md" />
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm border-t pt-2">
              <div className="flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-orange-500" />
                <span className="text-muted-foreground">OC:</span>
              </div>
              <span className="font-medium text-right">{formatCLP(capexTotals.ocClp)}</span>
              
              <div className="flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5 text-purple-500" />
                <span className="text-muted-foreground">Facturación:</span>
              </div>
              <span className="font-medium text-right">{formatCLP(capexTotals.invoicesClp)}</span>
              
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-red-500" />
                <span className="text-muted-foreground">No Facturado:</span>
              </div>
              <span className="font-medium text-right text-red-600">{formatCLP(capexTotals.ocClp - capexTotals.invoicesClp)}</span>
              
              <div className="flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-green-500" />
                <span className="text-muted-foreground">Disponible:</span>
              </div>
              <span className={`font-medium text-right ${capexTotals.ocClp > convertUFToPesos(capexSummary.budget > 0 ? capexSummary.budget : capexSummary.authorized) ? "text-destructive" : "text-green-600"}`}>
                {formatCLP(convertUFToPesos(capexSummary.budget > 0 ? capexSummary.budget : capexSummary.authorized) - capexTotals.ocClp)}
              </span>
              
              {capexSummary.unauthorized > 0 && (
                <>
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 text-yellow-500" />
                    <span className="text-muted-foreground">Presup. No Autorizado:</span>
                  </div>
                  <span className="font-medium text-right text-yellow-600">{formatCLP(convertUFToPesos(capexSummary.unauthorized))}</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* TOTAL OPEX - Resumen de consumo (sin disponible, OPEX no tiene asignación por local) */}
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-500" />
              OPEX CONSUMIDO {selectedYear}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-bold">{formatCLP(opexTotals.ocClp)}</p>
                <p className="text-xs text-muted-foreground">{formatUF(opexTotals.ocUf)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm border-t pt-2">
              <div className="flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-orange-500" />
                <span className="text-muted-foreground">Total OC:</span>
              </div>
              <span className="font-medium text-right">{formatCLP(opexTotals.ocClp)}</span>
              
              <div className="flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5 text-purple-500" />
                <span className="text-muted-foreground">Total Facturación:</span>
              </div>
              <span className="font-medium text-right">{formatCLP(opexTotals.invoicesClp)}</span>
              
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-red-500" />
                <span className="text-muted-foreground">Total No Facturado:</span>
              </div>
              <span className="font-medium text-right text-red-600">{formatCLP(opexTotals.ocClp - opexTotals.invoicesClp)}</span>
              
              <div className="col-span-2 pt-2 border-t">
                <p className="text-xs text-muted-foreground italic">
                  El presupuesto OPEX se gestiona desde el Dashboard OPEX. Aquí solo se muestra el consumo imputado a este local.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Budget Tabs - CADA TAB COMPLETAMENTE INDEPENDIENTE */}
      <Tabs defaultValue={initialTab === "purchase-orders" ? "oc" : "capex"} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="capex" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-700">
            CAPEX
          </TabsTrigger>
          <TabsTrigger value="opex" className="data-[state=active]:bg-green-100 data-[state=active]:text-green-700">
            OPEX
          </TabsTrigger>
          <TabsTrigger value="oc">Órdenes de Compra</TabsTrigger>
        </TabsList>
        <TabsContent value="capex" className="mt-4">
          <BudgetModule 
            key={`cap-${selectedYear}-${refreshKey}`}
            contractId={contractId}
            contractName={contractName}
            contractCebe={contractCebe}
            budgetType="capex" 
            title="CAPEX" 
            selectedYear={selectedYear}
            ocTotal={capexTotals.ocUf}
            ocTotalClp={capexTotals.ocClp}
            onRefresh={() => { refreshData(); }}
            superficieEdificada={superficieEdificada}
          />
        </TabsContent>
        <TabsContent value="opex" className="mt-4">
          <BudgetModule 
            key={`opx-${selectedYear}-${refreshKey}`}
            contractId={contractId}
            contractName={contractName}
            contractCebe={contractCebe}
            budgetType="opex" 
            title="OPEX"
            selectedYear={selectedYear}
            ocTotal={opexTotals.ocUf}
            ocTotalClp={opexTotals.ocClp}
            onRefresh={() => { refreshData(); }}
            superficieEdificada={superficieEdificada}
          />
        </TabsContent>
        <TabsContent value="oc" className="mt-4 space-y-6">
          {/* OC Requests Section */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-purple-500" />
                Solicitudes de OC
              </CardTitle>
            </CardHeader>
            <CardContent>
              <OCRequestsList
                contractId={contractId}
                contractName={contractName}
                year={selectedYear}
                ufValue={ufValue}
                formatUF={formatUF}
                formatCLP={(v) => `$${Math.round(v).toLocaleString("es-CL")}`}
                onRefresh={() => { setRefreshKey(k => k + 1); refreshData(); }}
                isAdmin={true}
                allowCreate={true}
              />
            </CardContent>
          </Card>
          
          {/* Purchase Orders Section */}
          <PurchaseOrdersModule 
            key={`po-${selectedYear}-${refreshKey}`}
            contractId={contractId} 
            initialYear={selectedYear} 
            refreshKey={refreshKey}
            onRefresh={() => { setRefreshKey(k => k + 1); refreshData(); }}
          />
          <DeletedOrdersModule
            contractId={contractId}
            selectedYear={selectedYear}
            refreshKey={refreshKey}
            onRefresh={() => { setRefreshKey(k => k + 1); refreshData(); }}
          />
        </TabsContent>
      </Tabs>

      {/* Dialog: Nuevo Año CAPEX */}
      <Dialog open={showNewYearDialog} onOpenChange={setShowNewYearDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo Año CAPEX</DialogTitle>
            <DialogDescription>
              Cree el presupuesto CAPEX para un nuevo año fiscal. El OPEX se gestiona desde el Dashboard OPEX.
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
            
            <div className="space-y-2">
              <Label>Monto CAPEX</Label>
              <div className="flex gap-2">
                <Select value={capexCurrency} onValueChange={(v: "UF" | "CLP") => setCapexCurrency(v)}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UF">UF</SelectItem>
                    <SelectItem value="CLP">$</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  step={capexCurrency === "UF" ? "0.01" : "1"}
                  value={capexAmount}
                  onChange={(e) => setCapexAmount(e.target.value)}
                  placeholder={capexCurrency === "UF" ? "0.00" : "0"}
                  className="flex-1"
                />
              </div>
              {capexCurrency === "CLP" && parseFloat(capexAmount) > 0 && ufValue > 0 && (
                <p className="text-xs text-muted-foreground">
                  ≈ {formatUF(parseFloat(capexAmount) / ufValue)} (UF: {ufValue.toLocaleString("es-CL", { minimumFractionDigits: 2 })})
                </p>
              )}
            </div>

            <BudgetTemplateSelector
              budgetType="capex"
              value={capexTemplateId}
              onChange={setCapexTemplateId}
              label="Plantilla CAPEX (opcional)"
            />
            
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
              disabled={creatingYear}
            >
              {creatingYear && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crear CAPEX
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Cerrar Año CAPEX */}
      <CapexCloseYearDialog
        open={showCloseYearDialog}
        onOpenChange={setShowCloseYearDialog}
        contractId={contractId}
        year={selectedYear}
        onSuccess={() => {
          setRefreshKey(k => k + 1);
          loadYearBudgetInfo();
          loadAvailableYears();
        }}
      />

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

      {/* Dialog: Editar CAPEX */}
      <Dialog open={showEditCapexDialog} onOpenChange={setShowEditCapexDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Monto CAPEX {selectedYear}</DialogTitle>
            <DialogDescription>
              Modifique el monto total del presupuesto CAPEX para este local.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Monto CAPEX</Label>
              <div className="flex gap-2">
                <Select value={editCapexCurrency} onValueChange={(v: "UF" | "CLP") => setEditCapexCurrency(v)}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UF">UF</SelectItem>
                    <SelectItem value="CLP">$</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  step={editCapexCurrency === "UF" ? "0.01" : "1"}
                  value={editCapexAmount}
                  onChange={(e) => setEditCapexAmount(e.target.value)}
                  placeholder={editCapexCurrency === "UF" ? "0.00" : "0"}
                  className="flex-1"
                />
              </div>
              {editCapexCurrency === "CLP" && parseFloat(editCapexAmount) > 0 && ufValue > 0 && (
                <p className="text-xs text-muted-foreground">
                  ≈ {formatUF(parseFloat(editCapexAmount) / ufValue)} (UF: {ufValue.toLocaleString("es-CL", { minimumFractionDigits: 2 })})
                </p>
              )}
            </div>
            
            {/* Show current consumption info */}
            <div className="p-3 bg-muted/50 rounded-lg space-y-1">
              <p className="text-xs text-muted-foreground">Consumo actual:</p>
              <div className="flex justify-between text-sm">
                <span>OC emitidas:</span>
                <div className="text-right">
                  <span className="font-medium">{formatCLP(capexTotals.ocClp)}</span>
                  <span className="text-xs text-muted-foreground ml-1">({formatUF(capexTotals.ocUf)})</span>
                </div>
              </div>
              <div className="flex justify-between text-sm">
                <span>Facturado:</span>
                <div className="text-right">
                  <span className="font-medium">{formatCLP(capexTotals.invoicesClp)}</span>
                  <span className="text-xs text-muted-foreground ml-1">({formatUF(capexTotals.invoicesUf)})</span>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditCapexDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSaveCapexAmount} 
              disabled={editingCapex || parseFloat(editCapexAmount) < 0}
            >
              {editingCapex && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export const BudgetDashboard = ({ contractId, displayCurrency = "CLP", initialTab }: BudgetDashboardProps) => {
  return (
    <BudgetProvider initialCurrency={displayCurrency}>
      <BudgetDashboardContent contractId={contractId} initialTab={initialTab} />
    </BudgetProvider>
  );
};