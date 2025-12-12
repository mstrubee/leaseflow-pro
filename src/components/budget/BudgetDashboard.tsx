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
}

const BudgetDashboardContent = ({ contractId }: BudgetDashboardProps) => {
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [inversionSummary, setInversionSummary] = useState<BudgetSummary>({ budget: 0, authorized: 0, unauthorized: 0 });
  const [capexSummary, setCapexSummary] = useState<BudgetSummary>({ budget: 0, authorized: 0, unauthorized: 0 });
  const [totalOC, setTotalOC] = useState(0);
  const [totalInvoices, setTotalInvoices] = useState(0);
  const { toast } = useToast();
  const { formatUF, formatCLP, convertUFToPesos } = useBudgetContext();

  useEffect(() => {
    loadAvailableYears();
    setLoading(false);
  }, [contractId]);

  useEffect(() => {
    loadSummaries();
  }, [contractId, selectedYear]);

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
    // Cargar resumen de Inversión Inicial (INDEPENDIENTE)
    const invSummary = await loadBudgetTypeSummary(contractId, "inversion_inicial", selectedYear);
    setInversionSummary(invSummary);

    // Cargar resumen de CAPEX (INDEPENDIENTE)
    const capSummary = await loadBudgetTypeSummary(contractId, "capex", selectedYear);
    setCapexSummary(capSummary);

    // Get OC totals for selected year
    const { data: orders } = await supabase
      .from("purchase_orders")
      .select("amount_uf")
      .eq("contract_id", contractId)
      .eq("year", selectedYear);

    setTotalOC((orders || []).reduce((acc, o) => acc + (o.amount_uf || 0), 0));

    // Get invoice totals for selected year - sum all invoices from purchase orders in this contract/year
    const { data: ordersWithInvoices } = await supabase
      .from("purchase_orders")
      .select("id")
      .eq("contract_id", contractId)
      .eq("year", selectedYear);

    if (ordersWithInvoices && ordersWithInvoices.length > 0) {
      const orderIds = ordersWithInvoices.map(o => o.id);
      const { data: invoices } = await supabase
        .from("invoices")
        .select("amount_uf")
        .in("purchase_order_id", orderIds);

      setTotalInvoices((invoices || []).reduce((acc, i) => acc + (i.amount_uf || 0), 0));
    } else {
      setTotalInvoices(0);
    }
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
        <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
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

      {/* Summary Cards - CADA UNO INDEPENDIENTE */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Inversión Inicial - INDEPENDIENTE */}
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              Inversión Inicial {selectedYear}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{formatUF(inversionSummary.authorized)}</p>
                <p className="text-xs text-muted-foreground">de {formatUF(inversionSummary.budget)}</p>
                {inversionSummary.unauthorized > 0 && (
                  <p className="text-xs text-yellow-600">+{formatUF(inversionSummary.unauthorized)} pendiente</p>
                )}
              </div>
              <BudgetSemaphore budget={inversionSummary.budget} consumed={inversionSummary.authorized} showLabel={false} size="lg" />
            </div>
          </CardContent>
        </Card>

        {/* CAPEX - INDEPENDIENTE */}
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-500" />
              CAPEX {selectedYear}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{formatUF(capexSummary.authorized)}</p>
                <p className="text-xs text-muted-foreground">de {formatUF(capexSummary.budget)}</p>
                {capexSummary.unauthorized > 0 && (
                  <p className="text-xs text-yellow-600">+{formatUF(capexSummary.unauthorized)} pendiente</p>
                )}
              </div>
              <BudgetSemaphore budget={capexSummary.budget} consumed={capexSummary.authorized} showLabel={false} size="lg" />
            </div>
          </CardContent>
        </Card>

        {/* Órdenes de Compra */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Órdenes de Compra {selectedYear}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatUF(totalOC)}</p>
            <p className="text-xs text-muted-foreground">{formatCLP(convertUFToPesos(totalOC))}</p>
          </CardContent>
        </Card>

        {/* Facturación */}
        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Receipt className="h-4 w-4 text-purple-500" />
              Facturación {selectedYear}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatUF(totalInvoices)}</p>
            <p className="text-xs text-muted-foreground">{formatCLP(convertUFToPesos(totalInvoices))}</p>
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
          <PurchaseOrdersModule contractId={contractId} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export const BudgetDashboard = (props: BudgetDashboardProps) => {
  return (
    <BudgetProvider>
      <BudgetDashboardContent {...props} />
    </BudgetProvider>
  );
};