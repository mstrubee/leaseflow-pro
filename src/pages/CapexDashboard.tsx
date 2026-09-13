import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { loadBudgetTotals } from "@/lib/budgetTotals";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Search, DollarSign, Building2, RefreshCw, FileCheck, Loader2, Presentation, Download, FileSliders, FileSpreadsheet, AlertTriangle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { BudgetModule } from "@/components/budget/BudgetModule";
import { BudgetProvider } from "@/components/budget/BudgetContext";
import { useEconomicIndicators } from "@/hooks/useEconomicIndicators";
import { formatCLP } from "@/lib/utils";
import { CompanyLogo } from "@/components/contracts/CompanyLogo";
import { Button } from "@/components/ui/button";
import { generateCapexPPT } from "@/components/budget/CapexPPTExport";
import { generateSingleContractPPT } from "@/components/budget/CapexSinglePPTExport";
import { CapexTemplateManager } from "@/components/budget/CapexTemplateManager";
import { exportCapexToExcel } from "@/components/budget/CapexExcelExport";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";

interface ContractBudget {
  contract_id: string;
  contract_name: string;
  clasificacion: string | null;
  capex_avance_status: string | null;
  year: number;
  amount_uf: number;
  budget_id: string;
  superficie: number;
  company_names: string[];
}

interface AuthBreakdown {
  authorized: number;
  unauthorized: number;
  grand: number;
}

type AuthByBudget = Record<string, AuthBreakdown>;

const getEffectiveBudgetBreakdown = (budget: ContractBudget, breakdown?: AuthBreakdown): AuthBreakdown => {
  const cardAmount = budget.amount_uf || 0;
  const linesTotal = breakdown?.grand || 0;
  // Use the card amount if it was explicitly set; otherwise fall back to
  // the grand total calculated from the detail lines.
  const total = cardAmount > 0 ? cardAmount : linesTotal;
  return { authorized: 0, unauthorized: total, grand: total };
};

const getEffectiveBudgetTotal = (budget: ContractBudget, breakdown?: AuthBreakdown): number => {
  const eff = getEffectiveBudgetBreakdown(budget, breakdown);
  return eff.authorized + eff.unauthorized;
};

// Mismo agrupamiento "resumido" que usan las cards de empresa (Autoplanet /
// Agroplanet / Otros -- Grupo Planet y Otra quedan juntos en "Otros"). Se usa
// tanto para el filtro de Empresa como para las cards, así clickear una card
// filtra exactamente lo que esa card está mostrando.
type CompanyBucket = "Autoplanet" | "Agroplanet" | "Otros";
const getCompanyBucket = (names: string[]): CompanyBucket => {
  const hasAgroplanet = names.some((n) => n.toLowerCase().includes("agroplanet"));
  const hasAutoplanet = names.some((n) => n.toLowerCase().includes("autoplanet"));
  if (hasAutoplanet && !hasAgroplanet) return "Autoplanet";
  if (hasAgroplanet) return "Agroplanet";
  return "Otros";
};

const toggleArrayValue = (arr: string[], value: string): string[] =>
  arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];



