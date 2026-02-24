import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Search, DollarSign, Building2, RefreshCw } from "lucide-react";
import { BudgetModule } from "@/components/budget/BudgetModule";
import { BudgetProvider } from "@/components/budget/BudgetContext";
import { useEconomicIndicators } from "@/hooks/useEconomicIndicators";
import { formatCLP } from "@/lib/utils";

interface ContractBudget {
  contract_id: string;
  contract_name: string;
  clasificacion: string | null;
  year: number;
  amount_uf: number;
  budget_id: string;
}

interface AuthBreakdown {
  authorized: number;
  unauthorized: number;
}

export default function CapexDashboard() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { ufValue } = useEconomicIndicators();

  const [budgets, setBudgets] = useState<ContractBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear().toString());
  const [expandedContract, setExpandedContract] = useState<string | null>(null);
  const [authByContract, setAuthByContract] = useState<Record<string, AuthBreakdown>>({});

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (user) loadBudgets();
  }, [user]);

  const loadBudgets = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("contract_budgets")
        .select("id, contract_id, year, amount_uf, budget_type, contracts(name, clasificacion)")
        .eq("budget_type", "capex")
        .order("year", { ascending: false });

      if (error) throw error;

      const processed = (data || []).map((b: any) => ({
        contract_id: b.contract_id,
        contract_name: b.contracts?.name || "Sin nombre",
        clasificacion: b.contracts?.clasificacion || null,
        year: b.year,
        amount_uf: b.amount_uf,
        budget_id: b.id,
      }));
      setBudgets(processed);

      // Load budget lines for authorized/unauthorized breakdown
      const budgetIds = (data || []).map((b: any) => b.id);
      if (budgetIds.length > 0) {
        const { data: lines, error: linesError } = await supabase
          .from("budget_lines")
          .select("id, budget_id, amount_uf, status, parent_id")
          .in("budget_id", budgetIds)
          .is("deleted_at", null);

        if (!linesError && lines) {
          // Find parent IDs to exclude (avoid double-counting)
          const parentIds = new Set(lines.filter(l => l.parent_id).map(l => l.parent_id!));
          const leafLines = lines.filter(l => !parentIds.has(l.id));

          // Group by budget_id → contract_id
          const budgetToContract: Record<string, string> = {};
          (data || []).forEach((b: any) => { budgetToContract[b.id] = b.contract_id; });

          const breakdown: Record<string, AuthBreakdown> = {};
          leafLines.forEach(line => {
            const contractId = budgetToContract[line.budget_id];
            if (!contractId) return;
            if (!breakdown[contractId]) breakdown[contractId] = { authorized: 0, unauthorized: 0 };
            if (line.status === "autorizado") {
              breakdown[contractId].authorized += line.amount_uf || 0;
            } else {
              breakdown[contractId].unauthorized += line.amount_uf || 0;
            }
          });
          setAuthByContract(breakdown);
        }
      }
    } catch (error) {
      console.error("Error loading CAPEX budgets:", error);
    } finally {
      setLoading(false);
    }
  };

  const availableYears = React.useMemo(() => {
    const years = new Set<number>();
    budgets.forEach(b => years.add(b.year));
    const currentYear = new Date().getFullYear();
    years.add(currentYear);
    return Array.from(years).sort((a, b) => b - a);
  }, [budgets]);

  const filteredBudgets = React.useMemo(() => {
    return budgets.filter(b => {
      if (yearFilter !== "todos" && b.year !== parseInt(yearFilter)) return false;
      if (searchTerm && !b.contract_name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });
  }, [budgets, yearFilter, searchTerm]);

  // Group by contract
  const contractGroups = React.useMemo(() => {
    const map = new Map<string, ContractBudget[]>();
    filteredBudgets.forEach(b => {
      const existing = map.get(b.contract_id) || [];
      existing.push(b);
      map.set(b.contract_id, existing);
    });
    return Array.from(map.entries()).sort((a, b) => a[1][0].contract_name.localeCompare(b[1][0].contract_name));
  }, [filteredBudgets]);

  const totalCapexUF = filteredBudgets.reduce((sum, b) => sum + b.amount_uf, 0);

  // Totals by clasificacion
  const { totalNuevoUF, totalReemplazoUF } = React.useMemo(() => {
    let nuevo = 0, reemplazo = 0;
    // Deduplicate by contract_id to avoid counting multiple years
    const seen = new Set<string>();
    filteredBudgets.forEach(b => {
      if (seen.has(b.contract_id)) return;
      seen.add(b.contract_id);
      const breakdown = authByContract[b.contract_id];
      const effectiveUF = breakdown ? (breakdown.authorized + breakdown.unauthorized) : b.amount_uf;
      if (b.clasificacion === "nuevo") nuevo += effectiveUF;
      else if (b.clasificacion === "reemplazo") reemplazo += effectiveUF;
    });
    return { totalNuevoUF: nuevo, totalReemplazoUF: reemplazo };
  }, [filteredBudgets, authByContract]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) return null;

  const fmtUF = (v: number) => v.toLocaleString("es-CL", { maximumFractionDigits: 2 });

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1536px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Presupuesto CAPEX</h1>
            <p className="text-sm text-muted-foreground mt-1">Gestión de presupuestos CAPEX por local</p>
          </div>
        </div>

        {/* Summary Cards Row 1 */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <DollarSign className="h-8 w-8 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Total CAPEX (UF)</p>
                <p className="text-xl font-bold">{fmtUF(totalCapexUF)} UF</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <DollarSign className="h-8 w-8 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Total CAPEX (CLP)</p>
                <p className="text-xl font-bold">{formatCLP(totalCapexUF * (ufValue || 0))}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <DollarSign className="h-8 w-8 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Locales con CAPEX</p>
                <p className="text-xl font-bold">{contractGroups.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Summary Cards Row 2: Clasificacion */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Building2 className="h-8 w-8 text-chart-1" />
              <div>
                <p className="text-xs text-muted-foreground">CAPEX Nuevos</p>
                <p className="text-lg font-bold">{fmtUF(totalNuevoUF)} UF</p>
                <p className="text-xs text-muted-foreground">{formatCLP(totalNuevoUF * (ufValue || 0))}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <RefreshCw className="h-8 w-8 text-chart-2" />
              <div>
                <p className="text-xs text-muted-foreground">CAPEX Reemplazo</p>
                <p className="text-lg font-bold">{fmtUF(totalReemplazoUF)} UF</p>
                <p className="text-xs text-muted-foreground">{formatCLP(totalReemplazoUF * (ufValue || 0))}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar local..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {availableYears.map(y => (
                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Contract List with expandable CAPEX */}
        <div className="space-y-2">
          {contractGroups.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No se encontraron presupuestos CAPEX
              </CardContent>
            </Card>
          ) : (
            contractGroups.map(([contractId, contractBudgets]) => {
              const isExpanded = expandedContract === contractId;
              const contractName = contractBudgets[0].contract_name;
              const selectedYear = yearFilter !== "todos" ? parseInt(yearFilter) : contractBudgets[0].year;
              const breakdown = authByContract[contractId] || { authorized: 0, unauthorized: 0 };

              return (
                <Collapsible
                  key={contractId}
                  open={isExpanded}
                  onOpenChange={(open) => setExpandedContract(open ? contractId : null)}
                >
                  <Card>
                    <CollapsibleTrigger asChild>
                      <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <ChevronDown className={`h-5 w-5 transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`} />
                            <CardTitle className="text-base">{contractName}</CardTitle>
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            {breakdown.authorized > 0 && (
                              <span className="text-green-600 dark:text-green-400 font-medium">
                                Autorizado: {fmtUF(breakdown.authorized)} UF
                              </span>
                            )}
                            {breakdown.unauthorized > 0 && (
                              <span className="text-yellow-600 dark:text-yellow-400 font-medium">
                                No Autorizado: {fmtUF(breakdown.unauthorized)} UF
                              </span>
                            )}
                            {breakdown.authorized === 0 && breakdown.unauthorized === 0 && (
                              <span className="text-muted-foreground">0 UF</span>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="pt-0">
                        <BudgetProvider>
                          <BudgetModule
                            contractId={contractId}
                            contractName={contractName}
                            budgetType="capex"
                            title="CAPEX"
                            selectedYear={selectedYear}
                            onRefresh={loadBudgets}
                          />
                        </BudgetProvider>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
