import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, TrendingUp, DollarSign, FileText, Receipt } from "lucide-react";
import { BudgetProvider, useBudgetContext } from "./BudgetContext";
import { BudgetModule } from "./BudgetModule";
import { PurchaseOrdersModule } from "./PurchaseOrdersModule";
import { BudgetSemaphore } from "./BudgetSemaphore";
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();
  const { formatPrimary, formatSecondary } = useBudgetContext();

  useEffect(() => {
    loadAvailableYears();
    setLoading(false);
  }, [contractId]);

  useEffect(() => {
    loadSummaries();
  }, [contractId, selectedYear]);

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

    // Obtener líneas del presupuesto específico
    const { data: lines } = await supabase
      .from("budget_lines")
      .select("amount_uf, status, parent_id")
      .eq("budget_id", budget.id);

    const authorized = (lines || [])
      .filter(l => l.status === "autorizado" && l.parent_id === null)
      .reduce((acc, l) => acc + (l.amount_uf || 0), 0);

    const unauthorized = (lines || [])
      .filter(l => l.status === "no_autorizado" && l.parent_id === null)
      .reduce((acc, l) => acc + (l.amount_uf || 0), 0);

    return {
      budget: budget.amount_uf || 0,
      authorized,
      unauthorized,
    };
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
      {/* Year Selector */}
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
              <span className="font-medium text-right">{formatPrimary(inversionSummary.authorized + capexSummary.authorized)}</span>
              
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
          <BudgetModule contractId={contractId} budgetType="inversion_inicial" title="Inversión Inicial" />
        </TabsContent>
        <TabsContent value="capex" className="mt-4">
          <BudgetModule contractId={contractId} budgetType="capex" title="CAPEX" />
        </TabsContent>
        <TabsContent value="oc" className="mt-4">
          <PurchaseOrdersModule contractId={contractId} initialYear={selectedYear} />
        </TabsContent>
      </Tabs>
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