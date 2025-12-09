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

interface BudgetSummary {
  budget: number;
  authorized: number;
  unauthorized: number;
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
  const [inversionSummary, setInversionSummary] = useState<BudgetSummary>({ budget: 0, authorized: 0, unauthorized: 0 });
  const [capexSummary, setCapexSummary] = useState<BudgetSummary>({ budget: 0, authorized: 0, unauthorized: 0 });
  const [totalOC, setTotalOC] = useState(0);
  const [totalPurchases, setTotalPurchases] = useState(0);
  const { toast } = useToast();
  const { formatUF, formatCLP, convertUFToPesos } = useBudgetContext();

  useEffect(() => {
    loadContractData();
    loadSummaries();
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

  const loadSummaries = async () => {
    const currentYear = new Date().getFullYear();

    // Cargar resumen de Inversión Inicial (INDEPENDIENTE)
    const invSummary = await loadBudgetTypeSummary(contractId, "inversion_inicial", currentYear);
    setInversionSummary(invSummary);

    // Cargar resumen de CAPEX (INDEPENDIENTE)
    const capSummary = await loadBudgetTypeSummary(contractId, "capex", currentYear);
    setCapexSummary(capSummary);

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

    setTotalOC((orders || []).reduce((acc, o) => acc + (o.amount_uf || 0), 0));
    setTotalPurchases((items || []).reduce((acc, i) => acc + (i.amount_uf || 0), 0));
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

    // Solo contar líneas hoja (sin hijos) para evitar doble conteo
    const leafLines = (lines || []).filter(line => {
      const hasChildren = (lines || []).some(l => l.parent_id === line.parent_id);
      return !hasChildren || line.parent_id !== null;
    });

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
      {/* Summary Cards - CADA UNO INDEPENDIENTE */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Inversión Inicial - INDEPENDIENTE */}
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              Inversión Inicial {currentYear}
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
              CAPEX {currentYear}
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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Órdenes de Compra
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatUF(totalOC)}</p>
            <p className="text-xs text-muted-foreground">{formatCLP(convertUFToPesos(totalOC))}</p>
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
            <p className="text-2xl font-bold">{formatUF(totalPurchases)}</p>
            <p className="text-xs text-muted-foreground">{formatCLP(convertUFToPesos(totalPurchases))}</p>
          </CardContent>
        </Card>
      </div>

      {/* Surfaces */}
      <ContractSurfaces data={surfaces} onChange={handleSurfaceChange} />

      {/* Budget Tabs - CADA TAB COMPLETAMENTE INDEPENDIENTE */}
      <Tabs defaultValue="inversion" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="inversion" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-700">
            Inversión Inicial
          </TabsTrigger>
          <TabsTrigger value="capex" className="data-[state=active]:bg-green-100 data-[state=active]:text-green-700">
            CAPEX
          </TabsTrigger>
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
