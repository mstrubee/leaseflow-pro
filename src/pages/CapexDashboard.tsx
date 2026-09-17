import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO, addDays, differenceInDays } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { loadBudgetTotals } from "@/lib/budgetTotals";
import { computeEffectiveDatesMap } from "@/lib/ganttDateUtils";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Search, DollarSign, Building2, RefreshCw, FileCheck, Loader2, Presentation, Download, FileSliders, FileSpreadsheet, AlertTriangle, ExternalLink, X, EyeOff, Eye, CalendarClock, Wallet } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { ApprovedBudgetsDialog } from "@/components/budget/ApprovedBudgetsDialog";
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
  // Preferencia persistida por contrato (contracts.excluded_from_capex_dashboard)
  // -- true = no cuenta en cards/PPT/Excel y va a la sección "Contratos excluidos".
  excluded: boolean;
  // Estado de Comité GP (ej. "Aceptada 2027") -- respaldo del año de CAPEX
  // cuando el contrato no tiene fechas de inversión de las que derivarlo
  // (ver contractYearAmounts).
  comite_gp_status: string | null;
  // Identidad de display cuando este contrato está "duplicado" entre
  // empresas (capex_company_splits): igual a contract_id para un contrato
  // sin splits, o `${contract_id}::split::${splitId}` para cada copia --
  // ver getCopiesForContract. Se agrega recién al armar contractGroups
  // (las filas "crudas" de loadBudgets no lo tienen).
  groupKey?: string;
  // Id de la fila en capex_company_splits que generó esta copia (undefined
  // si la fila no es una copia con split).
  splitId?: string;
  // % de CAPEX asignado a esta copia (undefined si no es una copia con split).
  splitPercentage?: number;
  // Año forzado manualmente (contracts.capex_year_override) -- si está
  // presente, anula el año derivado de fechas/badge de Comité GP para TODO
  // el CAPEX del contrato (ver contractYearAmounts). null = automático.
  capexYearOverride: number | null;
}

// Una fila de capex_company_splits: contrato duplicado con % de CAPEX propio
// y su propio flag de exclusión (independiente del de otras copias del mismo
// contrato y del de contracts.excluded_from_capex_dashboard).
interface CapexCompanySplit {
  id: string;
  company_name: string;
  percentage: number;
  excluded_from_capex_dashboard: boolean;
}

// Una "copia" a mostrar de un contrato: sin splits, una sola copia (percentage
// 100, sin companyName propio -- usa contract_companies como siempre). Con
// splits activos (no excluidos), una copia por fila.
interface ContractCopy {
  groupKey: string;
  percentage: number;
  splitId?: string;
  companyName?: string;
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

// Compara nombres de tarea del Gantt ignorando mayúsculas/acentos/espacios
// extra -- los cronogramas reales usan variantes ("Obras Civiles y
// Especialidades", "Habilitación (Post Tareas Gcia. Operaciones)") en vez del
// nombre exacto "Obras Civiles"/"Habilitación", así que una igualdad estricta
// deja contratos sin desglose de pagos. Se prueba primero el nombre exacto
// (más específico) y, si no hay, el primero que lo contenga como substring.
const normalizeTaskName = (name: string) =>
  name.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const findGanttTaskByNameHint = <T extends { name: string }>(tasks: T[], hint: string): T | undefined =>
  tasks.find((t) => normalizeTaskName(t.name) === hint) ??
  tasks.find((t) => normalizeTaskName(t.name).includes(hint));

// El badge de Comité GP de un contrato en negociación suele venir con el año
// pegado al estado (ej. "Aceptada 2027") -- se usa como respaldo del año de
// CAPEX cuando el contrato no tiene fechas de inversión de las que
// derivarlo (ver contractYearAmounts). Toma el primer año de 4 dígitos que
// aparezca en el texto.
const extractYearFromComiteGP = (comiteGpStatus: string | null): number | null => {
  const match = comiteGpStatus?.match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : null;
};

const toggleArrayValue = (arr: string[], value: string): string[] =>
  arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];

// Agrupamiento de empresa "detallado" (Autoplanet / Agroplanet / Grupo Planet
// / Otra) -- mismo criterio que ya usa companyGroups más abajo para las
// secciones por empresa y sus cards de clasificación. Se separa acá porque
// también lo necesita el desglose por año (mismo bucket, otra dimensión).
type CompanyGroupKey = "Autoplanet" | "Agroplanet" | "Grupo Planet" | "Otra";
const getCompanyGroupKey = (names: string[]): CompanyGroupKey => {
  const hasAgroplanet = names.some((n) => n.toLowerCase().includes("agroplanet"));
  const hasAutoplanet = names.some((n) => n.toLowerCase().includes("autoplanet"));
  const hasGrupoPlanet = names.some((n) => /grupo\s*planet/.test(n.toLowerCase()));
  return hasAgroplanet && hasAutoplanet
    ? "Agroplanet"
    : hasAutoplanet
    ? "Autoplanet"
    : hasAgroplanet
    ? "Agroplanet"
    : hasGrupoPlanet
    ? "Grupo Planet"
    : "Otra";
};

// Formato pedido por Matias para el desglose por año en las cards: monto en
// millones de pesos (sin decimales, separador de miles CLP) + " año " + año.
// Ej: $1.711.245.615 en 2026 -> "mm$ 1.711 año 2026".
const fmtYearChip = (clp: number, year: number) =>
  `mm$ ${Math.round(clp / 1_000_000).toLocaleString("es-CL")} año ${year}`;

/** Chip/badge con el desglose por año de una card CAPEX -- esquina superior
 * derecha, sin romper el layout existente (la card sigue con fondo blanco).
 * Si hay un año puntual seleccionado en el filtro "Año" (activeYear), el
 * chip deja de ser "estático" ante ese filtro: solo muestra ese año (o
 * nada, si esa card no tiene CAPEX en él) en vez de siempre todos los años. */
function YearBreakdownChips({ breakdown, activeYear }: { breakdown: Record<number, number> | undefined; activeYear?: number }) {
  // Solo años con CAPEX real (> 0) -- una fila de presupuesto en $0 no debe
  // aparecer como si existiera CAPEX en ese año. Más antiguo arriba, más
  // reciente abajo (uno sobre otro, no en fila).
  const years = breakdown
    ? Object.keys(breakdown).map(Number).filter((y) => breakdown[y] > 0 && (activeYear === undefined || y === activeYear)).sort((a, b) => a - b)
    : [];
  if (years.length === 0) return null;
  return (
    <div className="absolute top-1.5 right-1.5 flex flex-col items-end gap-0.5 max-w-[62%] z-10">
      {years.map((y) => (
        <span
          key={y}
          className="text-[9px] leading-none font-medium text-muted-foreground whitespace-nowrap"
        >
          {fmtYearChip(breakdown![y], y)}
        </span>
      ))}
    </div>
  );
}

/** Botón por línea de contrato para forzar manualmente su año de CAPEX
 * (contracts.capex_year_override), independiente de cuándo se vaya a
 * gastar realmente -- ej. presupuesto ya aprobado para el año N. Reversible
 * (botón "Quitar"), persistido en DB. */
