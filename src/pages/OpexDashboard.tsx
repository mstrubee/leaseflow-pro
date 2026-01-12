import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useSingleCollapsible } from "@/hooks/useCollapsibleState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Search, ChevronDown, ChevronRight, ChevronsUpDown, X, TrendingUp, Wallet, PlusCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEconomicIndicators } from "@/hooks/useEconomicIndicators";
import { OpexExcelUpload } from "@/components/opex/OpexExcelUpload";
import { MasterBudgetTable } from "@/components/opex/MasterBudgetTable";
import { useOpexNavigation } from "@/components/opex/OpexReturnButton";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  amount_clp: number;
  month_01_clp: number;
  month_02_clp: number;
  month_03_clp: number;
  month_04_clp: number;
  month_05_clp: number;
  month_06_clp: number;
  month_07_clp: number;
  month_08_clp: number;
  month_09_clp: number;
  month_10_clp: number;
  month_11_clp: number;
  month_12_clp: number;
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
  consumed_clp: number;
}
interface Company {
  id: string;
  name: string;
}
interface Contract {
  id: string;
  name: string;
  company_id: string | null;
  company_name?: string;
}
interface ContractOpexSummary {
  contract_id: string;
  contract_name: string;
  company_id: string | null;
  company_name: string;
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

// Colors for categories in chart (distinct, accessible colors)
const CATEGORY_COLORS = [
  "#3b82f6", // blue
  "#10b981", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#84cc16", // lime
  "#14b8a6", // teal
  "#a855f7", // purple
  "#f43f5e", // rose
  "#0ea5e9", // sky
  "#eab308", // yellow
  "#22c55e", // green-500
  "#6366f1", // indigo
];
const OpexDashboard = () => {
  const navigate = useNavigate();
  const {
    user,
    loading: authLoading,
    isAdmin
  } = useAuth();
  const {
    ufValue,
    loading: ufLoading
  } = useEconomicIndicators();
  const {
    navigateToContractFromOpex
  } = useOpexNavigation();
  const [categories, setCategories] = useState<OpexCategory[]>([]);
  const [masterBudgets, setMasterBudgets] = useState<MasterBudget[]>([]);
  const [localAdditionals, setLocalAdditionals] = useState<LocalAdditional[]>([]);
  const [consumptions, setConsumptions] = useState<OpexConsumption[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [contractFilter, setContractFilter] = useState("todos");
  const [categoryFilter, setCategoryFilter] = useState("todos");
  const [companyFilter, setCompanyFilter] = useState("todos");
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear().toString());

  // Collapse state per contract
  const [expandedContracts, setExpandedContracts] = useState<Set<string>>(new Set());

  // Collapsible state for OPEX por Local section
  const {
    isOpen: isLocalSectionOpen,
    toggle: toggleLocalSection
  } = useSingleCollapsible("opex-local-section", false);

  // Collapsible state for OPEX por Categoría section
  const {
    isOpen: isCategorySectionOpen,
    toggle: toggleCategorySection
  } = useSingleCollapsible("opex-category-section", false);
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    masterBudgets.forEach(b => years.add(b.year));
    localAdditionals.forEach(a => years.add(a.year));
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
      const {
        data: categoriesData
      } = await supabase.from("opex_categories").select("*").eq("is_active", true).order("display_order");
      setCategories(categoriesData || []);

      // Load companies
      const {
        data: companiesData
      } = await supabase.from("companies").select("id, name").order("name");
      setCompanies(companiesData || []);

      // Load contracts with company info from contract_companies - only active contracts (status = 'firmado')
      const {
        data: contractsData
      } = await supabase.from("contracts").select("id, name, status, contract_companies(company_id, companies(id, name))").is("deleted_at", null).eq("status", "firmado").order("name");
      const processedContracts = (contractsData || []).map((c: any) => {
        // Get company from contract_companies relation
        const companyRelation = c.contract_companies?.[0];
        const companyData = companyRelation?.companies;
        return {
          id: c.id,
          name: c.name,
          company_id: companyData?.id || null,
          company_name: companyData?.name || "Sin empresa"
        };
      });
      setContracts(processedContracts);

      // Load master budgets for selected year
      const {
        data: masterData
      } = await supabase.from("opex_master_budget").select("*, opex_categories(name)").eq("year", selectedYear);
      const processedMaster = (masterData || []).map((m: any) => ({
        ...m,
        category_name: m.opex_categories?.name || "Sin categoría"
      }));
      setMasterBudgets(processedMaster);

      // Load local additionals for selected year
      const {
        data: additionalsData
      } = await supabase.from("opex_local_additional").select("*, contracts(name), opex_categories(name)").eq("year", selectedYear);
      const processedAdditionals = (additionalsData || []).map((a: any) => ({
        ...a,
        contract_name: a.contracts?.name || "Sin contrato",
        category_name: a.opex_categories?.name || "Sin categoría"
      }));
      setLocalAdditionals(processedAdditionals);

      // Load consumption (OPEX purchase orders)
      const {
        data: ordersData
      } = await supabase.from("purchase_orders").select(`
          contract_id,
          amount_uf,
          opex_category_id,
          created_at,
          contracts!inner(name),
          opex_categories(name)
        `).eq("budget_classification", "OPEX").is("deleted_at", null);

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
        const amountUf = o.amount_uf || 0;
        if (existing) {
          existing.consumed_uf += amountUf;
          existing.consumed_clp += amountUf * (ufValue || 0);
        } else {
          consumptionMap.set(key, {
            contract_id: o.contract_id,
            contract_name: o.contracts?.name || "Sin contrato",
            category_id: o.opex_category_id,
            category_name: o.opex_categories?.name || "Sin categoría",
            consumed_uf: amountUf,
            consumed_clp: amountUf * (ufValue || 0)
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
    contracts.forEach(contract => {
      // Apply contract filter
      if (contractFilter !== "todos" && contract.id !== contractFilter) return;

      // Apply company filter
      if (companyFilter !== "todos" && contract.company_id !== companyFilter) return;

      // Apply search filter
      if (searchTerm && !contract.name.toLowerCase().includes(searchTerm.toLowerCase())) return;
      const contractCategories: ContractOpexSummary["categories"] = [];
      categories.forEach(category => {
        // Apply category filter
        if (categoryFilter !== "todos" && category.id !== categoryFilter) return;

        // Get master budget for this category
        const masterBudget = masterBudgets.find(m => m.category_id === category.id);
        const masterAmount = masterBudget?.amount_uf || 0;

        // Get local additional for this contract/category
        const additional = localAdditionals.find(a => a.contract_id === contract.id && a.category_id === category.id);
        const additionalAmount = additional?.amount_uf || 0;

        // Get consumption for this contract/category
        const consumption = consumptions.find(c => c.contract_id === contract.id && c.category_id === category.id);
        const consumedAmount = consumption?.consumed_uf || 0;

        // Only include if there's any budget or consumption
        if (masterAmount > 0 || additionalAmount > 0 || consumedAmount > 0) {
          contractCategories.push({
            category_id: category.id,
            category_name: category.name,
            master_budget: masterAmount,
            additional_budget: additionalAmount,
            consumed: consumedAmount,
            available: masterAmount + additionalAmount - consumedAmount
          });
        }
      });
      if (contractCategories.length > 0 || categoryFilter === "todos") {
        const totalBudget = contractCategories.reduce((sum, c) => sum + c.master_budget + c.additional_budget, 0);
        const totalConsumed = contractCategories.reduce((sum, c) => sum + c.consumed, 0);
        summaries.push({
          contract_id: contract.id,
          contract_name: contract.name,
          company_id: contract.company_id,
          company_name: contract.company_name || "Sin empresa",
          categories: contractCategories,
          total_budget: totalBudget,
          total_consumed: totalConsumed,
          total_available: totalBudget - totalConsumed
        });
      }
    });
    return summaries.filter(s => s.categories.length > 0 || categoryFilter === "todos");
  }, [contracts, categories, masterBudgets, localAdditionals, consumptions, searchTerm, contractFilter, categoryFilter, companyFilter]);

  // Calculate totals - now in CLP as primary (use absolute values)
  const globalTotals = useMemo(() => {
    const totalMasterBudgetCLP = masterBudgets.reduce((sum, m) => sum + Math.abs(m.amount_clp || 0), 0);
    const totalMasterBudgetUF = masterBudgets.reduce((sum, m) => sum + Math.abs(m.amount_uf || 0), 0);
    const totalAdditionalUF = localAdditionals.reduce((sum, a) => sum + Math.abs(a.amount_uf || 0), 0);
    const totalAdditionalCLP = totalAdditionalUF * (ufValue || 0);
    const totalConsumedUF = consumptions.reduce((sum, c) => sum + Math.abs(c.consumed_uf), 0);
    const totalConsumedCLP = consumptions.reduce((sum, c) => sum + Math.abs(c.consumed_clp), 0);
    const totalBudgetCLP = totalMasterBudgetCLP + totalAdditionalCLP;
    const totalBudgetUF = totalMasterBudgetUF + totalAdditionalUF;
    return {
      budgetCLP: totalBudgetCLP,
      budgetUF: totalBudgetUF,
      consumedCLP: totalConsumedCLP,
      consumedUF: totalConsumedUF,
      availableCLP: totalBudgetCLP - totalConsumedCLP,
      availableUF: totalBudgetUF - totalConsumedUF,
      masterBudgetCLP: totalMasterBudgetCLP,
      masterBudgetUF: totalMasterBudgetUF,
      additionalCLP: totalAdditionalCLP,
      additionalUF: totalAdditionalUF
    };
  }, [masterBudgets, localAdditionals, consumptions, ufValue]);

  // Build chart data: pie chart showing consumption by local (only locals with consumption)
  const chartData = useMemo(() => {
    interface ChartDataItem {
      contract_id: string;
      name: string;
      total_budget: number;
      total_consumed: number;
      percent_consumed: number;
      percent_of_total: number;
      categories: { id: string; name: string; consumed: number; percent: number }[];
    }

    const data: ChartDataItem[] = [];
    let grandTotalConsumed = 0;

    // First pass: calculate grand total
    contracts.forEach(contract => {
      if (companyFilter !== "todos" && contract.company_id !== companyFilter) return;
      if (contractFilter !== "todos" && contract.id !== contractFilter) return;
      
      categories.forEach(category => {
        if (categoryFilter !== "todos" && category.id !== categoryFilter) return;
        const consumption = consumptions.find(c => c.contract_id === contract.id && c.category_id === category.id);
        grandTotalConsumed += Math.abs(consumption?.consumed_uf || 0);
      });
    });

    // Second pass: build data with percentages
    contracts.forEach(contract => {
      if (companyFilter !== "todos" && contract.company_id !== companyFilter) return;
      if (contractFilter !== "todos" && contract.id !== contractFilter) return;
      
      let totalBudget = 0;
      let totalConsumed = 0;
      const categoryDetails: { id: string; name: string; consumed: number; percent: number }[] = [];

      categories.forEach(category => {
        if (categoryFilter !== "todos" && category.id !== categoryFilter) return;

        const masterBudget = masterBudgets.find(m => m.category_id === category.id);
        const masterAmount = Math.abs(masterBudget?.amount_uf || 0);
        const additional = localAdditionals.find(a => a.contract_id === contract.id && a.category_id === category.id);
        const additionalAmount = Math.abs(additional?.amount_uf || 0);
        const consumption = consumptions.find(c => c.contract_id === contract.id && c.category_id === category.id);
        const consumedAmount = Math.abs(consumption?.consumed_uf || 0);

        totalBudget += masterAmount + additionalAmount;
        totalConsumed += consumedAmount;
        
        if (consumedAmount > 0) {
          categoryDetails.push({
            id: category.id,
            name: category.name,
            consumed: consumedAmount,
            percent: 0 // Will be calculated after
          });
        }
      });

      // Only include locals that have consumption
      if (totalConsumed > 0) {
        const percentConsumed = totalBudget > 0 ? (totalConsumed / totalBudget) * 100 : 0;
        const percentOfTotal = grandTotalConsumed > 0 ? (totalConsumed / grandTotalConsumed) * 100 : 0;
        
        // Calculate percent for each category relative to local's total consumption
        categoryDetails.forEach(cat => {
          cat.percent = totalConsumed > 0 ? (cat.consumed / totalConsumed) * 100 : 0;
        });
        
        data.push({
          contract_id: contract.id,
          name: contract.name,
          total_budget: totalBudget,
          total_consumed: totalConsumed,
          percent_consumed: percentConsumed,
          percent_of_total: percentOfTotal,
          categories: categoryDetails
        });
      }
    });

    // Sort by consumption descending
    return data.sort((a, b) => b.total_consumed - a.total_consumed);
  }, [contracts, categories, masterBudgets, localAdditionals, consumptions, companyFilter, contractFilter, categoryFilter]);


  // Get color for category
  const getCategoryColor = (categoryName: string) => {
    const index = categories.findIndex(c => c.name === categoryName);
    if (index === -1) return "#94a3b8";
    return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
  };

  // Get color for company (used in OPEX por Local section)
  const getCompanyColor = (companyId: string | null) => {
    if (!companyId) return "#94a3b8";
    const index = companies.findIndex(c => c.id === companyId);
    if (index === -1) return "#94a3b8";
    return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
  };

  // Handle viewing local
  const handleViewLocal = (contractId: string) => {
    navigateToContractFromOpex(contractId);
  };

  // Handle viewing category across locals
  const handleViewCategory = (categoryId: string) => {
    setCategoryFilter(categoryId);
  };
  const toggleContract = (contractId: string) => {
    setExpandedContracts(prev => {
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
    setExpandedContracts(new Set(contractSummaries.map(s => s.contract_id)));
  };
  const collapseAll = () => {
    setExpandedContracts(new Set());
  };
  const clearFilters = () => {
    setSearchTerm("");
    setContractFilter("todos");
    setCategoryFilter("todos");
    setCompanyFilter("todos");
  };
  const hasActiveFilters = searchTerm || contractFilter !== "todos" || categoryFilter !== "todos" || companyFilter !== "todos";
  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>;
  }
  return <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[1536px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-semibold text-foreground">OPEX</h1>
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
                  {availableYears.map(year => <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>)}
                </SelectContent>
              </Select>
              {isAdmin && <OpexExcelUpload year={parseInt(yearFilter)} ufValue={ufValue} onSuccess={loadData} />}
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
        {/* Summary Cards - Now in CLP with UF as secondary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">OPEX Total<Wallet className="h-4 w-4" />
                Presupuesto Master
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                $ {Math.round(globalTotals.masterBudgetCLP).toLocaleString("es-CL")}
              </div>
              <div className="text-sm text-muted-foreground">
                ≈ {globalTotals.masterBudgetUF.toLocaleString("es-CL", {
                minimumFractionDigits: 2
              })} UF
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">Opex Adicional<PlusCircle className="h-4 w-4" />
                Adicionales
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                $ {Math.round(globalTotals.additionalCLP).toLocaleString("es-CL")}
              </div>
              <div className="text-sm text-muted-foreground">
                ≈ {globalTotals.additionalUF.toLocaleString("es-CL", {
                minimumFractionDigits: 2
              })} UF
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
                $ {Math.round(globalTotals.consumedCLP).toLocaleString("es-CL")}
              </div>
              <div className="text-sm text-muted-foreground">
                ≈ {globalTotals.consumedUF.toLocaleString("es-CL", {
                minimumFractionDigits: 2
              })} UF
              </div>
              <Progress value={globalTotals.budgetCLP > 0 ? globalTotals.consumedCLP / globalTotals.budgetCLP * 100 : 0} className="mt-2 h-2" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Disponible
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${globalTotals.availableCLP < 0 ? "text-destructive" : "text-green-600"}`}>
                $ {Math.round(globalTotals.availableCLP).toLocaleString("es-CL")}
              </div>
              <div className="text-sm text-muted-foreground">
                ≈ {globalTotals.availableUF.toLocaleString("es-CL", {
                minimumFractionDigits: 2
              })} UF
              </div>
            </CardContent>
          </Card>
        </div>

        {/* OPEX por Categoría - Collapsible */}
        {isAdmin && <Collapsible open={isCategorySectionOpen} onOpenChange={toggleCategorySection}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isCategorySectionOpen ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
                      <CardTitle className="text-lg">OPEX por Categoría</CardTitle>
                      <Badge variant="secondary">{masterBudgets.length} categorías</Badge>
                    </div>
                    {ufValue > 0 && <span className="text-sm text-muted-foreground">
                        Valor UF: $ {ufValue.toLocaleString("es-CL")}
                      </span>}
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  <MasterBudgetTable data={masterBudgets.map(m => {
                const consumed = consumptions.filter(c => c.category_id === m.category_id).reduce((sum, c) => sum + Math.abs(c.consumed_clp), 0);
                return {
                  id: m.id,
                  category_id: m.category_id,
                  category_name: m.category_name || "Sin categoría",
                  amount_clp: Math.abs(m.amount_clp || 0),
                  amount_uf: Math.abs(m.amount_uf || 0),
                  months: [Math.abs(m.month_01_clp || 0), Math.abs(m.month_02_clp || 0), Math.abs(m.month_03_clp || 0), Math.abs(m.month_04_clp || 0), Math.abs(m.month_05_clp || 0), Math.abs(m.month_06_clp || 0), Math.abs(m.month_07_clp || 0), Math.abs(m.month_08_clp || 0), Math.abs(m.month_09_clp || 0), Math.abs(m.month_10_clp || 0), Math.abs(m.month_11_clp || 0), Math.abs(m.month_12_clp || 0)],
                  consumed_clp: consumed,
                  consumed_uf: ufValue > 0 ? consumed / ufValue : 0
                };
              })} ufValue={ufValue} />
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Consumo OPEX por Local</CardTitle>

            {/* Chart Filters */}
            <div className="flex flex-wrap gap-3 items-center mt-4 p-3 bg-muted/30 rounded-lg">
              <Select value={companyFilter} onValueChange={setCompanyFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Empresa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas las empresas</SelectItem>
                  {companies.map(company => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={contractFilter} onValueChange={setContractFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Local" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los locales</SelectItem>
                  {contracts
                    .filter(c => companyFilter === "todos" || c.company_id === companyFilter)
                    .map(c => (
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
                  {categories.map(cat => (
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
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                No hay consumo OPEX registrado para los filtros seleccionados.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Pie Chart */}
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData}
                        dataKey="total_consumed"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={150}
                        innerRadius={60}
                        paddingAngle={1}
                        onClick={(data) => {
                          if (data && data.contract_id) {
                            handleViewLocal(data.contract_id);
                          }
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        {chartData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                            stroke="hsl(var(--background))"
                            strokeWidth={2}
                          />
                        ))}
                      </Pie>
                      <Tooltip 
                        content={({ active, payload }) => {
                          if (active && payload && payload.length > 0) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
                                <p className="font-semibold text-foreground mb-2">{data.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  Consumido: <span className="font-medium text-foreground">{data.total_consumed.toLocaleString("es-CL", { minimumFractionDigits: 2 })} UF</span>
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  % del presupuesto: <span className="font-medium text-foreground">{data.percent_consumed.toFixed(1)}%</span>
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  % del total OPEX: <span className="font-medium text-foreground">{data.percent_of_total.toFixed(1)}%</span>
                                </p>
                                {data.categories && data.categories.length > 0 && (
                                  <div className="mt-2 pt-2 border-t border-border">
                                    <p className="text-xs font-medium text-muted-foreground mb-1">Por categoría:</p>
                                    {data.categories.slice(0, 5).map((cat: any) => (
                                      <div key={cat.id} className="flex items-center gap-2 text-xs">
                                        <div 
                                          className="w-2 h-2 rounded-full" 
                                          style={{ backgroundColor: getCategoryColor(cat.name) }}
                                        />
                                        <span>{cat.name}: {cat.consumed.toLocaleString("es-CL", { minimumFractionDigits: 1 })} UF ({cat.percent.toFixed(0)}%)</span>
                                      </div>
                                    ))}
                                    {data.categories.length > 5 && (
                                      <span className="text-xs text-muted-foreground">+{data.categories.length - 5} más</span>
                                    )}
                                  </div>
                                )}
                                <p className="text-xs text-muted-foreground mt-2 italic">Click para opciones</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Legend & Details */}
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    {chartData.length} locales con consumo
                  </p>
                  {chartData.map((item, index) => (
                    <Popover key={item.contract_id}>
                      <PopoverTrigger asChild>
                        <div 
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                        >
                          <div 
                            className="w-4 h-4 rounded-full flex-shrink-0" 
                            style={{ backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{item.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.total_consumed.toLocaleString("es-CL", { minimumFractionDigits: 1 })} UF 
                              ({item.percent_of_total.toFixed(1)}% del total)
                            </p>
                          </div>
                          <Badge variant={item.percent_consumed > 80 ? "destructive" : item.percent_consumed > 50 ? "secondary" : "outline"}>
                            {item.percent_consumed.toFixed(0)}%
                          </Badge>
                        </div>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 p-2" align="end">
                        <div className="space-y-1">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="w-full justify-start"
                            onClick={() => handleViewLocal(item.contract_id)}
                          >
                            Ver local
                          </Button>
                          {item.categories.length > 0 && (
                            <>
                              <div className="py-1 px-2 text-xs font-medium text-muted-foreground">
                                Ver categoría en otros locales:
                              </div>
                              {item.categories.slice(0, 4).map(cat => (
                                <Button 
                                  key={cat.id}
                                  variant="ghost" 
                                  size="sm" 
                                  className="w-full justify-start text-xs"
                                  onClick={() => handleViewCategory(cat.id)}
                                >
                                  <div 
                                    className="w-2 h-2 rounded-full mr-2" 
                                    style={{ backgroundColor: getCategoryColor(cat.name) }}
                                  />
                                  {cat.name}
                                </Button>
                              ))}
                            </>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* OPEX por Local Section - Collapsible */}
        <Collapsible open={isLocalSectionOpen} onOpenChange={toggleLocalSection}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                <div className="flex items-center gap-3">
                  {isLocalSectionOpen ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
                  <CardTitle className="text-lg">OPEX por Local</CardTitle>
                  <Badge variant="secondary">{contractSummaries.length} locales</Badge>
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-4">
                {/* Filters */}
                <div className="flex flex-wrap gap-3 items-center p-4 bg-muted/30 rounded-lg">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Buscar por local..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
                  </div>

                  <Select value={companyFilter} onValueChange={setCompanyFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Empresa" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todas las empresas</SelectItem>
                      {companies.map(company => <SelectItem key={company.id} value={company.id}>
                          {company.name}
                        </SelectItem>)}
                    </SelectContent>
                  </Select>

                  <Select value={contractFilter} onValueChange={setContractFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Local" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos los locales</SelectItem>
                      {contracts.filter(c => companyFilter === "todos" || c.company_id === companyFilter).map(c => <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>)}
                    </SelectContent>
                  </Select>

                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todas las categorías</SelectItem>
                      {categories.map(cat => <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>)}
                    </SelectContent>
                  </Select>

                  {hasActiveFilters && <Button variant="ghost" size="sm" onClick={clearFilters}>
                      <X className="h-4 w-4 mr-1" />
                      Limpiar
                    </Button>}
                </div>

                {/* Contract OPEX Details */}
                {loading ? <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div> : contractSummaries.length === 0 ? <div className="py-12 text-center text-muted-foreground">
                    No se encontraron datos OPEX para los filtros seleccionados
                  </div> : <div className="space-y-3">
                    {contractSummaries.map(summary => {
                  const isExpanded = expandedContracts.has(summary.contract_id);
                  const usagePercent = summary.total_budget > 0 ? summary.total_consumed / summary.total_budget * 100 : 0;
                  return <Collapsible key={summary.contract_id} open={isExpanded} onOpenChange={() => toggleContract(summary.contract_id)}>
                          <Card className="border-l-4" style={{
                      borderLeftColor: getCompanyColor(summary.company_id)
                    }}>
                            <CollapsibleTrigger asChild>
                              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    {isExpanded ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2">
                                        <CardTitle className="text-base">{summary.contract_name}</CardTitle>
                                        <Badge variant="outline" style={{
                                    backgroundColor: getCompanyColor(summary.company_id) + "20",
                                    borderColor: getCompanyColor(summary.company_id),
                                    color: getCompanyColor(summary.company_id)
                                  }}>
                                          {summary.company_name}
                                        </Badge>
                                      </div>
                                      <div className="flex items-center gap-4 mt-1">
                                        <span className="text-sm text-muted-foreground">
                                          Presupuesto: {Math.abs(summary.total_budget).toLocaleString("es-CL", {
                                      minimumFractionDigits: 2
                                    })} UF
                                        </span>
                                        <span className="text-sm text-orange-600">
                                          Consumido: {Math.abs(summary.total_consumed).toLocaleString("es-CL", {
                                      minimumFractionDigits: 2
                                    })} UF
                                        </span>
                                        <span className={`text-sm ${summary.total_available < 0 ? "text-destructive" : "text-green-600"}`}>
                                          Disponible: {Math.abs(summary.total_available).toLocaleString("es-CL", {
                                      minimumFractionDigits: 2
                                    })} UF
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <div className="w-32">
                                      <Progress value={Math.min(usagePercent, 100)} className="h-2" />
                                      <span className="text-xs text-muted-foreground">{usagePercent.toFixed(0)}% usado</span>
                                    </div>
                                    <Button variant="ghost" size="sm" onClick={e => {
                                e.stopPropagation();
                                navigateToContractFromOpex(summary.contract_id);
                              }}>
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
                                      <TableHead className="text-right">Presupuesto Maestro</TableHead>
                                      <TableHead className="text-right">Adicional Local</TableHead>
                                      <TableHead className="text-right">Total Presupuesto</TableHead>
                                      <TableHead className="text-right">Consumido</TableHead>
                                      <TableHead className="text-right">Disponible</TableHead>
                                      <TableHead className="w-32">Uso</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {summary.categories.map(cat => {
                                const totalBudget = cat.master_budget + cat.additional_budget;
                                const catUsage = totalBudget > 0 ? cat.consumed / totalBudget * 100 : 0;
                                return <TableRow key={cat.category_id}>
                                          <TableCell className="font-medium">{cat.category_name}</TableCell>
                                          <TableCell className="text-right">
                                            {Math.abs(cat.master_budget).toLocaleString("es-CL", {
                                      minimumFractionDigits: 2
                                    })} UF
                                          </TableCell>
                                          <TableCell className="text-right">
                                            {Math.abs(cat.additional_budget).toLocaleString("es-CL", {
                                      minimumFractionDigits: 2
                                    })} UF
                                          </TableCell>
                                          <TableCell className="text-right font-medium">
                                            {Math.abs(totalBudget).toLocaleString("es-CL", {
                                      minimumFractionDigits: 2
                                    })} UF
                                          </TableCell>
                                          <TableCell className="text-right text-orange-600">
                                            {Math.abs(cat.consumed).toLocaleString("es-CL", {
                                      minimumFractionDigits: 2
                                    })} UF
                                          </TableCell>
                                          <TableCell className={`text-right ${cat.available < 0 ? "text-destructive" : "text-green-600"}`}>
                                            {Math.abs(cat.available).toLocaleString("es-CL", {
                                      minimumFractionDigits: 2
                                    })} UF
                                          </TableCell>
                                          <TableCell>
                                            <div className="flex items-center gap-2">
                                              <Progress value={Math.min(catUsage, 100)} className="h-2 flex-1" />
                                              <span className="text-xs text-muted-foreground w-10 text-right">
                                                {catUsage.toFixed(0)}%
                                              </span>
                                            </div>
                                          </TableCell>
                                        </TableRow>;
                              })}
                                  </TableBody>
                                </Table>
                              </CardContent>
                            </CollapsibleContent>
                          </Card>
                        </Collapsible>;
                })}
                  </div>}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </main>
    </div>;
};
export default OpexDashboard;