export default function CapexDashboard() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { ufValue } = useEconomicIndicators();

  const [budgets, setBudgets] = useState<ContractBudget[]>([]);
  const [authByBudget, setAuthByBudget] = useState<AuthByBudget>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear().toString());
  // Filtros multi-selección: array vacío = "todas".
  const [companyFilter, setCompanyFilter] = useState<string[]>([]);
  const [clasificacionFilter, setClasificacionFilter] = useState<string[]>([]);
  const [avanceStatusFilter, setAvanceStatusFilter] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<"nombre" | "empresa" | "clasificacion">("nombre");
  const [expandedContract, setExpandedContract] = useState<string | null>(null);
  
  const [templateOpen, setTemplateOpen] = useState(false);
  const [downloadingPPT, setDownloadingPPT] = useState<string | null>(null);
  const [exportingExcel, setExportingExcel] = useState(false);
  // Aísla los contratos con líneas "No Autorizado" (monto > 0) para ir
  // aprobándolas de forma más ágil, expandiendo uno a uno.
  const [onlyUnauthorized, setOnlyUnauthorized] = useState(false);
  // "Tipos de CAPEX" administrables desde Admin > Estados y Categorías --
  // el "name" de cada uno es el mismo texto que se guarda en
  // contracts.clasificacion.
  const [clasificacionTypes, setClasificacionTypes] = useState<Array<{ id: string; name: string; color: string }>>([]);
  // "Estado Avance CAPEX" (En Curso/Terminado/Programado), administrable
  // desde Admin > Estados y Categorías -- el "name" es el mismo texto que
  // se guarda en contracts.capex_avance_status.
  const [avanceStatusTypes, setAvanceStatusTypes] = useState<Array<{ id: string; name: string; color: string }>>([]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("capex_clasificacion_types")
        .select("id, name, color")
        .eq("is_active", true)
        .order("display_order");
      setClasificacionTypes(data || []);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("capex_avance_status_types")
        .select("id, name, color")
        .eq("is_active", true)
        .order("display_order");
      setAvanceStatusTypes(data || []);
    })();
  }, []);

  useEffect(() => {
    if (user && ufValue > 0) loadBudgets();
  }, [user, ufValue]);

  const loadBudgets = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("contract_budgets")
        .select("id, contract_id, year, amount_uf, budget_type, contracts!inner(name, clasificacion, capex_avance_status, superficie_edificada_local, contract_companies(companies(name)))")
        .eq("budget_type", "capex")
        .is("contracts.deleted_at", null)
        // Nunca se muestra un "Rechazada" en Comité GP, sea cual sea el
        // estado del contrato.
        .or("comite_gp_status.is.null,comite_gp_status.neq.Rechazada", { foreignTable: "contracts" })
        // Los contratos "En Negociación" además solo se muestran si el
        // Comité GP los aceptó ("Aceptada") -- otros estados de comité
        // (Buscar, En Revisión, etc.) quedan afuera. El resto de los estados
        // de contrato (ej. Firmado) se muestra igual, sin depender de esto.
        .or("status.neq.en_negociacion,comite_gp_status.eq.Aceptada", { foreignTable: "contracts" })
        .order("year", { ascending: false });

      if (error) throw error;

      const processed = (data || [])
        .map((b: any) => ({
        contract_id: b.contract_id,
        contract_name: b.contracts?.name || "Sin nombre",
        clasificacion: b.contracts?.clasificacion || null,
        capex_avance_status: b.contracts?.capex_avance_status || null,
        year: b.year,
        amount_uf: b.amount_uf,
        budget_id: b.id,
        superficie: b.contracts?.superficie_edificada_local || 0,
        company_names: (b.contracts?.contract_companies || []).map((cc: any) => cc.companies?.name).filter(Boolean) as string[],
      }));
      setBudgets(processed);

      // Load per-budget breakdown (authorized / unauthorized / grand) from detail lines
      const budgetIds = processed.map((b) => b.budget_id);
      const totals = await loadBudgetTotals(budgetIds, ufValue);
      const breakdown: AuthByBudget = {};
      totals.forEach((t, budgetId) => {
        breakdown[budgetId] = { authorized: t.authorized, unauthorized: t.unauthorized, grand: t.grand };
      });
      setAuthByBudget(breakdown);
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
      if (companyFilter.length > 0 && !companyFilter.includes(getCompanyBucket(b.company_names))) return false;
      if (clasificacionFilter.length > 0 && !clasificacionFilter.includes(b.clasificacion || "")) return false;
      if (avanceStatusFilter.length > 0 && !avanceStatusFilter.includes(b.capex_avance_status || "")) return false;
      return true;
    });
  }, [budgets, yearFilter, searchTerm, companyFilter, clasificacionFilter, avanceStatusFilter]);

  // Group by contract. A CAPEX budget must be visible even when it has no detail lines yet.
  const contractGroups = React.useMemo(() => {
    const map = new Map<string, ContractBudget[]>();
    filteredBudgets.forEach(b => {
      const existing = map.get(b.contract_id) || [];
      existing.push(b);
      map.set(b.contract_id, existing);
    });
    return Array.from(map.entries())
      .sort((a, b) => {
        const aB = a[1][0], bB = b[1][0];
        if (sortBy === "empresa") {
          const aComp = aB.company_names[0] || "";
          const bComp = bB.company_names[0] || "";
          return aComp.localeCompare(bComp) || aB.contract_name.localeCompare(bB.contract_name);
        }
        if (sortBy === "clasificacion") {
          const aC = aB.clasificacion || "zzz";
          const bC = bB.clasificacion || "zzz";
          return aC.localeCompare(bC) || aB.contract_name.localeCompare(bB.contract_name);
        }
        return aB.contract_name.localeCompare(bB.contract_name);
      });
  }, [filteredBudgets, sortBy]);

  // Total CAPEX por contrato, usando el breakdown efectivo (card amount o líneas)
  const authByContract = React.useMemo(() => {
    const result: Record<string, AuthBreakdown> = {};
    filteredBudgets.forEach(b => {
      if (!result[b.contract_id]) result[b.contract_id] = { authorized: 0, unauthorized: 0, grand: 0 };
      const eff = getEffectiveBudgetBreakdown(b, authByBudget[b.budget_id]);
      result[b.contract_id].authorized += eff.authorized;
      result[b.contract_id].unauthorized += eff.unauthorized;
      result[b.contract_id].grand += eff.grand;
    });
    return result;
  }, [filteredBudgets, authByBudget]);

  // Group contractGroups by company
  const companyGroups = React.useMemo(() => {
    const groups = new Map<string, typeof contractGroups>();
    contractGroups.forEach(entry => {
      const [, cBudgets] = entry;
      const names = cBudgets[0].company_names;
      const hasAgroplanet = names.some(n => n.toLowerCase().includes("agroplanet"));
      const hasAutoplanet = names.some(n => n.toLowerCase().includes("autoplanet"));
      const hasGrupoPlanet = names.some(n => /grupo\s*planet/.test(n.toLowerCase()));
      // Multi-company contracts go to Agroplanet
      const companyKey = (hasAgroplanet && hasAutoplanet) ? "Agroplanet"
        : hasAutoplanet ? "Autoplanet"
        : hasAgroplanet ? "Agroplanet"
        : hasGrupoPlanet ? "Grupo Planet"
        : "Otra";

      // Todos los contratos con registro CAPEX se muestran, sin filtrar por monto

      const existing = groups.get(companyKey) || [];
      existing.push(entry);
      groups.set(companyKey, existing);
    });
    const order = ["Autoplanet", "Agroplanet", "Grupo Planet", "Otra"];
    return order
      .filter(k => groups.has(k))
      .map(k => ({ company: k, contracts: groups.get(k)! }));
  }, [contractGroups]);

  // Lista plana de contratos exactamente como aparecen en el dashboard
  const listedContracts = React.useMemo(() => {
    return companyGroups.flatMap(({ contracts }) => contracts);
  }, [companyGroups]);

  // Cuando el filtro "No Autorizados" está activo, solo se muestran los
  // contratos con líneas No Autorizado por un monto mayor a 0 (usa el mismo
  // desglose que las tarjetas de resumen).
  const displayedCompanyGroups = React.useMemo(() => {
    if (!onlyUnauthorized) return companyGroups;
    return companyGroups
      .map(({ company, contracts }) => ({
        company,
        contracts: contracts.filter(([contractId]) => (authByContract[contractId]?.unauthorized || 0) > 0),
      }))
      .filter(({ contracts }) => contracts.length > 0);
  }, [companyGroups, onlyUnauthorized, authByContract]);


  // Per-company clasificacion stats -- dinámico según los "Tipos de CAPEX"
  // administrados en Admin (ya no son 3 fijos).
  const companyClasificacionStats = React.useMemo(() => {
    const stats: Record<string, Record<string, { uf: number; count: number }>> = {};
    companyGroups.forEach(({ company, contracts }) => {
      const s: Record<string, { uf: number; count: number }> = {};
      const seen = new Set<string>();
      contracts.forEach(([contractId, cBudgets]) => {
        if (seen.has(contractId)) return;
        seen.add(contractId);
        const bd = authByContract[contractId];
        const uf = bd ? bd.authorized + bd.unauthorized : 0;
        const cl = cBudgets[0].clasificacion;
        if (!cl) return;
        if (!s[cl]) s[cl] = { uf: 0, count: 0 };
        s[cl].uf += uf;
        s[cl].count++;
      });
      stats[company] = s;
    });
    return stats;
  }, [companyGroups, authByContract]);

  const totalCapexUF = React.useMemo(() => {
    let total = 0;
    contractGroups.forEach(([contractId]) => {
      const bd = authByContract[contractId];
      if (bd) total += bd.authorized + bd.unauthorized;
    });
    return total;
  }, [contractGroups, authByContract]);

  const contractsWithCapex = listedContracts;

  // Total CAPEX por empresa (Autoplanet / Agroplanet / Otros) -- respeta los
  // filtros activos, igual que totalCapexUF.
  const companyBucketTotals = React.useMemo(() => {
    const buckets: Record<"Autoplanet" | "Agroplanet" | "Otros", { uf: number; count: number }> = {
      Autoplanet: { uf: 0, count: 0 },
      Agroplanet: { uf: 0, count: 0 },
      Otros: { uf: 0, count: 0 },
    };
    companyGroups.forEach(({ company, contracts }) => {
      const bucket = company === "Autoplanet" ? "Autoplanet" : company === "Agroplanet" ? "Agroplanet" : "Otros";
      contracts.forEach(([contractId]) => {
        const bd = authByContract[contractId];
        if (bd) buckets[bucket].uf += bd.authorized + bd.unauthorized;
        buckets[bucket].count++;
      });
    });
    return buckets;
  }, [companyGroups, authByContract]);

  // Totales por "Tipo de CAPEX" -- dinámico según los tipos administrados en
  // Admin > Estados y Categorías > Tipos de CAPEX (ya no son 3 fijos).
  const clasificacionTotals = React.useMemo(() => {
    const result: Record<string, { uf: number; count: number }> = {};
    contractsWithCapex.forEach(([contractId, cBudgets]) => {
      const bd = authByContract[contractId];
      const effectiveUF = bd ? (bd.authorized + bd.unauthorized) : cBudgets.reduce((s, b) => s + (b.amount_uf || 0), 0);
      const cl = cBudgets[0].clasificacion;
      if (!cl) return;
      if (!result[cl]) result[cl] = { uf: 0, count: 0 };
      result[cl].uf += effectiveUF;
      result[cl].count++;
    });
    return result;
  }, [contractsWithCapex, authByContract]);

  const handleExportPPT = async () => {
    try {
      toast.info("Generando presentación...");

      const pptCompanyGroups = companyGroups.map(({ company, contracts }) => {
        const stats = companyClasificacionStats[company] || {};
        const byType = clasificacionTypes
          .filter((t) => stats[t.name])
          .map((t) => ({ name: t.name, color: t.color, uf: stats[t.name].uf, count: stats[t.name].count }));
        return {
          company,
          contracts: contracts.map(([contractId, cBudgets]) => {
            const bd = authByContract[contractId] || { authorized: 0, unauthorized: 0 };
            const totalUf = bd.authorized + bd.unauthorized;
            const superficie = cBudgets[0].superficie || 0;
            return {
              contract_id: contractId,
              contract_name: cBudgets[0].contract_name,
              clasificacion: cBudgets[0].clasificacion,
              superficie,
              company_names: cBudgets[0].company_names,
              authorized: bd.authorized,
              unauthorized: bd.unauthorized,
              total_uf: totalUf,
              total_clp: totalUf * (ufValue || 0),
              uf_m2: superficie > 0 ? totalUf / superficie : 0,
            };
          }),
          totals: { byType, total: byType.reduce((s, t) => s + t.uf, 0) },
        };
      });

      const clasifTotalsArr = clasificacionTypes
        .filter((t) => clasificacionTotals[t.name])
        .map((t) => ({ name: t.name, color: t.color, uf: clasificacionTotals[t.name].uf, count: clasificacionTotals[t.name].count }));

      await generateCapexPPT({
        year: yearFilter !== "todos" ? yearFilter : new Date().getFullYear().toString(),
        ufValue: ufValue || 0,
        totalCapexUF,
        clasificacionTotals: clasifTotalsArr,
        totalLocales: contractsWithCapex.length,
        companyGroups: pptCompanyGroups,
      });
      toast.success("Presentación descargada");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        toast.info("Descarga cancelada");
        return;
      }
      console.error("PPT export error:", err);
      toast.error("Error al generar la presentación");
    }
  };

  const handleSinglePPT = async (contractId: string, contractName: string, companyNames: string[]) => {
    setDownloadingPPT(contractId);
    try {
      toast.info("Generando PPT individual...");
      await generateSingleContractPPT({ contractId, contractName, companyNames });
      toast.success("PPT descargado");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        toast.info("Descarga cancelada");
        return;
      }
      console.error("Single PPT error:", err);
      toast.error("Error al generar PPT individual");
    } finally {
      setDownloadingPPT(null);
    }
  };

  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      toast.info("Generando Excel...");
      const payload = listedContracts.map(([contractId, cBudgets]) => {
        const legacy = cBudgets.reduce((sum, b) => sum + (b.amount_uf || 0), 0);
        return {
          contract_id: contractId,
          contract_name: cBudgets[0].contract_name,
          clasificacion: cBudgets[0].clasificacion,
          company_names: cBudgets[0].company_names,
          superficie: cBudgets[0].superficie || 0,
          year: cBudgets[0].year,
          budget_ids: cBudgets.map((b) => b.budget_id),
          legacy_amount_uf: legacy,
        };
      });
      const label = yearFilter !== "todos" ? yearFilter : "todos";
      const result = await exportCapexToExcel(payload, ufValue || 0, label);
      if (result.method === "cancelled") {
        toast.info("Descarga cancelada");
      } else if (result.method === "file-picker") {
        toast.success(`Excel guardado (${result.filename})`);
      } else {
        toast.success(`Excel enviado a descargas (${result.filename})`);
      }
    } catch (err) {
      console.error("Excel export error:", err);
      toast.error("Error al generar Excel");
    } finally {
      setExportingExcel(false);
    }
  };



  const handleClasificacionChange = async (contractId: string, value: string) => {
    const { error } = await supabase
      .from("contracts")
      .update({ clasificacion: value })
      .eq("id", contractId);
    if (error) {
      toast.error("Error al actualizar clasificación");
      return;
    }
    setBudgets(prev => prev.map(b => b.contract_id === contractId ? { ...b, clasificacion: value } : b));
    toast.success("Clasificación actualizada");
  };

  const handleAvanceStatusChange = async (contractId: string, value: string) => {
    const { error } = await supabase
      .from("contracts")
      .update({ capex_avance_status: value } as never)
      .eq("id", contractId);
    if (error) {
      toast.error("Error al actualizar el estado de avance");
      return;
    }
    setBudgets(prev => prev.map(b => b.contract_id === contractId ? { ...b, capex_avance_status: value } : b));
    toast.success("Estado de avance actualizado");
  };

  const BADGE_COLOR_MAP: Record<string, string> = {
    green: 'bg-green-100 text-green-800 border-green-300 hover:bg-green-200',
    red: 'bg-red-100 text-red-800 border-red-300 hover:bg-red-200',
    blue: 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200',
    yellow: 'bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-200',
    purple: 'bg-purple-100 text-purple-800 border-purple-300 hover:bg-purple-200',
    orange: 'bg-orange-100 text-orange-800 border-orange-300 hover:bg-orange-200',
    gray: 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200',
  };

  const getClasificacionColor = (name: string | null) => {
    if (!name) return '';
    const type = clasificacionTypes.find(t => t.name === name);
    return BADGE_COLOR_MAP[type?.color || 'gray'] || '';
  };

  const getAvanceStatusColor = (name: string | null) => {
    if (!name) return '';
    const type = avanceStatusTypes.find(t => t.name === name);
    return BADGE_COLOR_MAP[type?.color || 'gray'] || '';
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user || ufValue <= 0) return (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );

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
          <div className="flex gap-2">
            <Button
              variant={onlyUnauthorized ? "default" : "outline"}
              size="sm"
              onClick={() => setOnlyUnauthorized(v => !v)}
              className="gap-2"
              title="Mostrar solo contratos con líneas No Autorizado por un monto mayor a 0"
            >
              <AlertTriangle className="h-4 w-4" />
              Solo No Autorizados
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={exportingExcel} className="gap-2">
              {exportingExcel ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              Exportar Excel
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPPT} className="gap-2">
              <Presentation className="h-4 w-4" />
              PPT General
            </Button>
            <Button variant="outline" size="sm" onClick={() => setTemplateOpen(true)} className="gap-2">
              <FileSliders className="h-4 w-4" />
              Template PPT Single
            </Button>
          </div>
        </div>

        {/* Summary Cards Row 1: Total + por empresa (reflejan los filtros activos).
            Todas son clickeables y actúan como filtro acumulativo: clickear una
            la agrega/quita del filtro correspondiente, sin borrar las demás. */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card
            role="button"
            tabIndex={0}
            onClick={() => { setCompanyFilter([]); setClasificacionFilter([]); setAvanceStatusFilter([]); }}
            onKeyDown={(e) => { if (e.key === "Enter") { setCompanyFilter([]); setClasificacionFilter([]); setAvanceStatusFilter([]); } }}
            title="Ver todo (limpia los filtros de empresa, tipo y estado de avance)"
            className="cursor-pointer transition-colors hover:bg-muted/50"
          >
            <CardContent className="p-4 flex items-center gap-3">
              <DollarSign className="h-8 w-8 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Total CAPEX ({contractsWithCapex.length} {contractsWithCapex.length === 1 ? "local" : "locales"})</p>
                <p className="text-xl font-bold">{formatCLP(totalCapexUF * (ufValue || 0))}</p>
                <p className="text-xs text-muted-foreground">({fmtUF(totalCapexUF)} UF)</p>
              </div>
            </CardContent>
          </Card>
          {(["Autoplanet", "Agroplanet", "Otros"] as const).map((bucket, i) => {
            const active = companyFilter.includes(bucket);
            const accentClass = i === 0 ? "text-chart-1" : i === 1 ? "text-chart-2" : "text-chart-3";
            return (
              <Card
                key={bucket}
                role="button"
                tabIndex={0}
                onClick={() => setCompanyFilter((prev) => toggleArrayValue(prev, bucket))}
                onKeyDown={(e) => { if (e.key === "Enter") setCompanyFilter((prev) => toggleArrayValue(prev, bucket)); }}
                title={`Filtrar por ${bucket}`}
                className={`cursor-pointer transition-colors hover:bg-muted/50 ${active ? "ring-2 ring-primary" : ""}`}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <Building2 className={`h-8 w-8 ${accentClass}`} />
                  <div>
                    <p className="text-xs text-muted-foreground">CAPEX {bucket} ({companyBucketTotals[bucket].count})</p>
                    <p className="text-lg font-bold">{formatCLP(companyBucketTotals[bucket].uf * (ufValue || 0))}</p>
                    <p className="text-xs text-muted-foreground">({fmtUF(companyBucketTotals[bucket].uf)} UF)</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Summary Cards Row 2: por Tipo de CAPEX -- dinámico según Admin > Tipos de CAPEX */}
        {Object.keys(clasificacionTotals).length > 0 && (
          <div className="grid gap-4 md:grid-cols-4">
            {clasificacionTypes
              .filter((t) => clasificacionTotals[t.name])
              .map((t) => {
                const totals = clasificacionTotals[t.name];
                const active = clasificacionFilter.includes(t.name);
                return (
                  <Card
                    key={t.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setClasificacionFilter((prev) => toggleArrayValue(prev, t.name))}
                    onKeyDown={(e) => { if (e.key === "Enter") setClasificacionFilter((prev) => toggleArrayValue(prev, t.name)); }}
                    title={`Filtrar por ${t.name}`}
                    className={`cursor-pointer transition-colors hover:bg-muted/50 ${active ? "ring-2 ring-primary" : ""}`}
                  >
                    <CardContent className="p-4 flex items-center gap-3">
                      <span className={`w-3 h-3 rounded-full bg-${t.color}-500 shrink-0`} />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground truncate">CAPEX {t.name} ({totals.count} {totals.count === 1 ? "local" : "locales"})</p>
                        <p className="text-lg font-bold">{formatCLP(totals.uf * (ufValue || 0))}</p>
                        <p className="text-xs text-muted-foreground">({fmtUF(totals.uf)} UF)</p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        )}

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
          <MultiSelectFilter
            className="w-[160px]"
            placeholder="Empresa"
            value={companyFilter}
            onChange={setCompanyFilter}
            options={[
              { value: "Autoplanet", label: "Autoplanet" },
              { value: "Agroplanet", label: "Agroplanet" },
              { value: "Otros", label: "Otros" },
            ]}
          />
          <MultiSelectFilter
            className="w-[190px]"
            placeholder="Clasificación"
            value={clasificacionFilter}
            onChange={setClasificacionFilter}
            options={clasificacionTypes.map((t) => ({
              value: t.name,
              label: t.name,
              colorDotClassName: `bg-${t.color}-500`,
            }))}
          />
          <MultiSelectFilter
            className="w-[190px]"
            placeholder="Estado Avance"
            value={avanceStatusFilter}
            onChange={setAvanceStatusFilter}
            options={avanceStatusTypes.map((t) => ({
              value: t.name,
              label: t.name,
              colorDotClassName: `bg-${t.color}-500`,
            }))}
          />
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Ordenar por" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nombre">Ordenar: Nombre</SelectItem>
              <SelectItem value="empresa">Ordenar: Empresa</SelectItem>
              <SelectItem value="clasificacion">Ordenar: Clasificación</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Contract List grouped by company */}
        <div className="space-y-8">
          {contractGroups.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No se encontraron presupuestos CAPEX
              </CardContent>
            </Card>
          ) : displayedCompanyGroups.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No hay contratos con líneas No Autorizado por un monto mayor a 0
              </CardContent>
            </Card>
          ) : (
            displayedCompanyGroups.map(({ company, contracts }) => {
              const stats = companyClasificacionStats[company];
              const currentUF = ufValue || 0;
              return (
                <div key={company} className="space-y-3">
                  {/* Company header */}
                  <div className="flex items-center gap-2">
                    <CompanyLogo companyName={company} size="md" />
                    <h2 className="text-lg font-semibold text-foreground">{company}</h2>
                    <Badge variant="secondary" className="text-xs">{contracts.length} {contracts.length === 1 ? "local" : "locales"}</Badge>
                  </div>

                  {/* Per-company clasificacion cards -- dinámico según Tipos de CAPEX.
                      Clickeables: mismo filtro de tipo que las cards de arriba (acumulativo). */}
                  <div className="grid gap-3 md:grid-cols-3">
                    {clasificacionTypes
                      .filter((t) => stats?.[t.name])
                      .map((t) => {
                        const s = stats[t.name];
                        const active = clasificacionFilter.includes(t.name);
                        return (
                          <Card
                            key={t.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => setClasificacionFilter((prev) => toggleArrayValue(prev, t.name))}
                            onKeyDown={(e) => { if (e.key === "Enter") setClasificacionFilter((prev) => toggleArrayValue(prev, t.name)); }}
                            title={`Filtrar por ${t.name}`}
                            className={`cursor-pointer transition-colors hover:bg-muted/50 ${active ? "ring-2 ring-primary" : ""}`}
                          >
                            <CardContent className="p-3 flex items-center gap-3">
                              <span className={`w-2.5 h-2.5 rounded-full bg-${t.color}-500 shrink-0`} />
                              <div className="min-w-0">
                                <p className="text-xs text-muted-foreground truncate">{t.name} ({s.count})</p>
                                <p className="text-sm font-bold">{formatCLP(s.uf * currentUF)}</p>
                                <p className="text-xs text-muted-foreground">({fmtUF(s.uf)} UF)</p>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                  </div>

                  {/* Contracts list */}
                  <div className="space-y-2">
                    {contracts.map(([contractId, contractBudgets]) => {
                      const isExpanded = expandedContract === contractId;
                      const contractName = contractBudgets[0].contract_name;
                      const clasificacion = contractBudgets[0].clasificacion;
                      const avanceStatus = contractBudgets[0].capex_avance_status;
                      const companyNames = contractBudgets[0].company_names;
                      const selectedYear = yearFilter !== "todos" ? parseInt(yearFilter) : contractBudgets[0].year;
                      const breakdown = authByContract[contractId] || { authorized: 0, unauthorized: 0 };
                      const superficie = contractBudgets[0].superficie || 0;

                      const authCLP = breakdown.authorized * currentUF;
                      const unauthCLP = breakdown.unauthorized * currentUF;
                      const totalUFVal = breakdown.authorized + breakdown.unauthorized;
                      const ufM2 = superficie > 0 ? totalUFVal / superficie : 0;

                      return (
                        <Collapsible
                          key={contractId}
                          open={isExpanded}
                          onOpenChange={(open) => setExpandedContract(open ? contractId : null)}
                        >
                          <Card>
                            <CollapsibleTrigger asChild>
                              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                                <div className="grid grid-cols-[24px_auto_200px_190px_190px_1fr_64px] items-center gap-3">
                                  <ChevronDown className={`h-5 w-5 shrink-0 transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`} />
                                  <CompanyLogo companyNames={companyNames} size="sm" />
                                  <CardTitle className="text-base whitespace-nowrap">{contractName}</CardTitle>
                                  <div onClick={(e) => e.stopPropagation()} className="flex justify-center">
                                    <Select
                                      value={clasificacion || ""}
                                      onValueChange={(val) => handleClasificacionChange(contractId, val)}
                                    >
                                      <SelectTrigger className={`h-7 w-[180px] text-xs ${getClasificacionColor(clasificacion)}`}>
                                        <SelectValue placeholder="Clasificar..." />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {clasificacionTypes.map((t) => (
                                          <SelectItem key={t.id} value={t.name}>
                                            <span className="flex items-center gap-2">
                                              <span className={`w-2 h-2 rounded-full bg-${t.color}-500 shrink-0`} />
                                              {t.name}
                                            </span>
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div onClick={(e) => e.stopPropagation()} className="flex justify-center">
                                    <Select
                                      value={avanceStatus || ""}
                                      onValueChange={(val) => handleAvanceStatusChange(contractId, val)}
                                    >
                                      <SelectTrigger className={`h-7 w-[180px] text-xs ${getAvanceStatusColor(avanceStatus)}`}>
                                        <SelectValue placeholder="Estado avance..." />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {avanceStatusTypes.map((t) => (
                                          <SelectItem key={t.id} value={t.name}>
                                            <span className="flex items-center gap-2">
                                              <span className={`w-2 h-2 rounded-full bg-${t.color}-500 shrink-0`} />
                                              {t.name}
                                            </span>
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="text-right space-y-0.5">
                                    {totalUFVal > 0 ? (
                                      <>
                                        <div>
                                          <span className="font-medium text-sm">
                                            {formatCLP((authCLP + unauthCLP))}
                                          </span>
                                          <span className="text-xs text-muted-foreground ml-1">
                                            ({fmtUF(totalUFVal)} UF)
                                          </span>
                                        </div>
                                        {superficie > 0 && (
                                          <div className="text-xs text-muted-foreground">
                                            UF {fmtUF(ufM2)}/m²
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <span className="text-muted-foreground text-sm">$0</span>
                                    )}
                                  </div>
                                  <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      title="Descargar PPT individual"
                                      disabled={downloadingPPT === contractId}
                                      onClick={() => handleSinglePPT(contractId, contractName, companyNames)}
                                    >
                                      {downloadingPPT === contractId ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Download className="h-4 w-4" />
                                      )}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      title="Ir al contrato"
                                      onClick={() => navigate(`/contracts/${contractId}?section=capex&returnTo=capex`)}
                                    >
                                      <ExternalLink className="h-4 w-4" />
                                    </Button>
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
                                    superficieEdificada={superficie}
                                    readOnly
                                  />
                                </BudgetProvider>
                              </CardContent>
                            </CollapsibleContent>
                          </Card>
                        </Collapsible>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      <CapexTemplateManager open={templateOpen} onOpenChange={setTemplateOpen} />
    </div>
  );
}