function YearOverrideButton({
  currentOverride,
  onSet,
}: {
  currentOverride: number | null;
  onSet: (year: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(currentOverride ? String(currentOverride) : "");

  // Rango fijo pedido: desde 2026 hasta 1 año más que el año en curso.
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = 2026; y <= currentYear + 1; y++) years.push(y);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setValue(currentOverride ? String(currentOverride) : ""); }}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`h-7 w-7 ${currentOverride ? "text-amber-600" : ""}`}
          title={currentOverride ? `Año de CAPEX forzado a ${currentOverride} -- click para cambiar` : "Forzar año de CAPEX"}
          onClick={(e) => e.stopPropagation()}
        >
          <CalendarClock className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-2">
          <p className="text-sm font-medium">Forzar año de CAPEX</p>
          <p className="text-xs text-muted-foreground">
            Asigna este contrato a un año específico (presupuesto aprobado), sin importar cuándo se vaya a gastar realmente.
          </p>
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger>
              <SelectValue placeholder="Elegir año..." />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex justify-end gap-2 pt-1">
            {currentOverride && (
              <Button variant="outline" size="sm" onClick={() => { onSet(null); setOpen(false); }}>
                Quitar (automático)
              </Button>
            )}
            <Button
              size="sm"
              disabled={!value}
              onClick={() => { onSet(parseInt(value)); setOpen(false); }}
            >
              Forzar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function CapexDashboard() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { ufValue } = useEconomicIndicators();

  const [budgets, setBudgets] = useState<ContractBudget[]>([]);
  const [authByBudget, setAuthByBudget] = useState<AuthByBudget>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [yearFilter, setYearFilter] = useState("todos");
  // Filtros multi-selección: array vacío = "todas".
  const [companyFilter, setCompanyFilter] = useState<string[]>([]);
  const [clasificacionFilter, setClasificacionFilter] = useState<string[]>([]);
  const [avanceStatusFilter, setAvanceStatusFilter] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<"nombre" | "empresa" | "clasificacion">("nombre");
  const [expandedContract, setExpandedContract] = useState<string | null>(null);
  
  const [templateOpen, setTemplateOpen] = useState(false);
  const [approvedBudgetsOpen, setApprovedBudgetsOpen] = useState(false);
  // Presupuesto CAPEX aprobado por año (capex_approved_budgets, cargado
  // desde la card "Capex Aprobado") -- para la card de
  // Aprobado/Total/Disponible. Se recarga al cerrar ese diálogo, por si se
  // editó algo mientras estaba abierto.
  interface ApprovedBudgetRow {
    id: string;
    amount_clp: number;
    // Si es true, el Disponible de ese año suma de vuelta el CAPEX "Caído"
    // (reversible, con memoria en DB -- ver handleToggleIncludeCaidos).
    includeCaidos: boolean;
  }
  const [approvedBudgetsByYear, setApprovedBudgetsByYear] = useState<Record<number, ApprovedBudgetRow>>({});
  const loadApprovedBudgets = React.useCallback(async () => {
    const { data } = await (supabase as any)
      .from("capex_approved_budgets")
      .select("id, year, amount_clp, include_caidos_in_disponible");
    const ids = (data || []).map((r: any) => r.id);
    // Aumentos de presupuesto (capex_approved_budget_increases) -- acá se
    // suman al monto original sin desglosar; el detalle de cada aumento solo
    // se ve en el diálogo "Presupuestos Anuales".
    let increasesByBudget: Record<string, number> = {};
    if (ids.length > 0) {
      const { data: increases } = await (supabase as any)
        .from("capex_approved_budget_increases")
        .select("budget_id, amount_clp")
        .in("budget_id", ids);
      (increases || []).forEach((inc: any) => {
        increasesByBudget[inc.budget_id] = (increasesByBudget[inc.budget_id] || 0) + inc.amount_clp;
      });
    }
    const byYear: Record<number, ApprovedBudgetRow> = {};
    (data || []).forEach((r: any) => {
      byYear[r.year] = {
        id: r.id,
        amount_clp: (r.amount_clp || 0) + (increasesByBudget[r.id] || 0),
        includeCaidos: !!r.include_caidos_in_disponible,
      };
    });
    setApprovedBudgetsByYear(byYear);
  }, []);
  useEffect(() => { loadApprovedBudgets(); }, [loadApprovedBudgets]);
  const handleToggleIncludeCaidos = async (year: number) => {
    const row = approvedBudgetsByYear[year];
    if (!row) return;
    const next = !row.includeCaidos;
    setApprovedBudgetsByYear((prev) => ({ ...prev, [year]: { ...prev[year], includeCaidos: next } }));
    const { error } = await (supabase as any)
      .from("capex_approved_budgets")
      .update({ include_caidos_in_disponible: next })
      .eq("id", row.id);
    if (error) {
      toast.error("Error al guardar la preferencia de Caídos");
      setApprovedBudgetsByYear((prev) => ({ ...prev, [year]: { ...prev[year], includeCaidos: !next } }));
    }
  };
  const [downloadingPPT, setDownloadingPPT] = useState<string | null>(null);
  const [exportingExcel, setExportingExcel] = useState(false);
  // Aísla los contratos con líneas "No Autorizado" (monto > 0) para ir
  // aprobándolas de forma más ágil, expandiendo uno a uno.
  const [onlyUnauthorized, setOnlyUnauthorized] = useState(false);
  // Empresas expandidas manualmente (chevrón) -- arrancan todas colapsadas.
  // Las cards de clasificación/avance de cada empresa siempre se ven; lo que
  // colapsa es el listado de contratos de abajo. Mientras haya algún filtro
  // activo (búsqueda/empresa/clasificación/avance/año), TODAS se muestran
  // expandidas sin tocar este estado -- al limpiar el filtro, vuelve
  // exactamente al estado manual que tenía antes.
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  const isAnyFilterActive = !!(searchTerm || companyFilter.length > 0 || clasificacionFilter.length > 0 || avanceStatusFilter.length > 0 || yearFilter !== "todos");
  const toggleCompanyExpanded = (company: string) => {
    setExpandedCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(company)) next.delete(company);
      else next.add(company);
      return next;
    });
  };
  // Colapsable de la sección "Contratos excluidos" al final de la página --
  // arranca cerrada para no llamar la atención sobre algo que, por
  // definición, no debería mirarse a diario.
  const [excludedSectionOpen, setExcludedSectionOpen] = useState(false);
  // "Tipos de CAPEX" administrables desde Admin > Estados y Categorías --
  // el "name" de cada uno es el mismo texto que se guarda en
  // contracts.clasificacion.
  const [clasificacionTypes, setClasificacionTypes] = useState<Array<{ id: string; name: string; color: string }>>([]);
  // "Estado Avance CAPEX" (En Curso/Terminado/Programado), administrable
  // desde Admin > Estados y Categorías -- el "name" es el mismo texto que
  // se guarda en contracts.capex_avance_status.
  const [avanceStatusTypes, setAvanceStatusTypes] = useState<Array<{ id: string; name: string; color: string }>>([]);
  // Orden pedido explícitamente para las cards de Estado de Avance CAPEX (acá
  // y por empresa), de izquierda a derecha -- independiente del
  // display_order administrado en Admin. Un tipo que no esté en esta lista
  // (ej. uno nuevo agregado a futuro) queda al final, sin romper.
  const AVANCE_CARD_ORDER = ["Terminado", "En Curso", "Programado", "Caído"];
  const avanceStatusTypesOrdered = React.useMemo(() => {
    return [...avanceStatusTypes].sort((a, b) => {
      const ia = AVANCE_CARD_ORDER.indexOf(a.name);
      const ib = AVANCE_CARD_ORDER.indexOf(b.name);
      if (ia === -1 && ib === -1) return a.name.localeCompare(b.name);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [avanceStatusTypes]);
  // Splits de empresa (capex_company_splits) por contrato -- contratos
  // "duplicados" entre empresas con % de CAPEX propio. Ver getCopiesForContract.
  const [splitsByContract, setSplitsByContract] = useState<Map<string, CapexCompanySplit[]>>(new Map());

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
    (async () => {
      const { data } = await (supabase as any)
        .from("capex_company_splits")
        .select("id, contract_id, company_name, percentage, excluded_from_capex_dashboard")
        .order("display_order");
      const m = new Map<string, CapexCompanySplit[]>();
      (data || []).forEach((s: any) => {
        const arr = m.get(s.contract_id) || [];
        arr.push({
          id: s.id,
          company_name: s.company_name,
          percentage: s.percentage,
          excluded_from_capex_dashboard: !!s.excluded_from_capex_dashboard,
        });
        m.set(s.contract_id, arr);
      });
      setSplitsByContract(m);
    })();
  }, []);

  useEffect(() => {
    if (user && ufValue > 0) loadBudgets();
  }, [user, ufValue]);

  // Copias a mostrar de un contrato real: sin splits (o con todos sus splits
  // excluidos), una sola copia igual a hoy; con uno o más splits activos, una
  // copia por fila de capex_company_splits (excluidas individualmente
  // filtradas acá -- no generan copia en el dashboard, pero siguen existiendo
  // para la sección "Contratos excluidos").
  const getCopiesForContract = React.useCallback(
    (contractId: string): ContractCopy[] => {
      const splits = (splitsByContract.get(contractId) || []).filter((s) => !s.excluded_from_capex_dashboard);
      if (splits.length === 0) return [{ groupKey: contractId, percentage: 100 }];
      return splits.map((s) => ({
        groupKey: `${contractId}::split::${s.id}`,
        percentage: s.percentage,
        splitId: s.id,
        companyName: s.company_name,
      }));
    },
    [splitsByContract]
  );

  // Totales (UF + cantidad) agrupados por un campo del contrato (clasificación,
  // estado de avance, o el bucket de empresa vía `keyOf`), a partir de un
  // conjunto de filas ya filtrado -- usado para los cards "sin auto-ocultarse"
  // de más abajo: se les pasa `filterBudgetsExcept(<esa dimensión>)` en vez de
  // `filteredBudgets`, para que un tipo sin match bajo el filtro ACTUAL de esa
  // misma dimensión (pero sí bajo las demás) siga apareciendo con su monto
  // real, en vez de desaparecer.
  const computeStatsByKey = React.useCallback(
    (
      rows: ContractBudget[],
      // Recibe también la copia (percentage/companyName si es un split) -- lo
      // necesita el bucket de empresa (cada copia puede caer en un bucket
      // distinto según su propia empresa), aunque clasificación/avance
      // (atributos del contrato, iguales en todas sus copias) lo ignoren.
      keyOf: (b: ContractBudget, copy: ContractCopy) => string | null
    ): Record<string, { uf: number; count: number }> => {
      const byContract = new Map<string, ContractBudget[]>();
      rows.forEach((b) => {
        const arr = byContract.get(b.contract_id) || [];
        arr.push(b);
        byContract.set(b.contract_id, arr);
      });
      const result: Record<string, { uf: number; count: number }> = {};
      byContract.forEach((contractRows, contractId) => {
        let authorized = 0, unauthorized = 0;
        contractRows.forEach((b) => {
          const eff = getEffectiveBudgetBreakdown(b, authByBudget[b.budget_id]);
          authorized += eff.authorized;
          unauthorized += eff.unauthorized;
        });
        getCopiesForContract(contractId).forEach((copy) => {
          const key = keyOf(contractRows[0], copy);
          if (!key) return;
          const factor = copy.percentage / 100;
          if (!result[key]) result[key] = { uf: 0, count: 0 };
          result[key].uf += (authorized + unauthorized) * factor;
          result[key].count++;
        });
      });
      return result;
    },
    [authByBudget, getCopiesForContract]
  );

  const loadBudgets = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("contract_budgets")
        .select("id, contract_id, year, amount_uf, budget_type, contracts!inner(name, clasificacion, capex_avance_status, superficie_edificada_local, excluded_from_capex_dashboard, comite_gp_status, capex_year_override, contract_companies(companies(name)))")
        .eq("budget_type", "capex")
        .is("contracts.deleted_at", null)
        // Nunca se muestra un "Rechazada" en Comité GP, sea cual sea el
        // estado del contrato.
        .or("comite_gp_status.is.null,comite_gp_status.neq.Rechazada", { foreignTable: "contracts" })
        // Los contratos "En Negociación" además solo se muestran si el
        // Comité GP los aceptó -- "Aceptada", "Aceptado", "Aceptada 2027",
        // etc. (misma comparación flexible que la query de "autorizados en
        // negociación" más abajo -- .eq exacto excluía contratos con
        // presupuesto CAPEX real ya cargado cuyo estado no fuera EXACTAMENTE
        // "Aceptada", ej. "Aceptada 2026", mostrándolos con $0 por la vía de
        // respaldo del Business Case en vez de con su monto real). Otros
        // estados de comité (Buscar, En Revisión, etc.) quedan afuera. El
        // resto de los estados de contrato (ej. Firmado) se muestra igual,
        // sin depender de esto.
        .or("status.neq.en_negociacion,comite_gp_status.ilike.%acepta%", { foreignTable: "contracts" })
        .order("year", { ascending: false });

      if (error) throw error;

      const processed: ContractBudget[] = (data || [])
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
        excluded: !!b.contracts?.excluded_from_capex_dashboard,
        comite_gp_status: b.contracts?.comite_gp_status || null,
        capexYearOverride: b.contracts?.capex_year_override ?? null,
      }));

      // Contratos "autorizados" en negociación (status = en_negociacion,
      // no eliminados, comite_gp_status contiene "acepta" -- Aceptada,
      // Aceptado, Aceptada 2027, etc., excluyendo Rechazada). Misma lógica
      // que negotiationAcceptedIds en GanttReportsSection.tsx (líneas
      // ~670-684), reutilizada acá: deben listarse en /capex aunque todavía
      // no tengan ninguna fila en contract_budgets (con $0 / "Sin CAPEX").
      const { data: acceptedNegotiationContracts, error: negErr } = await supabase
        .from("contracts")
        .select("id, name, clasificacion, capex_avance_status, superficie_edificada_local, excluded_from_capex_dashboard, comite_gp_status, capex_year_override, contract_companies(companies(name))")
        .eq("status", "en_negociacion")
        .is("deleted_at", null)
        .ilike("comite_gp_status", "%acepta%")
        .neq("comite_gp_status", "Rechazada");
      if (negErr) throw negErr;

      const existingContractIds = new Set(processed.map((b) => b.contract_id));
      const currentYear = new Date().getFullYear();
      const negotiationOnlyContracts = (acceptedNegotiationContracts || []).filter(
        (c: any) => !existingContractIds.has(c.id)
      );

      // Estos contratos todavía no tienen presupuesto CAPEX real cargado
      // (contract_budgets) -- en vez de mostrarlos en $0, se usa el "Capex
      // Estimado" del Business Case Financiero (mismo cálculo que la columna
      // "Capex Est." de /contracts?status=en_negociacion: total de inversión
      // sin el inventario/capital de trabajo). Viene en MM CLP -> se pasa a
      // UF con el mismo criterio que esa columna.
      let capexEstUFByContract: Record<string, number> = {};
      if (negotiationOnlyContracts.length > 0) {
        const { data: businessCases } = await supabase
          .from("contract_business_cases")
          .select("contract_id, computed")
          .in("contract_id", negotiationOnlyContracts.map((c: any) => c.id));
        (businessCases || []).forEach((row: any) => {
          const computed = row.computed as { inv?: { total?: number; rows?: { id: string; monto: number }[] } } | null;
          const total = computed?.inv?.total || 0;
          const inventario = computed?.inv?.rows?.find((r) => r.id === "inv")?.monto || 0;
          const capexEstMM = total - inventario;
          capexEstUFByContract[row.contract_id] = ufValue > 0 ? (capexEstMM * 1_000_000) / ufValue : 0;
        });
      }

      const negotiationOnly: ContractBudget[] = negotiationOnlyContracts.map((c: any) => ({
        contract_id: c.id,
        contract_name: c.name || "Sin nombre",
        clasificacion: c.clasificacion || null,
        capex_avance_status: c.capex_avance_status || null,
        // El año del badge "Aceptada (año)" (ej. "Aceptada 2027") si lo trae,
        // ya que estos contratos todavía no tienen fechas de Gantt de las
        // que derivar un año -- ver extractYearFromComiteGP/contractYearAmounts.
        year: c.capex_year_override ?? extractYearFromComiteGP(c.comite_gp_status) ?? currentYear,
        amount_uf: capexEstUFByContract[c.id] || 0,
        // Id sintético (no hay fila real en contract_budgets todavía) --
        // único por contrato, no colisiona con ids reales (uuid).
        budget_id: `negotiation-${c.id}`,
        superficie: c.superficie_edificada_local || 0,
        company_names: (c.contract_companies || []).map((cc: any) => cc.companies?.name).filter(Boolean) as string[],
        excluded: !!c.excluded_from_capex_dashboard,
        comite_gp_status: c.comite_gp_status || null,
        capexYearOverride: c.capex_year_override ?? null,
      }));

      const allProcessed = [...processed, ...negotiationOnly];
      setBudgets(allProcessed);

      // Load per-budget breakdown (authorized / unauthorized / grand) from detail lines
      // (los sintéticos "negotiation-*" no tienen líneas y quedan sin breakdown,
      // getEffectiveBudgetBreakdown ya maneja ese caso usando amount_uf = 0).
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

  // Contratos marcados como excluidos (contracts.excluded_from_capex_dashboard)
  // -- no participan de ningún card/memo/export de más abajo, se muestran
  // aparte en la sección "Contratos excluidos" al final de la página.
  const activeBudgets = React.useMemo(() => budgets.filter((b) => !b.excluded), [budgets]);

  // Un contrato pasa el filtro de Empresa si ALGUNA de sus copias visibles
  // (ver getCopiesForContract) cae en una de las empresas seleccionadas --
  // así, filtrar por "Autoplanet" muestra un contrato con split 80%
  // Autoplanet / 20% Agroplanet aunque su `contract_companies` completo lo
  // ubicara hoy en el bucket "Agroplanet" (>1 empresa).
  const contractMatchesCompanyFilter = React.useCallback(
    (b: ContractBudget, filter: string[]): boolean => {
      if (filter.length === 0) return true;
      return getCopiesForContract(b.contract_id).some((copy) =>
        filter.includes(getCompanyBucket(copy.companyName ? [copy.companyName] : b.company_names))
      );
    },
    [getCopiesForContract]
  );

  // Igual que `filteredBudgets` pero sin el filtro de año -- se usa para todo
  // lo que debe considerar el CAPEX de un contrato en TODOS sus años (el
  // desglose por año de las cards, y el total que alimenta el 30/50/20 del
  // disbursement), no solo el año seleccionado en el dropdown.
  const budgetsAllYears = React.useMemo(() => {
    return activeBudgets.filter((b) => {
      if (searchTerm && !b.contract_name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (!contractMatchesCompanyFilter(b, companyFilter)) return false;
      if (clasificacionFilter.length > 0 && !clasificacionFilter.includes(b.clasificacion || "")) return false;
      if (avanceStatusFilter.length > 0 && !avanceStatusFilter.includes(b.capex_avance_status || "")) return false;
      return true;
    });
  }, [activeBudgets, searchTerm, contractMatchesCompanyFilter, companyFilter, clasificacionFilter, avanceStatusFilter]);

  // Rango de fecha de inversión por contrato (inicio - término), calculado
  // con la MISMA lógica que "Cartas Gantt - Vista General" en /reports
  // (GanttReportsSection): fechas EFECTIVAS de las tareas del cronograma
  // "general" del contrato (computeEffectiveDatesMap, compartido con
  // GanttChart.tsx vía src/lib/ganttDateUtils.ts). El término usa la tarea
  // "Apertura" si existe (fecha real de apertura al público, no el máximo de
  // TODAS las tareas); si no existe, se usa el máximo término efectivo. El
  // inicio es el mínimo inicio efectivo entre todas las tareas del
  // cronograma -- análogo a "overallStart" en GanttChart.tsx. Contratos sin
  // Gantt/tareas/fechas simplemente no entran en el mapa (sin placeholder).
  interface ContractInvestmentInfo {
    start: string;
    end: string;
    taskCount: number;
    timelineName: string;
    // Espejo de GanttReportsSection: 30% Anticipo (inicio "Obras Civiles") /
    // 50% Estado Pago 1 (punto medio) / 20% Estado Pago 2 (término
    // "Habilitación"). null si el contrato no tiene esas dos tareas.
    disbursement: {
      startDate: string;
      midDate: string;
      endDate: string;
      anticipo: number;
      pago1: number;
      pago2: number;
    } | null;
  }
  const [contractInvestmentInfo, setContractInvestmentInfo] = useState<Record<string, ContractInvestmentInfo>>({});
  // Filas de presupuesto agrupadas por contrato, en TODOS los años (no solo
  // el año del filtro) -- base tanto del CAPEX total por contrato (para el
  // 30/50/20 del disbursement) como del desglose por año derivado de fechas
  // reales (ver contractYearAmounts más abajo).
  const budgetRowsByContractAllYears = React.useMemo(() => {
    const m = new Map<string, ContractBudget[]>();
    budgetsAllYears.forEach((b) => {
      const arr = m.get(b.contract_id) || [];
      arr.push(b);
      m.set(b.contract_id, arr);
    });
    return m;
  }, [budgetsAllYears]);
  // Contratos a considerar para traer su cronograma Gantt (fechas de
  // inversión / disbursement): TODOS los que tengan CAPEX en cualquier año,
  // no solo los visibles bajo el filtro de año -- el desglose por año de las
  // cards necesita las fechas reales de todos ellos para poder ubicar cada
  // tramo en su año correcto, sin importar qué año esté seleccionado arriba.
  const contractIdsForInvestmentInfoKey = React.useMemo(
    () => Array.from(budgetRowsByContractAllYears.keys()).sort().join(","),
    [budgetRowsByContractAllYears]
  );

  // CAPEX en CLP por contrato, sumando TODOS sus años -- necesario para el
  // desglose 30/50/20 del disbursement represente la inversión completa del
  // contrato y no solo la del año seleccionado en el filtro.
  const capexCLPByContract = React.useMemo(() => {
    const m = new Map<string, number>();
    budgetRowsByContractAllYears.forEach((rows, contractId) => {
      const clp = rows.reduce(
        (sum, b) => sum + getEffectiveBudgetTotal(b, authByBudget[b.budget_id]) * (ufValue || 0),
        0
      );
      m.set(contractId, clp);
    });
    return m;
  }, [budgetRowsByContractAllYears, authByBudget, ufValue]);

  // Año de cada tramo de CAPEX, derivado de las fechas reales que ya se
  // muestran por línea de contrato (Anticipo/Pago 1/Pago 2 -- ver
  // contractInvestmentInfo) en vez del campo "Año" cargado a mano en
  // Control Presupuestario. Así, si se reprograma la carta Gantt (y con
  // ella las fechas de Obras Civiles/Habilitación), el CAPEX pasa solo de
  // año en los cards sin tener que ir a corregir ese campo a mano. Para
  // contratos sin esas fechas (sin disbursement calculable) se mantiene el
  // campo "Año" como respaldo, único dato disponible en ese caso.
  // Desglose por año, por COPIA (groupKey) -- el disbursement real (100% del
  // contrato, ver contractInvestmentInfo/capexCLPByContract más arriba, NUNCA
  // recalculado por copia) se escala por el % de cada copia. Ej: Anticipo
  // real $100 en 2026 -> copia 80% aporta $80 a 2026, copia 20% aporta $20.
  const contractYearAmounts = React.useMemo(() => {
    const m = new Map<string, Record<number, number>>();
    budgetRowsByContractAllYears.forEach((rows, contractId) => {
      const totalCLP = capexCLPByContract.get(contractId) || 0;
      const disbursement = contractInvestmentInfo[contractId]?.disbursement;
      const yearOverride = rows[0]?.capexYearOverride ?? null;
      getCopiesForContract(contractId).forEach(({ groupKey, percentage }) => {
        const factor = percentage / 100;
        const yearMap: Record<number, number> = {};
        if (yearOverride !== null) {
          // Año forzado manualmente (contracts.capex_year_override): anula
          // cualquier derivación automática -- todo el CAPEX de esta copia
          // va a ese único año, sin importar fechas de Gantt ni Comité GP.
          const clp = rows.reduce(
            (sum, b) => sum + getEffectiveBudgetTotal(b, authByBudget[b.budget_id]) * (ufValue || 0),
            0
          ) * factor;
          yearMap[yearOverride] = clp;
        } else if (disbursement && totalCLP > 0) {
          const addToYear = (dateStr: string, amount: number) => {
            const year = parseISO(dateStr).getFullYear();
            yearMap[year] = (yearMap[year] || 0) + amount * factor;
          };
          addToYear(disbursement.startDate, disbursement.anticipo);
          addToYear(disbursement.midDate, disbursement.pago1);
          addToYear(disbursement.endDate, disbursement.pago2);
        } else {
          // Sin fechas de inversión de las que derivar un año: se usa el año
          // del badge de Comité GP (ej. "Aceptada 2027") si lo trae -- es
          // solo un año, sin más detalle, así que todo el monto del contrato
          // va ahí. Como último recurso (ni fechas ni año en el badge) se cae
          // al campo "Año" manual de la fila.
          rows.forEach((b) => {
            const clp = getEffectiveBudgetTotal(b, authByBudget[b.budget_id]) * (ufValue || 0) * factor;
            const year = extractYearFromComiteGP(b.comite_gp_status) ?? b.year;
            yearMap[year] = (yearMap[year] || 0) + clp;
          });
        }
        m.set(groupKey, yearMap);
      });
    });
    return m;
  }, [budgetRowsByContractAllYears, capexCLPByContract, contractInvestmentInfo, authByBudget, ufValue, getCopiesForContract]);

  // Años disponibles para el dropdown "Año" -- unión del campo "Año" cargado
  // a mano (contract_budgets.year) con los años que arrojan las fechas
  // reales de pago (contractYearAmounts). Sin esto último, un contrato cuyo
  // CAPEX cae en un año distinto al del campo manual (ej. reprogramado a
  // 2027) no dejaba elegir ese año en el filtro, aunque las cards ya lo
  // mostraran ahí.
  const availableYears = React.useMemo(() => {
    const years = new Set<number>();
    activeBudgets.forEach(b => years.add(b.year));
    contractYearAmounts.forEach((yearMap) => {
      Object.keys(yearMap).forEach((y) => years.add(Number(y)));
    });
    const currentYear = new Date().getFullYear();
    years.add(currentYear);
    return Array.from(years).sort((a, b) => b - a);
  }, [activeBudgets, contractYearAmounts]);

  useEffect(() => {
    const contractIds = contractIdsForInvestmentInfoKey ? contractIdsForInvestmentInfoKey.split(",") : [];
    if (contractIds.length === 0) {
      setContractInvestmentInfo({});
      return;
    }
    let cancelled = false;
    (async () => {
      // Solo el cronograma PRINCIPAL (category = 'general') de cada
      // contrato, igual que GanttReportsSection -- el de mantenciones no
      // corresponde acá.
      const { data: timelines } = await supabase
        .from("gantt_timelines")
        .select("id, contract_id, name")
        .in("contract_id", contractIds)
        .eq("category", "general")
        .order("is_priority", { ascending: false })
        .order("created_at", { ascending: false });

      const timelineByContract = new Map<string, { id: string; name: string }>();
      (timelines || []).forEach((t: any) => {
        if (!timelineByContract.has(t.contract_id)) timelineByContract.set(t.contract_id, { id: t.id, name: t.name });
      });
      const timelineIds = Array.from(timelineByContract.values()).map((t) => t.id);
      if (timelineIds.length === 0) {
        if (!cancelled) setContractInvestmentInfo({});
        return;
      }

      let allTasks: any[] = [];
      const PAGE = 1000;
      let from = 0;
      let more = true;
      while (more) {
        const { data: page, error } = await supabase
          .from("gantt_tasks")
          .select("id, timeline_id, parent_id, start_date, end_date, name")
          .in("timeline_id", timelineIds)
          .range(from, from + PAGE - 1);
        if (error) break;
        allTasks = allTasks.concat(page || []);
        more = (page?.length || 0) === PAGE;
        from += PAGE;
      }

      const info: Record<string, ContractInvestmentInfo> = {};
      timelineByContract.forEach(({ id: timelineId, name: timelineName }, contractId) => {
        const tasks = allTasks.filter((t) => t.timeline_id === timelineId);
        if (tasks.length === 0) return;
        const effMap = computeEffectiveDatesMap(tasks);
        const effOf = (t: any) => effMap.get(t.id) ?? { start: t.start_date, end: t.end_date };

        const starts = tasks.map((t) => effOf(t).start).filter(Boolean) as string[];
        const minStart = starts.length > 0 ? starts.reduce((min, d) => (d < min ? d : min), starts[0]) : null;

        const endDates = tasks.map((t) => effOf(t).end).filter(Boolean) as string[];
        const maxEndDate = endDates.length > 0 ? endDates.reduce((max, d) => (d > max ? d : max), endDates[0]) : null;
        const aperturaTask = tasks.find((t: any) => t.name.trim().toLowerCase() === "apertura");
        const endDate = aperturaTask ? effOf(aperturaTask).end : maxEndDate;
        if (!minStart || !endDate) return;

        // Disbursement: mismo criterio que GanttReportsSection -- "Obras
        // Civiles" (inicio) y "Habilitación" (término), 30/50/20 del CAPEX CLP.
        // Se usa coincidencia flexible (findGanttTaskByNameHint) porque varios
        // cronogramas nombran estas tareas con variantes ("Obras Civiles y
        // Especialidades", "Habilitación (Post Tareas Gcia. Operaciones)").
        let disbursement: ContractInvestmentInfo["disbursement"] = null;
        const obrasCiviles = findGanttTaskByNameHint(tasks, "obras civiles");
        const habilitacion = findGanttTaskByNameHint(tasks, "habilitacion");
        const obrasStart = obrasCiviles ? effOf(obrasCiviles).start : null;
        const habilEnd = habilitacion ? effOf(habilitacion).end : null;
        const capexCLP = capexCLPByContract.get(contractId) || 0;
        if (obrasStart && habilEnd && capexCLP > 0) {
          const start = parseISO(obrasStart);
          const end = parseISO(habilEnd);
          const midDay = addDays(start, Math.round(differenceInDays(end, start) / 2));
          disbursement = {
            startDate: obrasStart,
            midDate: format(midDay, "yyyy-MM-dd"),
            endDate: habilEnd,
            anticipo: Math.round(capexCLP * 0.30),
            pago1: Math.round(capexCLP * 0.50),
            pago2: Math.round(capexCLP * 0.20),
          };
        }

        info[contractId] = { start: minStart, end: endDate, taskCount: tasks.length, timelineName, disbursement };
      });
      if (!cancelled) setContractInvestmentInfo(info);
    })();
    return () => {
      cancelled = true;
    };
  }, [contractIdsForInvestmentInfoKey, capexCLPByContract]);

  // El filtro "Año" compara contra el año DERIVADO de las fechas reales de
  // pago (contractYearAmounts), el mismo que ya usan las cards -- no el
  // campo manual `year` de la fila. Si se comparara contra el campo manual,
  // un contrato cuyo año real difiere de ese campo (ej. reprogramado a
  // 2027, con el campo todavía en 2026) directamente desaparecía del
  // listado al filtrar por su año real, aunque las cards ya lo mostraran
  // ahí. `contractYearAmounts` ya cae de vuelta al campo manual cuando el
  // contrato no tiene fechas de las que derivar un año.
  const contractHasYear = React.useCallback(
    (contractId: string, year: number) =>
      getCopiesForContract(contractId).some((copy) => !!contractYearAmounts.get(copy.groupKey)?.[year]),
    [contractYearAmounts, getCopiesForContract],
  );

  const filteredBudgets = React.useMemo(() => {
    return activeBudgets.filter(b => {
      if (yearFilter !== "todos" && !contractHasYear(b.contract_id, parseInt(yearFilter))) return false;
      if (searchTerm && !b.contract_name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (!contractMatchesCompanyFilter(b, companyFilter)) return false;
      if (clasificacionFilter.length > 0 && !clasificacionFilter.includes(b.clasificacion || "")) return false;
      if (avanceStatusFilter.length > 0 && !avanceStatusFilter.includes(b.capex_avance_status || "")) return false;
      return true;
    });
  }, [activeBudgets, yearFilter, contractHasYear, searchTerm, contractMatchesCompanyFilter, companyFilter, clasificacionFilter, avanceStatusFilter]);

  // Aplica los mismos filtros que filteredBudgets pero salteando uno de los
  // filtros -- se usa para calcular qué opciones de CADA dropdown todavía
  // tienen algún resultado dado el resto de los filtros activos, y esconder
  // las que quedarían en 0 (evita ofrecer una combinación sin resultados).
  const filterBudgetsExcept = React.useCallback(
    (except: "company" | "clasificacion" | "avance") =>
      activeBudgets.filter((b) => {
        if (yearFilter !== "todos" && !contractHasYear(b.contract_id, parseInt(yearFilter))) return false;
        if (searchTerm && !b.contract_name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
        if (except !== "company" && !contractMatchesCompanyFilter(b, companyFilter)) return false;
        if (except !== "clasificacion" && clasificacionFilter.length > 0 && !clasificacionFilter.includes(b.clasificacion || "")) return false;
        if (except !== "avance" && avanceStatusFilter.length > 0 && !avanceStatusFilter.includes(b.capex_avance_status || "")) return false;
        return true;
      }),
    [activeBudgets, yearFilter, contractHasYear, searchTerm, contractMatchesCompanyFilter, companyFilter, clasificacionFilter, avanceStatusFilter],
  );

  const availableCompanyBuckets = React.useMemo(() => {
    const set = new Set<string>();
    filterBudgetsExcept("company").forEach((b) => {
      getCopiesForContract(b.contract_id).forEach((copy) =>
        set.add(getCompanyBucket(copy.companyName ? [copy.companyName] : b.company_names))
      );
    });
    return set;
  }, [filterBudgetsExcept, getCopiesForContract]);

  const availableClasificaciones = React.useMemo(() => {
    const set = new Set<string>();
    filterBudgetsExcept("clasificacion").forEach((b) => { if (b.clasificacion) set.add(b.clasificacion); });
    return set;
  }, [filterBudgetsExcept]);

  const availableAvanceStatuses = React.useMemo(() => {
    const set = new Set<string>();
    filterBudgetsExcept("avance").forEach((b) => { if (b.capex_avance_status) set.add(b.capex_avance_status); });
    return set;
  }, [filterBudgetsExcept]);

  const hasActiveFilters = searchTerm !== "" || companyFilter.length > 0 || clasificacionFilter.length > 0 || avanceStatusFilter.length > 0;

  const clearFilters = () => {
    setSearchTerm("");
    setCompanyFilter([]);
    setClasificacionFilter([]);
    setAvanceStatusFilter([]);
  };

  // Group by contract, then EXPANDE cada contrato en sus copias (ver
  // getCopiesForContract) -- sin splits activos, una sola copia (groupKey =
  // contract_id, idéntica a hoy); con splits, una copia por fila, cada una
  // con su propio company_names (solo el de esa copia, no toda la lista de
  // contract_companies) y su monto (amount_uf) escalado por el %. El
  // contract_id REAL de cada fila se mantiene sin tocar (para "Ir al
  // contrato", BudgetModule, y para buscar contractInvestmentInfo por el
  // contrato real). A CAPEX budget must be visible even when it has no detail
  // lines yet.
  const contractGroups = React.useMemo(() => {
    const byContract = new Map<string, ContractBudget[]>();
    filteredBudgets.forEach(b => {
      const existing = byContract.get(b.contract_id) || [];
      existing.push(b);
      byContract.set(b.contract_id, existing);
    });
    const map = new Map<string, ContractBudget[]>();
    byContract.forEach((rows, contractId) => {
      getCopiesForContract(contractId).forEach(({ groupKey, percentage, splitId, companyName }) => {
        const factor = percentage / 100;
        const scaledRows: ContractBudget[] = rows.map((r) => ({
          ...r,
          amount_uf: r.amount_uf * factor,
          company_names: companyName ? [companyName] : r.company_names,
          groupKey,
          splitId,
          splitPercentage: companyName ? percentage : undefined,
        }));
        map.set(groupKey, scaledRows);
      });
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
  }, [filteredBudgets, sortBy, getCopiesForContract]);

  // Total CAPEX por COPIA (groupKey). OJO: se calcula el breakdown efectivo
  // (card amount o líneas) sobre las filas REALES sin escalar (`filteredBudgets`,
  // no las `contractGroups` ya escaladas) y RECIÉN AHÍ se multiplica por el %
  // de la copia -- si se llamara getEffectiveBudgetBreakdown directamente
  // sobre una fila con `amount_uf` ya escalado, el fallback a líneas de
  // detalle (`breakdown.grand`, que sale de authByBudget SIN escalar) daría
  // un monto real (100%) en vez del de esa copia. Mismo criterio que ya usa
  // contractYearAmounts para el disbursement.
  const authByContract = React.useMemo(() => {
    const byContract = new Map<string, ContractBudget[]>();
    filteredBudgets.forEach((b) => {
      const existing = byContract.get(b.contract_id) || [];
      existing.push(b);
      byContract.set(b.contract_id, existing);
    });
    const result: Record<string, AuthBreakdown> = {};
    byContract.forEach((rows, contractId) => {
      const real = { authorized: 0, unauthorized: 0, grand: 0 };
      rows.forEach((b) => {
        const eff = getEffectiveBudgetBreakdown(b, authByBudget[b.budget_id]);
        real.authorized += eff.authorized;
        real.unauthorized += eff.unauthorized;
        real.grand += eff.grand;
      });
      getCopiesForContract(contractId).forEach(({ groupKey, percentage }) => {
        const factor = percentage / 100;
        result[groupKey] = {
          authorized: real.authorized * factor,
          unauthorized: real.unauthorized * factor,
          grand: real.grand * factor,
        };
      });
    });
    return result;
  }, [filteredBudgets, authByBudget, getCopiesForContract]);

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

  // Contratos excluidos del dashboard (contracts.excluded_from_capex_dashboard
  // = true) -- se listan aparte, al final de la página, y no participan de
  // ningún card/PPT/Excel (esos solo usan activeBudgets/companyGroups, que ya
  // filtran los excluidos). No se les aplican los filtros de arriba: es un
  // listado simple, agrupado por contrato.
  // Entrada de la sección "Contratos excluidos": un contrato entero excluido
  // (contracts.excluded_from_capex_dashboard) o una copia individual excluida
  // (capex_company_splits.excluded_from_capex_dashboard) -- cada una con su
  // propio botón "Incluir" (ver handleToggleExcluded).
  interface ExcludedEntry {
    key: string;
    contractId: string;
    splitId?: string;
    contractName: string;
    clasificacion: string | null;
    companyNames: string[];
    amountUf: number;
    // Etiqueta de la copia, ej. "Autoplanet -- 80%" -- undefined si es el
    // contrato entero (sin split).
    splitLabel?: string;
  }
  const excludedContracts = React.useMemo<ExcludedEntry[]>(() => {
    const map = new Map<string, ContractBudget[]>();
    budgets.forEach((b) => {
      if (!b.excluded) return;
      const existing = map.get(b.contract_id) || [];
      existing.push(b);
      map.set(b.contract_id, existing);
    });
    const wholeContractExcludedIds = new Set(map.keys());
    const entries: ExcludedEntry[] = Array.from(map.entries()).map(([contractId, rows]) => ({
      key: contractId,
      contractId,
      contractName: rows[0].contract_name,
      clasificacion: rows[0].clasificacion,
      companyNames: rows[0].company_names,
      amountUf: rows.reduce((s, b) => s + (b.amount_uf || 0), 0),
    }));

    // Copias excluidas individualmente (split.excluded_from_capex_dashboard),
    // solo para contratos que NO están excluidos por completo (ese caso ya
    // los cubre arriba y aplica a todas sus copias).
    splitsByContract.forEach((splits, contractId) => {
      if (wholeContractExcludedIds.has(contractId)) return;
      const contractRows = budgets.filter((b) => b.contract_id === contractId);
      if (contractRows.length === 0) return;
      const totalUf = contractRows.reduce((s, b) => s + (b.amount_uf || 0), 0);
      splits
        .filter((s) => s.excluded_from_capex_dashboard)
        .forEach((s) => {
          entries.push({
            key: `split-${s.id}`,
            contractId,
            splitId: s.id,
            contractName: contractRows[0].contract_name,
            clasificacion: contractRows[0].clasificacion,
            companyNames: [s.company_name],
            amountUf: totalUf * (s.percentage / 100),
            splitLabel: `${s.company_name} -- ${s.percentage}%`,
          });
        });
    });

    return entries.sort((a, b) => a.contractName.localeCompare(b.contractName) || (a.splitLabel || "").localeCompare(b.splitLabel || ""));
  }, [budgets, splitsByContract]);

  // Filas de un contrato que pertenecen a `company` (mismo agrupamiento de 4
  // que companyGroups: Autoplanet/Agroplanet/Grupo Planet/Otra), respetando
  // año/búsqueda/empresa y TODOS los filtros salvo el indicado en `except`
  // -- para que los cards de clasificación/avance de esa empresa no
  // desaparezcan cuando su propio filtro los saca de `filteredBudgets`.
  const rowsForCompanyExcept = React.useCallback(
    (company: string, except: "clasificacion" | "avance") =>
      activeBudgets.filter((b) => {
        if (getCompanyGroupKey(b.company_names) !== company) return false;
        if (yearFilter !== "todos" && !contractHasYear(b.contract_id, parseInt(yearFilter))) return false;
        if (searchTerm && !b.contract_name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
        if (except !== "clasificacion" && clasificacionFilter.length > 0 && !clasificacionFilter.includes(b.clasificacion || "")) return false;
        if (except !== "avance" && avanceStatusFilter.length > 0 && !avanceStatusFilter.includes(b.capex_avance_status || "")) return false;
        return true;
      }),
    [activeBudgets, yearFilter, contractHasYear, searchTerm, clasificacionFilter, avanceStatusFilter]
  );

  // Per-company clasificacion stats -- dinámico según los "Tipos de CAPEX"
  // administrados en Admin (ya no son 3 fijos). Usa rowsForCompanyExcept
  // ("clasificacion") para que un tipo no seleccionado siga mostrando su
  // monto real bajo esa empresa en vez de desaparecer.
  const companyClasificacionStats = React.useMemo(() => {
    const stats: Record<string, Record<string, { uf: number; count: number }>> = {};
    companyGroups.forEach(({ company }) => {
      stats[company] = computeStatsByKey(rowsForCompanyExcept(company, "clasificacion"), (b) => b.clasificacion);
    });
    return stats;
  }, [companyGroups, rowsForCompanyExcept, computeStatsByKey]);

  // Mismo criterio que companyClasificacionStats, pero agrupado por Estado
  // de Avance CAPEX (Programado/En Curso/Terminado/Caído) en vez de
  // Clasificación -- para la segunda fila de cards por empresa.
  const companyAvanceStats = React.useMemo(() => {
    const stats: Record<string, Record<string, { uf: number; count: number }>> = {};
    companyGroups.forEach(({ company }) => {
      stats[company] = computeStatsByKey(rowsForCompanyExcept(company, "avance"), (b) => b.capex_avance_status);
    });
    return stats;
  }, [companyGroups, rowsForCompanyExcept, computeStatsByKey]);

  const yearBreakdownTotal = React.useMemo(() => {
    const m: Record<number, number> = {};
    contractYearAmounts.forEach((yearMap) => {
      Object.entries(yearMap).forEach(([year, clp]) => {
        m[Number(year)] = (m[Number(year)] || 0) + clp;
      });
    });
    return m;
  }, [contractYearAmounts]);

  // Los tres desgloses siguientes iteran por COPIA (getCopiesForContract),
  // usando el company_names propio de cada copia (el de su split, si tiene)
  // para el bucket/companyKey, y el contractYearAmounts de esa copia
  // (groupKey) para los montos -- así una copia 80% Autoplanet aporta solo su
  // 80% al bucket Autoplanet, y la copia 20% Agroplanet solo su 20% a Agroplanet.
  const yearBreakdownByCompanyBucket = React.useMemo(() => {
    const m: Record<string, Record<number, number>> = { Autoplanet: {}, Agroplanet: {}, Otros: {} };
    budgetRowsByContractAllYears.forEach((rows, contractId) => {
      getCopiesForContract(contractId).forEach(({ groupKey, companyName }) => {
        const bucket = getCompanyBucket(companyName ? [companyName] : rows[0].company_names);
        const yearMap = contractYearAmounts.get(groupKey) || {};
        Object.entries(yearMap).forEach(([year, clp]) => {
          m[bucket][Number(year)] = (m[bucket][Number(year)] || 0) + clp;
        });
      });
    });
    return m;
  }, [budgetRowsByContractAllYears, contractYearAmounts, getCopiesForContract]);

  // Mismo criterio que yearBreakdownByClasificacion, pero por Estado de
  // Avance CAPEX -- para poder descontar el CAPEX "Caído" de un año puntual
  // en la card de Capex Aprobado (ver handleToggleIncludeCaidos).
  const yearBreakdownByAvance = React.useMemo(() => {
    const m: Record<string, Record<number, number>> = {};
    budgetRowsByContractAllYears.forEach((rows, contractId) => {
      const avance = rows[0].capex_avance_status;
      if (!avance) return;
      getCopiesForContract(contractId).forEach(({ groupKey }) => {
        const yearMap = contractYearAmounts.get(groupKey) || {};
        if (!m[avance]) m[avance] = {};
        Object.entries(yearMap).forEach(([year, clp]) => {
          m[avance][Number(year)] = (m[avance][Number(year)] || 0) + clp;
        });
      });
    });
    return m;
  }, [budgetRowsByContractAllYears, contractYearAmounts, getCopiesForContract]);

  const yearBreakdownByClasificacion = React.useMemo(() => {
    const m: Record<string, Record<number, number>> = {};
    budgetRowsByContractAllYears.forEach((rows, contractId) => {
      const clasificacion = rows[0].clasificacion;
      if (!clasificacion) return;
      getCopiesForContract(contractId).forEach(({ groupKey }) => {
        const yearMap = contractYearAmounts.get(groupKey) || {};
        if (!m[clasificacion]) m[clasificacion] = {};
        Object.entries(yearMap).forEach(([year, clp]) => {
          m[clasificacion][Number(year)] = (m[clasificacion][Number(year)] || 0) + clp;
        });
      });
    });
    return m;
  }, [budgetRowsByContractAllYears, contractYearAmounts, getCopiesForContract]);

  const yearBreakdownByCompanyAndClasificacion = React.useMemo(() => {
    const m: Record<string, Record<string, Record<number, number>>> = {};
    budgetRowsByContractAllYears.forEach((rows, contractId) => {
      const clasificacion = rows[0].clasificacion;
      if (!clasificacion) return;
      getCopiesForContract(contractId).forEach(({ groupKey, companyName }) => {
        const companyKey = getCompanyGroupKey(companyName ? [companyName] : rows[0].company_names);
        const yearMap = contractYearAmounts.get(groupKey) || {};
        if (!m[companyKey]) m[companyKey] = {};
        if (!m[companyKey][clasificacion]) m[companyKey][clasificacion] = {};
        Object.entries(yearMap).forEach(([year, clp]) => {
          m[companyKey][clasificacion][Number(year)] = (m[companyKey][clasificacion][Number(year)] || 0) + clp;
        });
      });
    });
    return m;
  }, [budgetRowsByContractAllYears, contractYearAmounts, getCopiesForContract]);

  const totalCapexUF = React.useMemo(() => {
    let total = 0;
    contractGroups.forEach(([contractId]) => {
      const bd = authByContract[contractId];
      if (bd) total += bd.authorized + bd.unauthorized;
    });
    return total;
  }, [contractGroups, authByContract]);

  const contractsWithCapex = listedContracts;

  // Total CAPEX por empresa (Autoplanet / Agroplanet / Otros). A propósito NO
  // usa `filteredBudgets` (que ya viene filtrado por `companyFilter`) sino
  // `filterBudgetsExcept("company")` -- así una empresa que quede afuera del
  // filtro de Empresa actual sigue mostrando su monto real (bajo los demás
  // filtros activos) en vez de caer a $0/desaparecer; el propio card se
  // encarga de mostrarse "nublado" cuando no está seleccionada (ver render).
  const companyBucketTotals = React.useMemo(() => {
    const stats = computeStatsByKey(
      filterBudgetsExcept("company"),
      (b, copy) => getCompanyBucket(copy.companyName ? [copy.companyName] : b.company_names)
    );
    const buckets: Record<"Autoplanet" | "Agroplanet" | "Otros", { uf: number; count: number }> = {
      Autoplanet: stats.Autoplanet || { uf: 0, count: 0 },
      Agroplanet: stats.Agroplanet || { uf: 0, count: 0 },
      Otros: stats.Otros || { uf: 0, count: 0 },
    };
    return buckets;
  }, [filterBudgetsExcept, computeStatsByKey]);

  // Totales por "Tipo de CAPEX" -- dinámico según los tipos administrados en
  // Admin > Estados y Categorías > Tipos de CAPEX (ya no son 3 fijos). Mismo
  // criterio que companyBucketTotals: se calcula sobre
  // `filterBudgetsExcept("clasificacion")`, no sobre el listado ya filtrado
  // por clasificación, para que un tipo no seleccionado no desaparezca.
  const clasificacionTotals = React.useMemo(() => {
    return computeStatsByKey(filterBudgetsExcept("clasificacion"), (b) => b.clasificacion);
  }, [filterBudgetsExcept, computeStatsByKey]);

  // Totales por Estado de Avance CAPEX (Terminado/En Curso/Programado/Caído)
  // -- misma lógica que clasificacionTotals, para la tercera fila de cards
  // generales.
  const avanceTotals = React.useMemo(() => {
    return computeStatsByKey(filterBudgetsExcept("avance"), (b) => b.capex_avance_status);
  }, [filterBudgetsExcept, computeStatsByKey]);

  const handleExportPPT = async () => {
    try {
      toast.info("Generando presentación...");

      const pptCompanyGroups = companyGroups.map(({ company, contracts }) => {
        const stats = companyClasificacionStats[company] || {};
        const byType = clasificacionTypes
          .filter((t) => stats[t.name])
          .map((t) => ({
            name: t.name,
            color: t.color,
            uf: stats[t.name].uf,
            count: stats[t.name].count,
            yearBreakdown: yearBreakdownByCompanyAndClasificacion[company]?.[t.name],
          }));
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
        .map((t) => ({
          name: t.name,
          color: t.color,
          uf: clasificacionTotals[t.name].uf,
          count: clasificacionTotals[t.name].count,
          yearBreakdown: yearBreakdownByClasificacion[t.name],
        }));

      await generateCapexPPT({
        year: yearFilter !== "todos" ? yearFilter : new Date().getFullYear().toString(),
        ufValue: ufValue || 0,
        totalCapexUF,
        clasificacionTotals: clasifTotalsArr,
        totalLocales: contractsWithCapex.length,
        companyGroups: pptCompanyGroups,
        totalYearBreakdown: yearBreakdownTotal,
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
        const dateRange = contractInvestmentInfo[contractId];
        return {
          contract_id: contractId,
          contract_name: cBudgets[0].contract_name,
          clasificacion: cBudgets[0].clasificacion,
          company_names: cBudgets[0].company_names,
          superficie: cBudgets[0].superficie || 0,
          year: cBudgets[0].year,
          budget_ids: cBudgets.map((b) => b.budget_id),
          legacy_amount_uf: legacy,
          investment_start: dateRange?.start ?? null,
          investment_end: dateRange?.end ?? null,
        };
      });
      const label = yearFilter !== "todos" ? yearFilter : "todos";
      const result = await exportCapexToExcel(payload, ufValue || 0, label, yearBreakdownTotal);
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

  // Cuando `splitId` viene definido, la exclusión actúa sobre esa copia
  // (capex_company_splits) en vez del contrato completo -- excluir la copia
  // de Autoplanet no afecta la copia de Agroplanet del mismo contrato.
  const handleToggleExcluded = async (target: { contractId: string; splitId?: string }, excluded: boolean) => {
    if (target.splitId) {
      const { error } = await (supabase as any)
        .from("capex_company_splits")
        .update({ excluded_from_capex_dashboard: excluded })
        .eq("id", target.splitId);
      if (error) {
        toast.error(excluded ? "Error al excluir la copia" : "Error al incluir la copia");
        return;
      }
      setSplitsByContract((prev) => {
        const next = new Map(prev);
        const splits = next.get(target.contractId);
        if (splits) {
          next.set(
            target.contractId,
            splits.map((s) => (s.id === target.splitId ? { ...s, excluded_from_capex_dashboard: excluded } : s))
          );
        }
        return next;
      });
      toast.success(excluded ? "Copia excluida del dashboard" : "Copia incluida nuevamente");
      return;
    }
    const { error } = await supabase
      .from("contracts")
      .update({ excluded_from_capex_dashboard: excluded } as never)
      .eq("id", target.contractId);
    if (error) {
      toast.error(excluded ? "Error al excluir el contrato" : "Error al incluir el contrato");
      return;
    }
    setBudgets(prev => prev.map(b => b.contract_id === target.contractId ? { ...b, excluded } : b));
    toast.success(excluded ? "Contrato excluido del dashboard" : "Contrato incluido nuevamente");
  };

  // Forzar/quitar manualmente el año de CAPEX de un contrato
  // (contracts.capex_year_override) -- reversible: pasar `year: null` vuelve
  // al año derivado automáticamente. Aplica al contrato completo (a todas
  // sus copias si tiene split entre empresas, no una por una).
  const handleSetYearOverride = async (contractId: string, year: number | null) => {
    const { error } = await supabase
      .from("contracts")
      .update({ capex_year_override: year } as never)
      .eq("id", contractId);
    if (error) {
      toast.error("Error al forzar el año de CAPEX");
      return;
    }
    setBudgets(prev => prev.map(b => b.contract_id === contractId ? { ...b, capexYearOverride: year } : b));
    toast.success(year ? `Año de CAPEX forzado a ${year}` : "Año de CAPEX vuelto a automático");
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
  // Miles de millones de $ (billones), para la card de Capex Aprobado --
  // pedido explícito de Matias, sin conversión a UF.
  // Millones de $ (MM$), para la card de Capex Aprobado -- pedido explícito
  // de Matias, sin conversión a UF. Todo se redondea a millones ANTES de
  // restar (no CLP crudo) para que Disponible = Aprobado - Total dé un
  // número consistente con lo que se ve en pantalla.
  const fmtMM = (mm: number) => `mm $${Math.round(mm).toLocaleString("es-CL")}`;

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

        <div className="flex gap-4 items-stretch">
          {/* Card de Capex Aprobado vs. Total vs. Disponible -- alta y angosta,
              a la izquierda, con una sección por cada año que tenga un
              presupuesto aprobado cargado ("Presupuestos Aprobados"). Ocupa la
              misma altura que las dos filas de cards de la derecha juntas
              (items-stretch + h-full). Todo en millones de $ (mm$), sin
              conversión a UF. */}
          {/* Card "Capex Aprobado" -- ahora es también el único punto de
              entrada a la gestión de presupuestos aprobados (antes un botón
              aparte en el header): clickear el título abre el diálogo. Título
              grande arriba, card con justificación superior (no centrado). */}
          <Card className="w-64 shrink-0">
            <CardContent className="p-4 h-full flex flex-col justify-start gap-5">
              <button
                type="button"
                onClick={() => setApprovedBudgetsOpen(true)}
                className="flex items-center gap-2 text-left hover:opacity-70 transition-opacity"
                title="Gestionar Presupuestos Aprobados"
              >
                <Wallet className="h-6 w-6 text-primary shrink-0" />
                <p className="text-lg font-bold">Capex Aprobado</p>
              </button>

              {Object.keys(approvedBudgetsByYear).length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Todavía no hay presupuestos cargados. Tocá el título para agregar uno.
                </p>
              ) : (() => {
                const years = Object.keys(approvedBudgetsByYear).map(Number).sort((a, b) => b - a);
                const caidoLabel = AVANCE_CARD_ORDER[3]; // "Caído"
                // Disponible de cada año, sumando los "Caídos" de ese año SOLO
                // si su propio botón está activo -- no hay un botón general,
                // el Disponible Total es simplemente la suma de estos.
                const disponibleByYear = years.map((year) => {
                  const row = approvedBudgetsByYear[year];
                  const aprobadoMM = Math.round((row.amount_clp || 0) / 1_000_000);
                  const totalMM = Math.round((yearBreakdownTotal[year] || 0) / 1_000_000);
                  const caidosMM = row.includeCaidos
                    ? Math.round((yearBreakdownByAvance[caidoLabel]?.[year] || 0) / 1_000_000)
                    : 0;
                  return { year, aprobadoMM, totalMM, disponibleMM: aprobadoMM - totalMM + caidosMM };
                });
                const disponibleTotalMM = disponibleByYear.reduce((s, d) => s + d.disponibleMM, 0);
                return (
                  <>
                    {disponibleByYear.map(({ year, aprobadoMM, totalMM, disponibleMM }) => {
                      const row = approvedBudgetsByYear[year];
                      return (
                        <div key={year} className="space-y-2">
                          <p className="text-sm font-medium">{year}</p>
                          {/* Texto justificado a la izquierda, montos justificados
                              a la derecha -- misma columna para los tres, así
                              quedan alineados entre sí. */}
                          <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 items-baseline">
                            <span className="text-sm text-muted-foreground">Ppto. {year}</span>
                            <span className="text-sm font-semibold text-right">{fmtMM(aprobadoMM)}</span>
                            <span className="text-sm text-muted-foreground">Aprob. Gasto {year}</span>
                            <span className="text-sm font-semibold text-right">{fmtMM(totalMM)}</span>
                            <span className="text-sm text-muted-foreground border-t pt-1.5">Disponible</span>
                            <span className={`text-sm font-bold text-right border-t pt-1.5 ${disponibleMM < 0 ? "text-destructive" : "text-green-600"}`}>
                              {fmtMM(disponibleMM)}
                            </span>
                          </div>
                          <Button
                            variant={row.includeCaidos ? "default" : "outline"}
                            size="sm"
                            className="w-full text-xs h-7"
                            title={`Sumar al Disponible el CAPEX de los contratos "${caidoLabel}" de ${year} (reversible)`}
                            onClick={() => handleToggleIncludeCaidos(year)}
                          >
                            {row.includeCaidos ? "Disponible sumando caídos" : "Sumar Caídos"}
                          </Button>
                        </div>
                      );
                    })}

                    {/* Disponible Total -- suma de los Disponibles de todos los
                        años, cada uno con o sin sus Caídos según su propio
                        botón (no hay un botón "Caídos" general). Solo tiene
                        sentido con más de un año cargado. */}
                    {disponibleByYear.length > 1 && (
                      <div className="pt-2 border-t-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Disponible Total</span>
                          <span className={`text-base font-bold ${disponibleTotalMM < 0 ? "text-destructive" : "text-green-600"}`}>
                            {fmtMM(disponibleTotalMM)}
                          </span>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </CardContent>
          </Card>

          <div className="flex-1 space-y-4">
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
                className="relative cursor-pointer transition-colors hover:bg-muted/50"
              >
                <YearBreakdownChips breakdown={yearBreakdownTotal} activeYear={yearFilter !== "todos" ? parseInt(yearFilter) : undefined} />
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
                // "Nublado" (no oculto) cuando hay OTRAS empresas seleccionadas y
                // esta no es una de ellas -- sigue siendo clickeable para sumarla
                // al filtro (ej. Autoplanet + Agroplanet juntos).
                const dimmed = companyFilter.length > 0 && !active;
                const accentClass = i === 0 ? "text-chart-1" : i === 1 ? "text-chart-2" : "text-chart-3";
                return (
                  <Card
                    key={bucket}
                    role="button"
                    tabIndex={0}
                    onClick={() => setCompanyFilter((prev) => toggleArrayValue(prev, bucket))}
                    onKeyDown={(e) => { if (e.key === "Enter") setCompanyFilter((prev) => toggleArrayValue(prev, bucket)); }}
                    title={`Filtrar por ${bucket}`}
                    className={`relative cursor-pointer transition-all hover:bg-muted/50 hover:opacity-100 ${active ? "ring-2 ring-primary" : ""} ${dimmed ? "opacity-40" : ""}`}
                  >
                    <YearBreakdownChips breakdown={yearBreakdownByCompanyBucket[bucket]} activeYear={yearFilter !== "todos" ? parseInt(yearFilter) : undefined} />
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
                    // "Nublado" (no oculto) cuando hay otros tipos seleccionados y
                    // este no es uno de ellos -- sigue siendo clickeable para
                    // sumarlo al filtro (ej. Nuevo + Reemplazo juntos).
                    const dimmed = clasificacionFilter.length > 0 && !active;
                    return (
                      <Card
                        key={t.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setClasificacionFilter((prev) => toggleArrayValue(prev, t.name))}
                        onKeyDown={(e) => { if (e.key === "Enter") setClasificacionFilter((prev) => toggleArrayValue(prev, t.name)); }}
                        title={`Filtrar por ${t.name}`}
                        className={`relative cursor-pointer transition-all hover:bg-muted/50 hover:opacity-100 ${active ? "ring-2 ring-primary" : ""} ${dimmed ? "opacity-40" : ""}`}
                      >
                        <YearBreakdownChips breakdown={yearBreakdownByClasificacion[t.name]} activeYear={yearFilter !== "todos" ? parseInt(yearFilter) : undefined} />
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

            {/* Summary Cards Row 3: por Estado de Avance CAPEX -- orden fijo
                Terminado/En Curso/Programado/Caído, no el display_order de Admin. */}
            {Object.keys(avanceTotals).length > 0 && (
              <div className="grid gap-4 md:grid-cols-4">
                {avanceStatusTypesOrdered
                  .filter((t) => avanceTotals[t.name])
                  .map((t) => {
                    const totals = avanceTotals[t.name];
                    const active = avanceStatusFilter.includes(t.name);
                    const dimmed = avanceStatusFilter.length > 0 && !active;
                    return (
                      <Card
                        key={t.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setAvanceStatusFilter((prev) => toggleArrayValue(prev, t.name))}
                        onKeyDown={(e) => { if (e.key === "Enter") setAvanceStatusFilter((prev) => toggleArrayValue(prev, t.name)); }}
                        title={`Filtrar por ${t.name}`}
                        className={`relative cursor-pointer transition-all hover:bg-muted/50 hover:opacity-100 ${active ? "ring-2 ring-primary" : ""} ${dimmed ? "opacity-40" : ""}`}
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
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label className="text-xs font-medium text-muted-foreground">Buscar</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar local..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Año</label>
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
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Empresa</label>
            <MultiSelectFilter
              className="w-[160px]"
              placeholder="Todas"
              value={companyFilter}
              onChange={setCompanyFilter}
              options={[
                { value: "Autoplanet", label: "Autoplanet" },
                { value: "Agroplanet", label: "Agroplanet" },
                { value: "Otros", label: "Otros" },
              ].filter((o) => availableCompanyBuckets.has(o.value) || companyFilter.includes(o.value))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Clasificación</label>
            <MultiSelectFilter
              className="w-[190px]"
              placeholder="Todas"
              value={clasificacionFilter}
              onChange={setClasificacionFilter}
              options={clasificacionTypes
                .filter((t) => availableClasificaciones.has(t.name) || clasificacionFilter.includes(t.name))
                .map((t) => ({
                  value: t.name,
                  label: t.name,
                  colorDotClassName: `bg-${t.color}-500`,
                }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Avance</label>
            <MultiSelectFilter
              className="w-[190px]"
              placeholder="Todos"
              value={avanceStatusFilter}
              onChange={setAvanceStatusFilter}
              options={avanceStatusTypes
                .filter((t) => availableAvanceStatuses.has(t.name) || avanceStatusFilter.includes(t.name))
                .map((t) => ({
                  value: t.name,
                  label: t.name,
                  colorDotClassName: `bg-${t.color}-500`,
                }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Ordenar</label>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nombre">Nombre</SelectItem>
                <SelectItem value="empresa">Empresa</SelectItem>
                <SelectItem value="clasificacion">Clasificación</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {hasActiveFilters && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-transparent select-none">Limpiar</label>
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-2">
                <X className="h-4 w-4" />
                Limpiar Filtro
              </Button>
            </div>
          )}
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
              const isCompanyExpanded = isAnyFilterActive || expandedCompanies.has(company);
              return (
                <div key={company} className="space-y-3">
                  {/* Company header -- el chevrón colapsa/expande el listado de
                      contratos de abajo (las cards de clasificación/avance
                      siempre quedan visibles). */}
                  <div
                    className="flex items-center gap-2 cursor-pointer select-none"
                    onClick={() => toggleCompanyExpanded(company)}
                  >
                    <ChevronRight className={`h-5 w-5 shrink-0 transition-transform duration-200 text-muted-foreground ${isCompanyExpanded ? "rotate-90" : ""}`} />
                    <CompanyLogo companyName={company} size="md" />
                    <h2 className="text-lg font-semibold text-foreground">{company}</h2>
                    <Badge variant="secondary" className="text-xs">{contracts.length} {contracts.length === 1 ? "local" : "locales"}</Badge>
                  </div>

                  {/* Per-company clasificacion cards -- dinámico según Tipos de CAPEX.
                      Clickeables: mismo filtro de tipo que las cards de arriba
                      (acumulativo). En una sola línea (una columna por card, sin
                      límite fijo de 3) -- más angostas que antes. */}
                  {(() => {
                    const companyClasifCards = clasificacionTypes.filter((t) => stats?.[t.name]);
                    if (companyClasifCards.length === 0) return null;
                    return (
                      <div
                        className="grid gap-3"
                        style={{ gridTemplateColumns: `repeat(${companyClasifCards.length}, minmax(0, 1fr))` }}
                      >
                        {companyClasifCards.map((t) => {
                          const s = stats[t.name];
                          const active = clasificacionFilter.includes(t.name);
                          const dimmed = clasificacionFilter.length > 0 && !active;
                          return (
                            <Card
                              key={t.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => setClasificacionFilter((prev) => toggleArrayValue(prev, t.name))}
                              onKeyDown={(e) => { if (e.key === "Enter") setClasificacionFilter((prev) => toggleArrayValue(prev, t.name)); }}
                              title={`Filtrar por ${t.name}`}
                              className={`relative cursor-pointer transition-all hover:bg-muted/50 hover:opacity-100 ${active ? "ring-2 ring-primary" : ""} ${dimmed ? "opacity-40" : ""}`}
                            >
                              <YearBreakdownChips breakdown={yearBreakdownByCompanyAndClasificacion[company]?.[t.name]} activeYear={yearFilter !== "todos" ? parseInt(yearFilter) : undefined} />
                              <CardContent className="p-3 flex items-center gap-2">
                                <span className={`w-2.5 h-2.5 rounded-full bg-${t.color}-500 shrink-0`} />
                                <div className="min-w-0">
                                  <p className="text-xs text-muted-foreground truncate">{t.name} ({s.count})</p>
                                  <p className="text-sm font-bold truncate">{formatCLP(s.uf * currentUF)}</p>
                                  <p className="text-xs text-muted-foreground">({fmtUF(s.uf)} UF)</p>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {/* Segunda fila: montos por Estado de Avance CAPEX
                      (Programado/En Curso/Terminado/Caído) -- mismo criterio
                      que la fila de clasificación de arriba. */}
                  {(() => {
                    const companyAvanceCards = avanceStatusTypesOrdered.filter((t) => companyAvanceStats[company]?.[t.name]);
                    if (companyAvanceCards.length === 0) return null;
                    return (
                      <div
                        className="grid gap-3"
                        style={{ gridTemplateColumns: `repeat(${companyAvanceCards.length}, minmax(0, 1fr))` }}
                      >
                        {companyAvanceCards.map((t) => {
                          const s = companyAvanceStats[company][t.name];
                          const active = avanceStatusFilter.includes(t.name);
                          const dimmed = avanceStatusFilter.length > 0 && !active;
                          return (
                            <Card
                              key={t.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => setAvanceStatusFilter((prev) => toggleArrayValue(prev, t.name))}
                              onKeyDown={(e) => { if (e.key === "Enter") setAvanceStatusFilter((prev) => toggleArrayValue(prev, t.name)); }}
                              title={`Filtrar por ${t.name}`}
                              className={`relative cursor-pointer transition-all hover:bg-muted/50 hover:opacity-100 ${active ? "ring-2 ring-primary" : ""} ${dimmed ? "opacity-40" : ""}`}
                            >
                              <CardContent className="p-3 flex items-center gap-2">
                                <span className={`w-2.5 h-2.5 rounded-full bg-${t.color}-500 shrink-0`} />
                                <div className="min-w-0">
                                  <p className="text-xs text-muted-foreground truncate">{t.name} ({s.count})</p>
                                  <p className="text-sm font-bold truncate">{formatCLP(s.uf * currentUF)}</p>
                                  <p className="text-xs text-muted-foreground">({fmtUF(s.uf)} UF)</p>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {/* Contracts list -- colapsable con el chevrón del header
                      (las cards de arriba siempre quedan visibles). */}
                  {isCompanyExpanded && (
                  <div className="space-y-2">
                    {contracts.map(([groupKey, contractBudgets]) => {
                      // Contrato real (para navegación/acciones que operan sobre
                      // `contracts`/BudgetModule) -- distinto de `groupKey` cuando
                      // esta fila es una copia con split (ver contractGroups).
                      const contractId = contractBudgets[0].contract_id;
                      const splitId = contractBudgets[0].splitId;
                      const splitPercentage = contractBudgets[0].splitPercentage;
                      const capexYearOverride = contractBudgets[0].capexYearOverride;
                      const isExpanded = expandedContract === groupKey;
                      const contractName = contractBudgets[0].contract_name;
                      const clasificacion = contractBudgets[0].clasificacion;
                      const avanceStatus = contractBudgets[0].capex_avance_status;
                      const companyNames = contractBudgets[0].company_names;
                      const selectedYear = yearFilter !== "todos" ? parseInt(yearFilter) : contractBudgets[0].year;
                      const breakdown = authByContract[groupKey] || { authorized: 0, unauthorized: 0 };
                      const superficie = contractBudgets[0].superficie || 0;

                      const authCLP = breakdown.authorized * currentUF;
                      const unauthCLP = breakdown.unauthorized * currentUF;
                      const totalUFVal = breakdown.authorized + breakdown.unauthorized;
                      const ufM2 = superficie > 0 ? totalUFVal / superficie : 0;
                      // Contrato "autorizado en negociación" sin presupuesto CAPEX
                      // real todavía -- el monto mostrado es el Capex Estimado del
                      // Business Case Financiero, no un presupuesto ya cargado.
                      const isEstimatedFromBusinessCase = contractBudgets.every((b) => b.budget_id.startsWith("negotiation-"));

                      return (
                        <Collapsible
                          key={groupKey}
                          open={isExpanded}
                          onOpenChange={(open) => setExpandedContract(open ? groupKey : null)}
                        >
                          <Card>
                            <CollapsibleTrigger asChild>
                              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                                <div className="grid grid-cols-[24px_auto_200px_340px_190px_190px_1fr_64px] items-center gap-3">
                                  <ChevronDown className={`h-5 w-5 shrink-0 transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`} />
                                  <CompanyLogo companyNames={companyNames} size="sm" />
                                  <div className="min-w-0">
                                    <CardTitle className="text-base whitespace-nowrap">
                                      {contractName}
                                    </CardTitle>
                                    {(splitId || capexYearOverride) && (
                                      <div className="flex flex-wrap gap-1 mt-0.5">
                                        {splitId && (
                                          <Badge variant="outline" className="text-[10px]">
                                            {companyNames[0]} · {splitPercentage}%
                                          </Badge>
                                        )}
                                        {capexYearOverride && (
                                          <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300" title="Año de CAPEX forzado manualmente">
                                            Ppto {capexYearOverride}
                                          </Badge>
                                        )}
                                      </div>
                                    )}
                                    {contractInvestmentInfo[contractId] && (
                                      // Espejo de "Cartas Gantt - Vista General" (/reports): mismo
                                      // texto "N tareas · Fecha término" por línea de contrato.
                                      <p className="text-xs text-muted-foreground">
                                        {contractInvestmentInfo[contractId].timelineName && <>{contractInvestmentInfo[contractId].timelineName} · </>}
                                        {contractInvestmentInfo[contractId].taskCount} tarea{contractInvestmentInfo[contractId].taskCount !== 1 ? "s" : ""} · Fecha término:{" "}
                                        <span className="font-medium text-foreground">
                                          {format(parseISO(contractInvestmentInfo[contractId].end), "dd/MM/yyyy")}
                                        </span>
                                      </p>
                                    )}
                                  </div>
                                  {/* Espejo del desglose de pagos (Anticipo/Pago 1/Pago 2) de
                                      "Cartas Gantt - Vista General" en /reports -- misma columna
                                      dedicada, no apilado bajo el nombre del contrato. */}
                                  <div className="flex items-center gap-4 text-xs border-l pl-4 min-w-0">
                                    {contractInvestmentInfo[contractId]?.disbursement && (() => {
                                      const d = contractInvestmentInfo[contractId].disbursement!;
                                      return (
                                        <>
                                          <div className="text-center">
                                            <div className="text-muted-foreground mb-0.5">Anticipo (30%)</div>
                                            <div className="font-medium">{formatCLP(d.anticipo)}</div>
                                            <div className="text-[10px] text-muted-foreground">{format(parseISO(d.startDate), "dd/MM/yyyy")}</div>
                                          </div>
                                          <div className="text-center">
                                            <div className="text-muted-foreground mb-0.5">Estado Pago 1 (50%)</div>
                                            <div className="font-medium">{formatCLP(d.pago1)}</div>
                                            <div className="text-[10px] text-muted-foreground">{format(parseISO(d.midDate), "dd/MM/yyyy")}</div>
                                          </div>
                                          <div className="text-center">
                                            <div className="text-muted-foreground mb-0.5">Estado Pago 2 (20%)</div>
                                            <div className="font-medium">{formatCLP(d.pago2)}</div>
                                            <div className="text-[10px] text-muted-foreground">{format(parseISO(d.endDate), "dd/MM/yyyy")}</div>
                                          </div>
                                        </>
                                      );
                                    })()}
                                  </div>
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
                                        {/* El ratio UF/m² se calcula siempre que haya superficie
                                            cargada, sea o no un monto real (con o sin presupuesto
                                            CAPEX todavía) -- "Est. Business Case" es solo un dato
                                            adicional, nunca debe tapar el UF/m² cuando corresponde. */}
                                        {superficie > 0 && (
                                          <div className="text-xs text-muted-foreground">
                                            UF {fmtUF(ufM2)}/m²
                                          </div>
                                        )}
                                        {isEstimatedFromBusinessCase && (
                                          <div className="text-xs text-muted-foreground italic" title="Todavía no tiene presupuesto CAPEX cargado -- este es el Capex Estimado del Business Case Financiero">
                                            Est. Business Case
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
                                    <YearOverrideButton
                                      currentOverride={capexYearOverride}
                                      onSet={(year) => handleSetYearOverride(contractId, year)}
                                    />
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      title="Excluir del dashboard de CAPEX"
                                      onClick={() => handleToggleExcluded({ contractId, splitId }, true)}
                                    >
                                      <EyeOff className="h-4 w-4" />
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
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Contratos excluidos -- no cuentan en cards/PPT/Excel de arriba.
            Sección aparte al final, colapsable, con acción para reincluir. */}
        {excludedContracts.length > 0 && (
          <Collapsible open={excludedSectionOpen} onOpenChange={setExcludedSectionOpen}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                  <div className="flex items-center gap-2">
                    <ChevronDown className={`h-5 w-5 shrink-0 transition-transform duration-200 ${excludedSectionOpen ? '' : '-rotate-90'}`} />
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-base">Contratos excluidos</CardTitle>
                    <Badge variant="secondary" className="text-xs">
                      {excludedContracts.length} {excludedContracts.length === 1 ? "contrato" : "contratos"}
                    </Badge>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 space-y-2">
                  {excludedContracts.map((entry) => (
                    <div
                      key={entry.key}
                      className="flex items-center justify-between gap-3 rounded-md border p-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <CompanyLogo companyNames={entry.companyNames} size="sm" />
                        <span className="text-sm font-medium truncate">
                          {entry.contractName}
                          {entry.splitLabel && (
                            <span className="text-muted-foreground font-normal"> ({entry.splitLabel})</span>
                          )}
                        </span>
                        {entry.clasificacion && (
                          <Badge variant="outline" className={`text-xs shrink-0 ${getClasificacionColor(entry.clasificacion)}`}>
                            {entry.clasificacion}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {entry.amountUf > 0 ? `${fmtUF(entry.amountUf)} UF` : "Sin CAPEX"}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1"
                          title="Incluir nuevamente en el dashboard de CAPEX"
                          onClick={() => handleToggleExcluded({ contractId: entry.contractId, splitId: entry.splitId }, false)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Incluir
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}
      </div>
      <CapexTemplateManager open={templateOpen} onOpenChange={setTemplateOpen} />
      <ApprovedBudgetsDialog
        open={approvedBudgetsOpen}
        onOpenChange={(open) => {
          setApprovedBudgetsOpen(open);
          if (!open) loadApprovedBudgets();
        }}
      />
    </div>
  );
}
