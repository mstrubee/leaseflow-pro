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
import { useEconomicIndicators } from "@/hooks/useEconomicIndicators";
import { OpexExcelUpload } from "@/components/opex/OpexExcelUpload";
import { MasterBudgetTable } from "@/components/opex/MasterBudgetTable";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";

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

// Colors for companies in chart
const COMPANY_COLORS = [
  "#3b82f6", // blue
  "#10b981", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
];

const OpexDashboard = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading, isAdmin } = useAuth();
  const { ufValue, loading: ufLoading } = useEconomicIndicators();

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

      // Load companies
      const { data: companiesData } = await supabase
        .from("companies")
        .select("id, name")
        .order("name");
      setCompanies(companiesData || []);

      // Load contracts with company info - only active contracts (status = 'firmado')
      const { data: contractsData } = await supabase
        .from("contracts")
        .select("id, name, company_id, status, companies(name)")
        .is("deleted_at", null)
        .eq("status", "firmado")
        .order("name");
      
      const processedContracts = (contractsData || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        company_id: c.company_id,
        company_name: c.companies?.name || "Sin empresa",
      }));
      setContracts(processedContracts);

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
            consumed_clp: amountUf * (ufValue || 0),
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

      // Apply company filter
      if (companyFilter !== "todos" && contract.company_id !== companyFilter) return;

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
          company_id: contract.company_id,
          company_name: contract.company_name || "Sin empresa",
          categories: contractCategories,
          total_budget: totalBudget,
          total_consumed: totalConsumed,
          total_available: totalBudget - totalConsumed,
        });
      }
    });

    return summaries.filter((s) => s.categories.length > 0 || categoryFilter === "todos");
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
      additionalUF: totalAdditionalUF,
    };
  }, [masterBudgets, localAdditionals, consumptions, ufValue]);

  // Prepare chart data - grouped by local, colored by company
  const chartData = useMemo(() => {
    return contractSummaries
      .filter((s) => s.total_budget > 0 || s.total_consumed > 0) // Only show locals with data
      .map((summary) => ({
        name: summary.contract_name,
        presupuesto: Math.abs(summary.total_budget),
        consumido: Math.abs(summary.total_consumed),
        disponible: Math.abs(summary.total_available),
        company_id: summary.company_id,
        company_name: summary.company_name,
      }));
  }, [contractSummaries]);

  // Get unique companies in the chart for legend
  const chartCompanies = useMemo(() => {
    const uniqueCompanies = new Map<string, string>();
    chartData.forEach((d) => {
      const key = d.company_id || "sin-empresa";
      if (!uniqueCompanies.has(key)) {
        uniqueCompanies.set(key, d.company_name);
      }
    });
    return Array.from(uniqueCompanies.entries()).map(([id, name]) => ({
      id: id === "sin-empresa" ? null : id,
      name,
    }));
  }, [chartData]);

  // Get color for company
  const getCompanyColor = (companyId: string | null) => {
    if (!companyId) return "#94a3b8"; // gray for "Sin empresa"
    const index = companies.findIndex((c) => c.id === companyId);
    if (index === -1) return "#94a3b8";
    return COMPANY_COLORS[index % COMPANY_COLORS.length];
  };

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
    setCompanyFilter("todos");
  };

  const hasActiveFilters =
    searchTerm || contractFilter !== "todos" || categoryFilter !== "todos" || companyFilter !== "todos";

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
              {isAdmin && (
                <OpexExcelUpload
                  year={parseInt(yearFilter)}
                  ufValue={ufValue}
                  onSuccess={loadData}
                />
              )}
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
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Presupuesto Master
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                $ {Math.round(globalTotals.masterBudgetCLP).toLocaleString("es-CL")}
              </div>
              <div className="text-sm text-muted-foreground">
                ≈ {globalTotals.masterBudgetUF.toLocaleString("es-CL", { minimumFractionDigits: 2 })} UF
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
                $ {Math.round(globalTotals.additionalCLP).toLocaleString("es-CL")}
              </div>
              <div className="text-sm text-muted-foreground">
                ≈ {globalTotals.additionalUF.toLocaleString("es-CL", { minimumFractionDigits: 2 })} UF
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
                ≈ {globalTotals.consumedUF.toLocaleString("es-CL", { minimumFractionDigits: 2 })} UF
              </div>
              <Progress
                value={globalTotals.budgetCLP > 0 ? (globalTotals.consumedCLP / globalTotals.budgetCLP) * 100 : 0}
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
              <div className={`text-2xl font-bold ${globalTotals.availableCLP < 0 ? "text-destructive" : "text-green-600"}`}>
                $ {Math.round(globalTotals.availableCLP).toLocaleString("es-CL")}
              </div>
              <div className="text-sm text-muted-foreground">
                ≈ {globalTotals.availableUF.toLocaleString("es-CL", { minimumFractionDigits: 2 })} UF
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Master Budget by Category - New collapsible months table */}
        {isAdmin && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Presupuesto Master por Categoría</CardTitle>
              {ufValue > 0 && (
                <span className="text-sm text-muted-foreground">
                  Valor UF: $ {ufValue.toLocaleString("es-CL")}
                </span>
              )}
            </CardHeader>
            <CardContent>
              <MasterBudgetTable
                data={masterBudgets.map((m) => {
                  const consumed = consumptions
                    .filter((c) => c.category_id === m.category_id)
                    .reduce((sum, c) => sum + Math.abs(c.consumed_clp), 0);
                  
                  return {
                    id: m.id,
                    category_id: m.category_id,
                    category_name: m.category_name || "Sin categoría",
                    amount_clp: Math.abs(m.amount_clp || 0),
                    amount_uf: Math.abs(m.amount_uf || 0),
                    months: [
                      Math.abs(m.month_01_clp || 0),
                      Math.abs(m.month_02_clp || 0),
                      Math.abs(m.month_03_clp || 0),
                      Math.abs(m.month_04_clp || 0),
                      Math.abs(m.month_05_clp || 0),
                      Math.abs(m.month_06_clp || 0),
                      Math.abs(m.month_07_clp || 0),
                      Math.abs(m.month_08_clp || 0),
                      Math.abs(m.month_09_clp || 0),
                      Math.abs(m.month_10_clp || 0),
                      Math.abs(m.month_11_clp || 0),
                      Math.abs(m.month_12_clp || 0),
                    ],
                    consumed_clp: consumed,
                    consumed_uf: ufValue > 0 ? consumed / ufValue : 0,
                  };
                })}
                ufValue={ufValue}
              />
            </CardContent>
          </Card>
        )}

        {/* Bar Chart by Local */}
        {chartData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Presupuesto por Local (Contratos Vigentes)</CardTitle>
              <div className="flex flex-wrap gap-3 mt-2">
                {chartCompanies.map((company) => (
                  <div key={company.id || "sin-empresa"} className="flex items-center gap-1.5 text-xs">
                    <div
                      className="w-3 h-3 rounded"
                      style={{ backgroundColor: getCompanyColor(company.id) }}
                    />
                    <span>{company.name}</span>
                  </div>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <div style={{ height: Math.max(400, chartData.length * 45) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={chartData} 
                    layout="vertical" 
                    margin={{ left: 10, right: 30, top: 10, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                    <XAxis
                      type="number"
                      tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value.toFixed(0)}
                      className="text-xs"
                      unit=" UF"
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={180}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        `${value.toLocaleString("es-CL", { minimumFractionDigits: 2 })} UF`,
                        name === "presupuesto" ? "Presupuesto" : name === "consumido" ? "Consumido" : "Disponible",
                      ]}
                      labelFormatter={(label, payload) => {
                        if (payload && payload.length > 0) {
                          const data = payload[0].payload;
                          return `${data.name} (${data.company_name})`;
                        }
                        return label;
                      }}
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Bar dataKey="presupuesto" name="Presupuesto" radius={[0, 4, 4, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={getCompanyColor(entry.company_id)} />
                      ))}
                    </Bar>
                    <Bar dataKey="consumido" name="Consumido" fill="#f97316" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
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

              <Select value={companyFilter} onValueChange={setCompanyFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Empresa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas las empresas</SelectItem>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={contractFilter} onValueChange={setContractFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Locales" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los locales</SelectItem>
                  {contracts
                    .filter((c) => companyFilter === "todos" || c.company_id === companyFilter)
                    .map((c) => (
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
                              <div className="flex items-center gap-2">
                                <CardTitle className="text-base">{summary.contract_name}</CardTitle>
                                <Badge 
                                  variant="outline" 
                                  style={{ 
                                    backgroundColor: getCompanyColor(summary.company_id) + "20",
                                    borderColor: getCompanyColor(summary.company_id),
                                    color: getCompanyColor(summary.company_id)
                                  }}
                                >
                                  {summary.company_name}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-4 mt-1">
                                <span className="text-sm text-muted-foreground">
                                  Presupuesto: {Math.abs(summary.total_budget).toLocaleString("es-CL", { minimumFractionDigits: 2 })} UF
                                </span>
                                <span className="text-sm text-orange-600">
                                  Consumido: {Math.abs(summary.total_consumed).toLocaleString("es-CL", { minimumFractionDigits: 2 })} UF
                                </span>
                                <span className={`text-sm ${summary.total_available < 0 ? "text-destructive" : "text-green-600"}`}>
                                  Disponible: {Math.abs(summary.total_available).toLocaleString("es-CL", { minimumFractionDigits: 2 })} UF
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
