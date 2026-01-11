import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Search,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  X,
  TrendingUp,
  Wallet,
  PlusCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface OpexCategory {
  id: string;
  name: string;
  description: string | null;
}

interface MasterBudget {
  id: string;
  year: number;
  category_id: string;
  amount_uf: number;
  category_name?: string;
}

interface LocalAdditional {
  id: string;
  contract_id: string;
  year: number;
  category_id: string;
  amount_uf: number;
  notes: string | null;
  contract_name?: string;
  category_name?: string;
}

interface OpexConsumption {
  contract_id: string;
  contract_name: string;
  category_id: string;
  category_name: string;
  consumed_uf: number;
}

interface ContractOpexSummary {
  contract_id: string;
  contract_name: string;
  categories: {
    category_id: string;
    category_name: string;
    master_budget: number;
    additional_budget: number;
    consumed: number;
    available: number;
  }[];
  total_budget: number;
  total_consumed: number;
  total_available: number;
}

const OpexDashboard = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading, isAdmin } = useAuth();

  const [categories, setCategories] = useState<OpexCategory[]>([]);
  const [masterBudgets, setMasterBudgets] = useState<MasterBudget[]>([]);
  const [localAdditionals, setLocalAdditionals] = useState<LocalAdditional[]>([]);
  const [consumptions, setConsumptions] = useState<OpexConsumption[]>([]);
  const [contracts, setContracts] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [contractFilter, setContractFilter] = useState("todos");
  const [categoryFilter, setCategoryFilter] = useState("todos");
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear().toString());

  // Collapse state per contract
  const [expandedContracts, setExpandedContracts] = useState<Set<string>>(new Set());

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    masterBudgets.forEach((b) => years.add(b.year));
    localAdditionals.forEach((a) => years.add(a.year));
    years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [masterBudgets, localAdditionals]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, yearFilter]);

  const loadData = async () => {
    setLoading(true);
    const selectedYear = parseInt(yearFilter);

    try {
      // Load categories
      const { data: categoriesData } = await supabase
        .from("opex_categories")
        .select("*")
        .eq("is_active", true)
        .order("display_order");
      setCategories(categoriesData || []);

      // Load contracts
      const { data: contractsData } = await supabase
        .from("contracts")
        .select("id, name")
        .is("deleted_at", null)
        .order("name");
      setContracts(contractsData || []);

      // Load master budgets for selected year
      const { data: masterData } = await supabase
        .from("opex_master_budget")
        .select("*, opex_categories(name)")
        .eq("year", selectedYear);
      
      const processedMaster = (masterData || []).map((m: any) => ({
        ...m,
        category_name: m.opex_categories?.name || "Sin categoría",
      }));
      setMasterBudgets(processedMaster);

      // Load local additionals for selected year
      const { data: additionalsData } = await supabase
        .from("opex_local_additional")
        .select("*, contracts(name), opex_categories(name)")
        .eq("year", selectedYear);

      const processedAdditionals = (additionalsData || []).map((a: any) => ({
        ...a,
        contract_name: a.contracts?.name || "Sin contrato",
        category_name: a.opex_categories?.name || "Sin categoría",
      }));
      setLocalAdditionals(processedAdditionals);

      // Load consumption (OPEX purchase orders)
      const { data: ordersData } = await supabase
        .from("purchase_orders")
        .select(`
          contract_id,
          amount_uf,
          opex_category_id,
          created_at,
          contracts!inner(name),
          opex_categories(name)
        `)
        .eq("budget_classification", "OPEX")
        .is("deleted_at", null);

      // Filter by year based on created_at
      const filteredOrders = (ordersData || []).filter((o: any) => {
        const orderYear = new Date(o.created_at).getFullYear();
        return orderYear === selectedYear;
      });

      // Aggregate consumption by contract and category
      const consumptionMap = new Map<string, OpexConsumption>();
      filteredOrders.forEach((o: any) => {
        const key = `${o.contract_id}-${o.opex_category_id}`;
        const existing = consumptionMap.get(key);
        if (existing) {
          existing.consumed_uf += o.amount_uf || 0;
        } else {
          consumptionMap.set(key, {
            contract_id: o.contract_id,
            contract_name: o.contracts?.name || "Sin contrato",
            category_id: o.opex_category_id,
            category_name: o.opex_categories?.name || "Sin categoría",
            consumed_uf: o.amount_uf || 0,
          });
        }
      });
      setConsumptions(Array.from(consumptionMap.values()));
    } catch (error) {
      console.error("Error loading OPEX data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Build contract summaries
  const contractSummaries = useMemo(() => {
    const summaries: ContractOpexSummary[] = [];

    contracts.forEach((contract) => {
      // Apply contract filter
      if (contractFilter !== "todos" && contract.id !== contractFilter) return;

      // Apply search filter
      if (searchTerm && !contract.name.toLowerCase().includes(searchTerm.toLowerCase())) return;

      const contractCategories: ContractOpexSummary["categories"] = [];

      categories.forEach((category) => {
        // Apply category filter
        if (categoryFilter !== "todos" && category.id !== categoryFilter) return;

        // Get master budget for this category
        const masterBudget = masterBudgets.find((m) => m.category_id === category.id);
        const masterAmount = masterBudget?.amount_uf || 0;

        // Get local additional for this contract/category
        const additional = localAdditionals.find(
          (a) => a.contract_id === contract.id && a.category_id === category.id
        );
        const additionalAmount = additional?.amount_uf || 0;

        // Get consumption for this contract/category
        const consumption = consumptions.find(
          (c) => c.contract_id === contract.id && c.category_id === category.id
        );
        const consumedAmount = consumption?.consumed_uf || 0;

        // Only include if there's any budget or consumption
        if (masterAmount > 0 || additionalAmount > 0 || consumedAmount > 0) {
          contractCategories.push({
            category_id: category.id,
            category_name: category.name,
            master_budget: masterAmount,
            additional_budget: additionalAmount,
            consumed: consumedAmount,
            available: masterAmount + additionalAmount - consumedAmount,
          });
        }
      });

      if (contractCategories.length > 0 || categoryFilter === "todos") {
        const totalBudget = contractCategories.reduce(
          (sum, c) => sum + c.master_budget + c.additional_budget,
          0
        );
        const totalConsumed = contractCategories.reduce((sum, c) => sum + c.consumed, 0);

        summaries.push({
          contract_id: contract.id,
          contract_name: contract.name,
          categories: contractCategories,
          total_budget: totalBudget,
          total_consumed: totalConsumed,
          total_available: totalBudget - totalConsumed,
        });
      }
    });

    return summaries.filter((s) => s.categories.length > 0 || categoryFilter === "todos");
  }, [contracts, categories, masterBudgets, localAdditionals, consumptions, searchTerm, contractFilter, categoryFilter]);

  // Calculate totals
  const globalTotals = useMemo(() => {
    const totalMasterBudget = masterBudgets.reduce((sum, m) => sum + m.amount_uf, 0);
    const totalAdditional = localAdditionals.reduce((sum, a) => sum + a.amount_uf, 0);
    const totalConsumed = consumptions.reduce((sum, c) => sum + c.consumed_uf, 0);
    return {
      budget: totalMasterBudget + totalAdditional,
      consumed: totalConsumed,
      available: totalMasterBudget + totalAdditional - totalConsumed,
      masterBudget: totalMasterBudget,
      additional: totalAdditional,
    };
  }, [masterBudgets, localAdditionals, consumptions]);

  const toggleContract = (contractId: string) => {
    setExpandedContracts((prev) => {
      const next = new Set(prev);
      if (next.has(contractId)) {
        next.delete(contractId);
      } else {
        next.add(contractId);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedContracts(new Set(contractSummaries.map((s) => s.contract_id)));
  };

  const collapseAll = () => {
    setExpandedContracts(new Set());
  };

  const clearFilters = () => {
    setSearchTerm("");
    setContractFilter("todos");
    setCategoryFilter("todos");
  };

  const hasActiveFilters =
    searchTerm || contractFilter !== "todos" || categoryFilter !== "todos";

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[1536px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-semibold text-foreground">Presupuesto OPEX</h1>
                <p className="text-sm text-muted-foreground">
                  Vista consolidada del presupuesto operacional
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={yearFilter} onValueChange={setYearFilter}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Año" />
                </SelectTrigger>
                <SelectContent>
                  {availableYears.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={expandAll}>
                <ChevronsUpDown className="h-4 w-4 mr-1" />
                Expandir Todo
              </Button>
              <Button variant="outline" size="sm" onClick={collapseAll}>
                Colapsar Todo
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1536px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Presupuesto Master
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {globalTotals.masterBudget.toLocaleString("es-CL", { minimumFractionDigits: 2 })} UF
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <PlusCircle className="h-4 w-4" />
                Adicionales
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {globalTotals.additional.toLocaleString("es-CL", { minimumFractionDigits: 2 })} UF
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Consumido
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {globalTotals.consumed.toLocaleString("es-CL", { minimumFractionDigits: 2 })} UF
              </div>
              <Progress
                value={globalTotals.budget > 0 ? (globalTotals.consumed / globalTotals.budget) * 100 : 0}
                className="mt-2 h-2"
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Disponible
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${globalTotals.available < 0 ? "text-destructive" : "text-green-600"}`}>
                {globalTotals.available.toLocaleString("es-CL", { minimumFractionDigits: 2 })} UF
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Master Budget by Category */}
        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Presupuesto Master por Categoría</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoría</TableHead>
                    <TableHead className="text-right">Presupuesto (UF)</TableHead>
                    <TableHead className="text-right">Consumido (UF)</TableHead>
                    <TableHead className="text-right">Disponible (UF)</TableHead>
                    <TableHead className="w-[200px]">Uso</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((category) => {
                    const master = masterBudgets.find((m) => m.category_id === category.id);
                    const budget = master?.amount_uf || 0;
                    const consumed = consumptions
                      .filter((c) => c.category_id === category.id)
                      .reduce((sum, c) => sum + c.consumed_uf, 0);
                    const available = budget - consumed;
                    const usagePercent = budget > 0 ? (consumed / budget) * 100 : 0;

                    return (
                      <TableRow key={category.id}>
                        <TableCell className="font-medium">{category.name}</TableCell>
                        <TableCell className="text-right">
                          {budget.toLocaleString("es-CL", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right text-orange-600">
                          {consumed.toLocaleString("es-CL", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className={`text-right ${available < 0 ? "text-destructive" : "text-green-600"}`}>
                          {available.toLocaleString("es-CL", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={Math.min(usagePercent, 100)} className="h-2 flex-1" />
                            <span className="text-xs text-muted-foreground w-12 text-right">
                              {usagePercent.toFixed(0)}%
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por local..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>

              <Select value={contractFilter} onValueChange={setContractFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Local" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los locales</SelectItem>
                  {contracts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas las categorías</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1" />
                  Limpiar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Contract OPEX Details */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : contractSummaries.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No se encontraron datos OPEX para los filtros seleccionados
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {contractSummaries.map((summary) => {
              const isExpanded = expandedContracts.has(summary.contract_id);
              const usagePercent =
                summary.total_budget > 0
                  ? (summary.total_consumed / summary.total_budget) * 100
                  : 0;

              return (
                <Collapsible
                  key={summary.contract_id}
                  open={isExpanded}
                  onOpenChange={() => toggleContract(summary.contract_id)}
                >
                  <Card>
                    <CollapsibleTrigger asChild>
                      <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {isExpanded ? (
                              <ChevronDown className="h-5 w-5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-5 w-5 text-muted-foreground" />
                            )}
                            <div className="flex-1">
                              <CardTitle className="text-base">{summary.contract_name}</CardTitle>
                              <div className="flex items-center gap-4 mt-1">
                                <span className="text-sm text-muted-foreground">
                                  Presupuesto: {summary.total_budget.toLocaleString("es-CL", { minimumFractionDigits: 2 })} UF
                                </span>
                                <span className="text-sm text-orange-600">
                                  Consumido: {summary.total_consumed.toLocaleString("es-CL", { minimumFractionDigits: 2 })} UF
                                </span>
                                <span className={`text-sm ${summary.total_available < 0 ? "text-destructive" : "text-green-600"}`}>
                                  Disponible: {summary.total_available.toLocaleString("es-CL", { minimumFractionDigits: 2 })} UF
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="w-32">
                              <Progress value={Math.min(usagePercent, 100)} className="h-2" />
                              <span className="text-xs text-muted-foreground">{usagePercent.toFixed(0)}% usado</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/contracts/${summary.contract_id}`);
                              }}
                            >
                              Ver Local
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="pt-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Categoría</TableHead>
                              <TableHead className="text-right">Master (UF)</TableHead>
                              <TableHead className="text-right">Adicional (UF)</TableHead>
                              <TableHead className="text-right">Total (UF)</TableHead>
                              <TableHead className="text-right">Consumido (UF)</TableHead>
                              <TableHead className="text-right">Disponible (UF)</TableHead>
                              <TableHead className="w-[150px]">Uso</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {summary.categories.map((cat) => {
                              const total = cat.master_budget + cat.additional_budget;
                              const catUsage = total > 0 ? (cat.consumed / total) * 100 : 0;

                              return (
                                <TableRow key={cat.category_id}>
                                  <TableCell className="font-medium">
                                    {cat.category_name}
                                    {cat.additional_budget > 0 && (
                                      <Badge variant="outline" className="ml-2 text-xs">
                                        +Adicional
                                      </Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {cat.master_budget.toLocaleString("es-CL", { minimumFractionDigits: 2 })}
                                  </TableCell>
                                  <TableCell className="text-right text-blue-600">
                                    {cat.additional_budget > 0
                                      ? cat.additional_budget.toLocaleString("es-CL", { minimumFractionDigits: 2 })
                                      : "-"}
                                  </TableCell>
                                  <TableCell className="text-right font-medium">
                                    {total.toLocaleString("es-CL", { minimumFractionDigits: 2 })}
                                  </TableCell>
                                  <TableCell className="text-right text-orange-600">
                                    {cat.consumed.toLocaleString("es-CL", { minimumFractionDigits: 2 })}
                                  </TableCell>
                                  <TableCell className={`text-right ${cat.available < 0 ? "text-destructive" : "text-green-600"}`}>
                                    {cat.available.toLocaleString("es-CL", { minimumFractionDigits: 2 })}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      <Progress value={Math.min(catUsage, 100)} className="h-2 flex-1" />
                                      <span className="text-xs text-muted-foreground w-10 text-right">
                                        {catUsage.toFixed(0)}%
                                      </span>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default OpexDashboard;
