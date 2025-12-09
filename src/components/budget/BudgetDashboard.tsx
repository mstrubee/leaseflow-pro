import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TrendingUp, DollarSign, Package, FileText } from "lucide-react";
import { BudgetProvider, useBudgetContext } from "./BudgetContext";
import { ContractSurfaces } from "./ContractSurfaces";
import { BudgetModule } from "./BudgetModule";
import { PurchaseOrdersModule } from "./PurchaseOrdersModule";
import { PurchaseItemsModule } from "./PurchaseItemsModule";
import { BudgetSemaphore } from "./BudgetSemaphore";
import { useToast } from "@/hooks/use-toast";

interface SurfaceData {
  superficie_terreno: number;
  superficie_edificada_local: number;
  superficie_showroom: number;
  superficie_bodega_backoffice: number;
  superficie_exterior_cubierto: number;
  superficie_exterior_descubierto: number;
  num_estacionamientos: number;
}

interface BudgetDashboardProps {
  contractId: string;
}

const BudgetDashboardContent = ({ contractId }: BudgetDashboardProps) => {
  const [surfaces, setSurfaces] = useState<SurfaceData>({
    superficie_terreno: 0,
    superficie_edificada_local: 0,
    superficie_showroom: 0,
    superficie_bodega_backoffice: 0,
    superficie_exterior_cubierto: 0,
    superficie_exterior_descubierto: 0,
    num_estacionamientos: 0,
  });
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    inversionBudget: 0,
    inversionConsumed: 0,
    capexBudget: 0,
    capexConsumed: 0,
    totalOC: 0,
    totalPurchases: 0,
  });
  const { toast } = useToast();
  const { formatUF, formatCLP, convertUFToPesos } = useBudgetContext();

  useEffect(() => {
    loadContractData();
    loadSummary();
  }, [contractId]);

  const loadContractData = async () => {
    try {
      const { data, error } = await supabase
        .from("contracts")
        .select("superficie_terreno, superficie_edificada_local, superficie_showroom, superficie_bodega_backoffice, superficie_exterior_cubierto, superficie_exterior_descubierto, num_estacionamientos")
        .eq("id", contractId)
        .single();

      if (error) throw error;
      if (data) {
        setSurfaces({
          superficie_terreno: data.superficie_terreno || 0,
          superficie_edificada_local: data.superficie_edificada_local || 0,
          superficie_showroom: data.superficie_showroom || 0,
          superficie_bodega_backoffice: data.superficie_bodega_backoffice || 0,
          superficie_exterior_cubierto: data.superficie_exterior_cubierto || 0,
          superficie_exterior_descubierto: data.superficie_exterior_descubierto || 0,
          num_estacionamientos: data.num_estacionamientos || 0,
        });
      }
    } catch (error) {
      console.error("Error loading surfaces:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadSummary = async () => {
    const currentYear = new Date().getFullYear();

    // Get budgets for current year
    const { data: budgets } = await supabase
      .from("contract_budgets")
      .select("*")
      .eq("contract_id", contractId)
      .eq("year", currentYear);

    const invBudget = budgets?.find((b) => b.budget_type === "inversion_inicial");
    const capexBudget = budgets?.find((b) => b.budget_type === "capex");

    // Get budget lines totals
    let invConsumed = 0;
    let capConsumed = 0;

    if (invBudget) {
      const { data: invLines } = await supabase
        .from("budget_lines")
        .select("amount_uf")
        .eq("budget_id", invBudget.id)
        .is("parent_id", null);
      invConsumed = (invLines || []).reduce((acc, l) => acc + (l.amount_uf || 0), 0);
    }

    if (capexBudget) {
      const { data: capexLines } = await supabase
        .from("budget_lines")
        .select("amount_uf")
        .eq("budget_id", capexBudget.id)
        .is("parent_id", null);
      capConsumed = (capexLines || []).reduce((acc, l) => acc + (l.amount_uf || 0), 0);
    }

    // Get OC totals
    const { data: orders } = await supabase
      .from("purchase_orders")
      .select("amount_uf")
      .eq("contract_id", contractId)
      .eq("year", currentYear);

    // Get purchase items totals
    const { data: items } = await supabase
      .from("purchase_items")
      .select("amount_uf")
      .eq("contract_id", contractId)
      .eq("year", currentYear);

    const ocTotal = (orders || []).reduce((acc, o) => acc + (o.amount_uf || 0), 0);
    const purchasesTotal = (items || []).reduce((acc, i) => acc + (i.amount_uf || 0), 0);

    setSummary({
      inversionBudget: invBudget?.amount_uf || 0,
      inversionConsumed: invConsumed,
      capexBudget: capexBudget?.amount_uf || 0,
      capexConsumed: capConsumed,
      totalOC: ocTotal,
      totalPurchases: purchasesTotal,
    });
  };

  const handleSurfaceChange = async (newSurfaces: SurfaceData) => {
    setSurfaces(newSurfaces);
    try {
      await supabase.from("contracts").update(newSurfaces).eq("id", contractId);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const currentYear = new Date().getFullYear();

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Inversión Inicial {currentYear}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{formatUF(summary.inversionConsumed)}</p>
                <p className="text-xs text-muted-foreground">de {formatUF(summary.inversionBudget)}</p>
              </div>
              <BudgetSemaphore budget={summary.inversionBudget} consumed={summary.inversionConsumed} showLabel={false} size="lg" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              CAPEX {currentYear}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{formatUF(summary.capexConsumed)}</p>
                <p className="text-xs text-muted-foreground">de {formatUF(summary.capexBudget)}</p>
              </div>
              <BudgetSemaphore budget={summary.capexBudget} consumed={summary.capexConsumed} showLabel={false} size="lg" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Órdenes de Compra
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatUF(summary.totalOC)}</p>
            <p className="text-xs text-muted-foreground">{formatCLP(convertUFToPesos(summary.totalOC))}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Package className="h-4 w-4" />
              Compras
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatUF(summary.totalPurchases)}</p>
            <p className="text-xs text-muted-foreground">{formatCLP(convertUFToPesos(summary.totalPurchases))}</p>
          </CardContent>
        </Card>
      </div>

      {/* Surfaces */}
      <ContractSurfaces data={surfaces} onChange={handleSurfaceChange} />

      {/* Budget Tabs */}
      <Tabs defaultValue="inversion" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="inversion">Inversión Inicial</TabsTrigger>
          <TabsTrigger value="capex">CAPEX</TabsTrigger>
          <TabsTrigger value="oc">Órdenes de Compra</TabsTrigger>
          <TabsTrigger value="compras">Listado Compras</TabsTrigger>
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
        <TabsContent value="compras" className="mt-4">
          <PurchaseItemsModule contractId={contractId} />
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
