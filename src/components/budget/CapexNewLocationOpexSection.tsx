import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCLP } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Loader2, Building2, CalendarClock } from "lucide-react";
import {
  buildContractMonths,
  buildItemMonths,
  OPEX_CATEGORIES,
  OPEX_ITEM_CATEGORIES,
  type ContractVersionInput,
  type MonthlyByCategory,
  type OpexCategory,
  type OpexItemCategory,
} from "@/lib/budget/newLocationOpex";
import { defaultUFProjection, projectedUFSeries } from "@/lib/budget/ufProjection";
import { format, parseISO } from "date-fns";
import { CompanyLogo } from "@/components/contracts/CompanyLogo";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// Categorías y cálculo mensual viven en @/lib/budget/newLocationOpex (misma
// lógica que usa el Excel). Los Ítems informativos no tienen canon, así que no
// participan de Arriendo.
type Category = OpexCategory;
const CATEGORIES = OPEX_CATEGORIES;
type ItemCategory = OpexItemCategory;
const ITEM_CATEGORIES = OPEX_ITEM_CATEGORIES;

interface ContractRow {
  id: string;
  name: string;
  superficie_edificada_local: number | null;
  metros_lineales_frente: number | null;
  contract_companies: { companies: { name: string | null } | null }[] | null;
}

// Mismo set de columnas que buildBCSeed/ContractDetail necesitan para
// computeArriendoPeriods, sobre la versión ACTUAL (is_current = true).
interface VersionRow extends ContractVersionInput {
  id: string;
  contract_id: string;
}

interface ManualOverride {
  contract_id: string;
  year: number;
  category: Category;
  monthly_amount_clp: number;
}

// Ítem de Presupuesto informativo (gantt_overview_budget_items) -- fecha de
// inicio según la Línea de tiempo general de Cartas Gantt (/reports), igual
// "date" que ya usa esa vista y la valorización CAPEX del ítem (ver
// CapexBudgetPlanningDialog). Los 3 campos de Opex se ingresan siempre en
// UF, nunca en CLP.
interface ItemRow {
  id: string;
  name: string;
  date: string;
  superficie_m2: number | null;
  ggcc_uf_m2: number | null;
  fondo_promocion_uf: number | null;
  otros_uf: number | null;
  contract_id: string | null;
  /** Empresas del contrato vinculado (si lo hay) -- solo para mostrar su logo. */
  companyNames?: string[];
}

/** Una fila (local/ítem × categoría × año) del Presupuesto Operativo, tal cual
 *  se muestra en pantalla -- usada por la descarga Excel de "Planificar
 *  Presupuesto" para no recalcular nada fuera de este componente. */
export interface OpexExportRow {
  kind: "Contrato" | "Informativo";
  name: string;
  company: string;
  category: string;
  /** Texto para la columna "Origen" del Excel. */
  origin: string;
  year: number;
  /** 12 montos mensuales en CLP (Ene..Dic), tal cual se muestran (ya con la UF estimada de cada mes). */
  months: number[];
  /** Monto en UF de cada mes; null = monto manual en pesos (no se proyecta). El Excel arma
   *  la fórmula "UF del mes × UF estimada del mes" con esto, sin volver a proyectar `months`. */
  monthsUf: (number | null)[];
}

export interface OpexExportData {
  loading: boolean;
  rows: OpexExportRow[];
}

interface Props {
  contractIds: string[];
  currentYear: number;
  targetYear: number;
  ufValue: number;
  /** Recibe los datos calculados cada vez que cambian (ver OpexExportData). */
  onExportDataChange?: (data: OpexExportData) => void;
  /** Ids/nombres (normalizados) de contratos que ya cuentan como CAPEX real
   *  en el dashboard -- excluye de esta lista cualquier ítem informativo
   *  que ya represente a uno de ellos (vinculado por id, o por nombre en
   *  ítems antiguos de texto libre), para no contarlo dos veces. */
  realContractIds: Set<string>;
  realContractNames: Set<string>;
}

// autoMonthlyUF (lib) necesita una fecha de inicio para ubicar cada mes
// dentro del contrato (monthOffset). Si contract_versions.effective_date no
// está cargada, se usa como respaldo la fecha del ítem del contrato en la
// Línea de tiempo general de Cartas Gantt (/reports -- gantt_overview_budget_items.date,
// ver fallbackDateByContract) -- esa es la fecha de inicio de pago de
// Arriendo/GGCC/Fondo de Promoción/Otros mientras el contrato no tenga su
// propia effective_date. Solo si NINGUNA de las dos existe, la categoría
// cae a manual (antes, sin effective_date, siempre caía a manual aunque
// hubiera una fecha útil en la Línea de tiempo general -- casos: Chicureo,
// Villarrica, Curauma).
const isMissing = {
  arriendo: (v: VersionRow, hasDate: boolean) => !hasDate || (!v.initial_rent && !v.regime_rent),
  ggcc: (v: VersionRow, hasDate: boolean) => !hasDate || (v.gastos_comunes_uf_m2 == null && v.gastos_comunes_percentage == null),
  fondo_promocion: (v: VersionRow, hasDate: boolean) => !hasDate || v.fondo_promocion_percentage == null,
  otros: (v: VersionRow, hasDate: boolean) => !hasDate || v.otros_egresos_amount == null,
};

export function CapexNewLocationOpexSection({ contractIds, currentYear, targetYear, ufValue, onExportDataChange, realContractIds, realContractNames }: Props) {
  const [loading, setLoading] = useState(false);
  const [contracts, setContracts] = useState<Record<string, ContractRow>>({});
  const [versions, setVersions] = useState<Record<string, VersionRow>>({});
  const [overrides, setOverrides] = useState<Record<string, ManualOverride>>({});
  // Fecha de respaldo (gantt_overview_budget_items.date) por contrato, para
  // cuando contract_versions.effective_date no está cargada -- ver isMissing.
  const [fallbackDateByContract, setFallbackDateByContract] = useState<Record<string, string>>({});
  const [items, setItems] = useState<ItemRow[]>([]);
  // Parte en true: el efecto de ítems siempre corre al montar, y así el
  // export Excel nunca ve "cargado" antes de tener datos.
  const [itemsLoading, setItemsLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Edición local de los inputs manuales (texto crudo, por "contractId::year::category").
  const [manualEdits, setManualEdits] = useState<Record<string, string>>({});
  // Edición local de los 3 campos Opex de los ítems informativos (texto
  // crudo, por "itemId::campo"), mismo patrón que manualEdits.
  const [itemEdits, setItemEdits] = useState<Record<string, string>>({});

  const overrideKey = (contractId: string, year: number, category: Category) => `${contractId}::${year}::${category}`;
  const itemEditKey = (itemId: string, field: "ggcc_uf_m2" | "fondo_promocion_uf" | "otros_uf") => `${itemId}::${field}`;

  const sortedIds = useMemo(() => [...contractIds].sort(), [contractIds]);
  const idsKey = sortedIds.join(",");

  useEffect(() => {
    if (sortedIds.length === 0) {
      setContracts({});
      setVersions({});
      setOverrides({});
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [{ data: contractsData, error: cErr }, { data: versionsData, error: vErr }, { data: overridesData, error: oErr }, { data: fallbackDateRows, error: fErr }] =
          await Promise.all([
            supabase
              .from("contracts")
              .select("id, name, superficie_edificada_local, metros_lineales_frente, contract_companies(companies(name))")
              .in("id", sortedIds),
            supabase
              .from("contract_versions")
              .select(
                "id, contract_id, effective_date, initial_rent, regime_rent, initial_rent_is_uf_m2, regime_rent_is_uf_m2, duration_months, grace_months, gastos_comunes_methodology, gastos_comunes_uf_m2, gastos_comunes_uf_ml_frente, gastos_comunes_prorrata_kwh_clima, gastos_comunes_percentage, gastos_comunes_total_centro, gastos_comunes_tope, gastos_comunes_tope_type, adicional_administracion_percentage, gastos_comunes_fixed_admin_uf, has_extended_gastos_comunes, fondo_promocion_percentage, otros_egresos_amount, has_periodic_adjustments, first_adjustment_month, adjustment_periodicity_months, adjustment_type, adjustment_value, rent_escalations(id, month_number, amount, is_uf_m2)"
              )
              .in("contract_id", sortedIds)
              .eq("is_current", true),
            (supabase as any)
              .from("capex_new_location_budget")
              .select("contract_id, year, category, monthly_amount_clp")
              .in("contract_id", sortedIds),
            (supabase as any)
              .from("gantt_overview_budget_items")
              .select("contract_id, date")
              .in("contract_id", sortedIds)
              .order("date", { ascending: true }),
          ]);
        if (cErr) throw cErr;
        if (vErr) throw vErr;
        if (oErr) throw oErr;
        if (fErr) throw fErr;
        if (cancelled) return;

        const contractsMap: Record<string, ContractRow> = {};
        (contractsData || []).forEach((c: any) => { contractsMap[c.id] = c; });
        setContracts(contractsMap);

        const versionsMap: Record<string, VersionRow> = {};
        (versionsData || []).forEach((v: any) => { versionsMap[v.contract_id] = v; });
        setVersions(versionsMap);

        const overridesMap: Record<string, ManualOverride> = {};
        (overridesData || []).forEach((o: any) => {
          overridesMap[overrideKey(o.contract_id, o.year, o.category)] = o;
        });
        setOverrides(overridesMap);

        // Primera fecha (más antigua) de la Línea de tiempo general por
        // contrato -- respaldo cuando no hay effective_date.
        const fallbackMap: Record<string, string> = {};
        (fallbackDateRows || []).forEach((r: any) => {
          if (!fallbackMap[r.contract_id]) fallbackMap[r.contract_id] = r.date;
        });
        setFallbackDateByContract(fallbackMap);
      } catch (err) {
        console.error(err);
        toast.error("Error al cargar el presupuesto operativo de nuevos locales");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  // Ítems de Presupuesto informativos (gantt_overview_budget_items) con
  // fecha dentro de currentYear o targetYear -- independiente de
  // contractIds, no tienen contrato. Mismo criterio de fecha que la
  // valorización CAPEX de estos ítems (ver CapexBudgetPlanningDialog): la
  // fecha es la de la Línea de tiempo general de /reports.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setItemsLoading(true);
      try {
        const { data, error } = await (supabase as any)
          .from("gantt_overview_budget_items")
          .select("id, name, date, superficie_m2, ggcc_uf_m2, fondo_promocion_uf, otros_uf, contract_id")
          .gte("date", `${currentYear}-01-01`)
          .lte("date", `${targetYear}-12-31`)
          .order("date", { ascending: true });
        if (error) throw error;
        if (cancelled) return;
        // Excluye ítems que ya representan un contrato que cuenta como
        // CAPEX real (vinculado por id, o por nombre en ítems antiguos de
        // texto libre) -- evita el doble conteo (ej. "Chiguayante" en
        // Arrastre Y en Informativos).
        const filtered = (data || []).filter((it: ItemRow) =>
          it.contract_id ? !realContractIds.has(it.contract_id) : !realContractNames.has(it.name.trim().toLowerCase())
        );
        // Empresas de los contratos vinculados, para mostrar su logo.
        const linkedIds = Array.from(new Set(filtered.map((it: ItemRow) => it.contract_id).filter(Boolean))) as string[];
        const companiesByContract = new Map<string, string[]>();
        if (linkedIds.length > 0) {
          const { data: companyRows } = await supabase
            .from("contract_companies")
            .select("contract_id, companies (name)")
            .in("contract_id", linkedIds);
          ((companyRows || []) as unknown as { contract_id: string; companies: { name: string | null } | null }[]).forEach((cc) => {
            const name = cc.companies?.name;
            if (!name) return;
            companiesByContract.set(cc.contract_id, [...(companiesByContract.get(cc.contract_id) || []), name]);
          });
        }
        if (cancelled) return;
        setItems(filtered.map((it: ItemRow) => ({ ...it, companyNames: it.contract_id ? companiesByContract.get(it.contract_id) || [] : [] })));
      } catch (err) {
        console.error(err);
        toast.error("Error al cargar los ítems de presupuesto informativos");
      } finally {
        if (!cancelled) setItemsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentYear, targetYear]);

  // UF estimada de cada mes: la UF de HOY proyectada solo con la inflación desde
  // el mes actual (sin ninguna UF inicial fija); los meses anteriores usan la UF
  // de hoy -- ver @/lib/budget/ufProjection, misma fórmula que el Excel.
  const projection = useMemo(() => defaultUFProjection(ufValue), [ufValue]);
  const ufSeriesByYear = useMemo(
    () => ({ [currentYear]: projectedUFSeries(projection, currentYear), [targetYear]: projectedUFSeries(projection, targetYear) }),
    [projection, currentYear, targetYear]
  );

  const toggleExpanded = (contractId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(contractId)) next.delete(contractId);
      else next.add(contractId);
      return next;
    });
  };

  const saveManualOverride = async (contractId: string, year: number, category: Category, rawValue: string) => {
    const amount = rawValue.trim() === "" ? 0 : parseFloat(rawValue);
    const value = isNaN(amount) ? 0 : amount;
    const { error } = await (supabase as any)
      .from("capex_new_location_budget")
      .upsert(
        { contract_id: contractId, year, category, monthly_amount_clp: value, updated_at: new Date().toISOString() },
        { onConflict: "contract_id,year,category" }
      );
    if (error) {
      console.error(error);
      toast.error("Error al guardar el monto manual");
      return;
    }
    setOverrides((prev) => ({ ...prev, [overrideKey(contractId, year, category)]: { contract_id: contractId, year, category, monthly_amount_clp: value } }));
  };

  // Guarda directo en la fila del ítem (no hay tabla de overrides por
  // año/categoría como en contratos: un ítem informativo aplica el mismo
  // valor en ambos años desde su fecha).
  const saveItemField = async (itemId: string, field: "ggcc_uf_m2" | "fondo_promocion_uf" | "otros_uf", rawValue: string) => {
    const value = rawValue.trim() === "" ? null : parseFloat(rawValue);
    const parsed = value !== null && isNaN(value) ? null : value;
    const { error } = await (supabase as any)
      .from("gantt_overview_budget_items")
      .update({ [field]: parsed, updated_at: new Date().toISOString() })
      .eq("id", itemId);
    if (error) {
      console.error(error);
      toast.error("Error al guardar el monto manual");
      return;
    }
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, [field]: parsed } : it)));
  };

  // Separa las series de la lib en pesos (lo que se muestra y suma) y UF por mes
  // (lo que necesita el Excel).
  const splitSeries = <C extends string>(m: MonthlyByCategory<C>) => {
    const clp = {} as Record<C, { [year: number]: number[] }>;
    const uf = {} as Record<C, { [year: number]: (number | null)[] }>;
    (Object.keys(m) as C[]).forEach((k) => {
      clp[k] = {};
      uf[k] = {};
      Object.entries(m[k]).forEach(([year, series]) => {
        clp[k][Number(year)] = series.clp;
        uf[k][Number(year)] = series.uf;
      });
    });
    return { clp, uf };
  };

  // Para cada ítem informativo: 3 categorías × 12 meses × 2 años, a partir del
  // mes de su "date" (fecha de la Línea de tiempo general de /reports) -- sin
  // fecha de término definida, se proyecta indefinidamente hacia adelante en
  // ambos años. Sus montos se ingresan en UF y cada mes se valoriza con la UF
  // estimada de ESE mes.
  interface ItemMonthlyData {
    itemId: string;
    name: string;
    date: string;
    superficie_m2: number | null;
    companyNames: string[];
    monthly: Record<ItemCategory, { [year: number]: number[] }>;
    monthlyUf: Record<ItemCategory, { [year: number]: (number | null)[] }>;
  }
  const perItemData: ItemMonthlyData[] = useMemo(() => {
    return items.map((item) => {
      const { clp, uf } = splitSeries(buildItemMonths(item, [currentYear, targetYear], projection));
      return { itemId: item.id, name: item.name, date: item.date, superficie_m2: item.superficie_m2, companyNames: item.companyNames || [], monthly: clp, monthlyUf: uf };
    });
  }, [items, currentYear, targetYear, projection]);

  // Para cada contrato: 4 categorías × 12 meses × 2 años -- con el valor
  // automático (UF del mes × UF estimada del mes) o, si falta el dato fuente,
  // el override manual persistido en pesos (no se proyecta).
  interface ContractMonthlyData {
    contractId: string;
    name: string;
    companyNames: string[];
    missing: Record<Category, boolean>;
    monthly: Record<Category, { [year: number]: number[] }>; // pesos, 12 valores por año
    monthlyUf: Record<Category, { [year: number]: (number | null)[] }>; // UF por mes (null = manual)
    // true si el contrato no tiene ninguna versión (contract_versions con
    // is_current = true) -- típico de contratos aún "En Negociación" cuyo
    // CAPEX sale del Business Case (ver "Est. Business Case" en /capex), que
    // todavía no cargaron condiciones comerciales formales. Antes esto hacía
    // que el contrato desapareciera ENTERO de la lista, sin aviso -- ahora
    // se muestra igual, con las 4 categorías en modo manual.
    noVersion: boolean;
    // true si no hay effective_date en el contrato y se usó en su lugar la
    // fecha de la Línea de tiempo general de Cartas Gantt (/reports) como
    // respaldo para ubicar los meses de Arriendo/GGCC/Fondo Promoción/Otros.
    usedFallbackDate: boolean;
  }
  const perContractData: ContractMonthlyData[] = useMemo(() => {
    return sortedIds
      .map((contractId) => {
        const contract = contracts[contractId];
        if (!contract) return null;
        const version = versions[contractId];
        const fallbackDate = fallbackDateByContract[contractId] ?? null;
        const hasDate = !!version?.effective_date || !!fallbackDate;
        const companyNames = (contract.contract_companies || []).map((cc) => cc.companies?.name).filter(Boolean) as string[];
        const missing: Record<Category, boolean> = version
          ? {
              arriendo: isMissing.arriendo(version, hasDate),
              ggcc: isMissing.ggcc(version, hasDate),
              fondo_promocion: isMissing.fondo_promocion(version, hasDate),
              otros: isMissing.otros(version, hasDate),
            }
          : { arriendo: true, ggcc: true, fondo_promocion: true, otros: true };
        const { clp, uf } = splitSeries(
          buildContractMonths({
            version,
            superficie: contract.superficie_edificada_local,
            metrosLinealesFrente: contract.metros_lineales_frente,
            fallbackDate,
            missing,
            manualClp: (year, category) => overrides[overrideKey(contractId, year, category)]?.monthly_amount_clp || 0,
            years: [currentYear, targetYear],
            projection,
          })
        );
        return {
          contractId,
          name: contract.name,
          companyNames,
          missing,
          monthly: clp,
          monthlyUf: uf,
          noVersion: !version,
          usedFallbackDate: !version?.effective_date && !!fallbackDate,
        };
      })
      .filter((x): x is ContractMonthlyData => x !== null);
  }, [sortedIds, contracts, versions, overrides, fallbackDateByContract, currentYear, targetYear, projection]);

  const grandTotal = useMemo(() => {
    const totals: { [year: number]: number[] } = { [currentYear]: new Array(12).fill(0), [targetYear]: new Array(12).fill(0) };
    perContractData.forEach((c) => {
      [currentYear, targetYear].forEach((year) => {
        for (let m = 0; m < 12; m++) {
          CATEGORIES.forEach(({ key }) => {
            totals[year][m] += c.monthly[key][year][m] || 0;
          });
        }
      });
    });
    perItemData.forEach((it) => {
      [currentYear, targetYear].forEach((year) => {
        for (let m = 0; m < 12; m++) {
          ITEM_CATEGORIES.forEach(({ key }) => {
            totals[year][m] += it.monthly[key][year][m] || 0;
          });
        }
      });
    });
    return totals;
  }, [perContractData, perItemData, currentYear, targetYear]);

  // Filas planas para la descarga Excel (ver OpexExportData): mismos montos
  // que se ven en pantalla, por año y categoría.
  const exportRows: OpexExportRow[] = useMemo(() => {
    const rows: OpexExportRow[] = [];
    perContractData.forEach((c) => {
      [currentYear, targetYear].forEach((year) => {
        CATEGORIES.forEach(({ key, label }) => {
          rows.push({ kind: "Contrato", name: c.name, company: c.companyNames.join(", "), category: label, origin: c.missing[key] ? "Manual" : "Automático", year, months: c.monthly[key][year], monthsUf: c.monthlyUf[key][year] });
        });
      });
    });
    perItemData.forEach((it) => {
      [currentYear, targetYear].forEach((year) => {
        ITEM_CATEGORIES.forEach(({ key, label }) => {
          rows.push({ kind: "Informativo", name: it.name, company: it.companyNames.join(", "), category: label, origin: "UF ingresada", year, months: it.monthly[key][year], monthsUf: it.monthlyUf[key][year] });
        });
      });
    });
    return rows;
  }, [perContractData, perItemData, currentYear, targetYear]);

  useEffect(() => {
    onExportDataChange?.({ loading: loading || itemsLoading, rows: exportRows });
  }, [exportRows, loading, itemsLoading, onExportDataChange]);

  const sumYear = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

  // Total de un contrato sumando las 4 categorías en ambos años -- usado en
  // el encabezado colapsado de la card.
  const contractTotalBothYears = (c: ContractMonthlyData) => {
    let total = 0;
    [currentYear, targetYear].forEach((year) => {
      CATEGORIES.forEach(({ key }) => {
        total += sumYear(c.monthly[key][year]);
      });
    });
    return total;
  };

  // Mismo total, para un ítem informativo (3 categorías).
  const itemTotalBothYears = (it: ItemMonthlyData) => {
    let total = 0;
    [currentYear, targetYear].forEach((year) => {
      ITEM_CATEGORIES.forEach(({ key }) => {
        total += sumYear(it.monthly[key][year]);
      });
    });
    return total;
  };

  return (
    <div className="space-y-3 border-t pt-4">
      <p className="text-sm font-medium">
        Presupuesto Operativo de Nuevos Locales ({currentYear}-{targetYear})
      </p>
      <p className="text-xs text-muted-foreground">
        Estimación mensual (Arriendo, GGCC, Fondo de Promoción, Otros) para contratos "Nuevo" con CAPEX en {currentYear} o {targetYear},
        más los Ítems de Presupuesto informativos (GGCC, Fondo de Promoción, Otros -- sin Arriendo, no tienen canon) con fecha en ese rango.
        Calculado automáticamente cuando hay dato; si falta, se puede ingresar un monto manual (marcado "Manual").
      </p>

      {contractIds.length === 0 && items.length === 0 && !itemsLoading ? (
        <p className="text-xs text-muted-foreground border rounded-lg p-3">
          No hay contratos clasificación "Nuevo" ni ítems informativos con CAPEX/fecha en {currentYear} o {targetYear} todavía.
        </p>
      ) : (contractIds.length > 0 && loading) || itemsLoading ? (
        <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (
        <>
          {/* UF estimada por mes: cada mes de Arriendo/GGCC/Fondo Promoción/Otros
              automático = monto en UF × la UF estimada de ESE mes (ver
              @/lib/budget/ufProjection, misma fórmula que el Excel). */}
          <div className="rounded-lg border p-3 space-y-2">
            <p className="text-xs font-medium">Valor UF estimado</p>
            <p className="text-[11px] text-muted-foreground">
              Parte de la UF de hoy ({formatCLP(projection.baseUF)}, {MESES[projection.baseMonth - 1]} {projection.baseYear}) y crece solo con la
              inflación de {(projection.annualInflation * 100).toLocaleString("es-CL", { maximumFractionDigits: 1 })}% anual. Los meses anteriores usan la UF de hoy.
              Los montos manuales (en pesos) no se proyectan.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="text-left p-1 font-medium">Valor UF estimado</th>
                    {MESES.map((m) => (
                      <th key={m} className="text-right p-1 font-medium whitespace-nowrap">{m}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[currentYear, targetYear].map((year) => (
                    <tr key={year} className="border-t">
                      <td className="p-1 font-medium">{year}</td>
                      {ufSeriesByYear[year].map((v, i) => (
                        <td key={i} className="text-right p-1 whitespace-nowrap">{formatCLP(v)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Resumen gran total, por año */}
          <div className="rounded-lg bg-muted/50 p-3 space-y-2">
            <p className="text-xs font-medium">Total (todos los contratos)</p>
            {[currentYear, targetYear].map((year) => (
              <div key={year} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{year}</span>
                <span className="font-semibold">{formatCLP(sumYear(grandTotal[year]))}</span>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            {perContractData.map((c) => {
              const isOpen = expanded.has(c.contractId);
              return (
                <Collapsible key={c.contractId} open={isOpen} onOpenChange={() => toggleExpanded(c.contractId)}>
                  <div className="border rounded-lg">
                    <CollapsibleTrigger asChild>
                      <button type="button" className="w-full flex items-center gap-2 p-2 text-left hover:bg-muted/50 transition-colors">
                        {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                        {c.companyNames.length > 0 ? (
                          <CompanyLogo companyNames={c.companyNames} size="sm" className="h-5 w-5 shrink-0" />
                        ) : (
                          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="text-sm font-medium flex-1 break-words">{c.name}</span>
                        {c.noVersion && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0" title="El contrato no tiene condiciones comerciales cargadas (sin contract_versions) -- probablemente aún En Negociación.">
                            Sin condiciones comerciales
                          </Badge>
                        )}
                        {c.usedFallbackDate && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0" title="El contrato no tiene fecha de inicio de arriendo (effective_date) -- se usó la fecha de la Línea de tiempo general de Cartas Gantt (/reports).">
                            Fecha según Línea de tiempo general
                          </Badge>
                        )}
                        {c.companyNames.length > 0 && (
                          <span className="text-xs text-muted-foreground shrink-0">{c.companyNames.join(", ")}</span>
                        )}
                        <span className="text-xs font-semibold shrink-0 ml-2">
                          {formatCLP(contractTotalBothYears(c))}
                        </span>
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="p-3 pt-0 space-y-4">
                        {[currentYear, targetYear].map((year) => (
                          <div key={year} className="space-y-1">
                            <p className="text-xs font-semibold text-muted-foreground">{year}</p>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs border-collapse">
                                <thead>
                                  <tr>
                                    <th className="text-left p-1 font-medium">Categoría</th>
                                    {MESES.map((m) => (
                                      <th key={m} className="text-right p-1 font-medium whitespace-nowrap">{m}</th>
                                    ))}
                                    <th className="text-right p-1 font-medium">Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr className="text-muted-foreground">
                                    <td className="p-1 whitespace-nowrap italic">UF estimada</td>
                                    {ufSeriesByYear[year].map((v, i) => (
                                      <td key={i} className="text-right p-1 whitespace-nowrap">{formatCLP(v)}</td>
                                    ))}
                                    <td />
                                  </tr>
                                  {CATEGORIES.map(({ key, label }) => {
                                    const values = c.monthly[key][year];
                                    const total = sumYear(values);
                                    const missing = c.missing[key];
                                    return (
                                      <tr key={key} className="border-t">
                                        <td className="p-1 whitespace-nowrap">
                                          <div className="flex items-center gap-1">
                                            {label}
                                            {missing && <Badge variant="outline" className="text-[9px] px-1 py-0">Manual</Badge>}
                                          </div>
                                        </td>
                                        {missing ? (
                                          <td colSpan={12} className="p-1">
                                            <div className="flex items-center gap-1">
                                              <span className="text-[10px] text-muted-foreground whitespace-nowrap">$/mes (todo el año):</span>
                                              <Input
                                                type="number"
                                                className="h-6 w-28 text-xs"
                                                value={
                                                  manualEdits[overrideKey(c.contractId, year, key)] ??
                                                  String(overrides[overrideKey(c.contractId, year, key)]?.monthly_amount_clp ?? "")
                                                }
                                                onChange={(e) =>
                                                  setManualEdits((prev) => ({ ...prev, [overrideKey(c.contractId, year, key)]: e.target.value }))
                                                }
                                                onBlur={(e) => saveManualOverride(c.contractId, year, key, e.target.value)}
                                              />
                                            </div>
                                          </td>
                                        ) : (
                                          values.map((v, i) => (
                                            <td key={i} className="text-right p-1 whitespace-nowrap">{v > 0 ? formatCLP(v) : "-"}</td>
                                          ))
                                        )}
                                        <td className="text-right p-1 font-semibold whitespace-nowrap">{formatCLP(total)}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
            {perItemData.map((it) => {
              const isOpen = expanded.has(it.itemId);
              return (
                <Collapsible key={it.itemId} open={isOpen} onOpenChange={() => toggleExpanded(it.itemId)}>
                  <div className="border rounded-lg">
                    <CollapsibleTrigger asChild>
                      <button type="button" className="w-full flex items-center gap-2 p-2 text-left hover:bg-muted/50 transition-colors">
                        {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                        {it.companyNames.length > 0 ? (
                          <CompanyLogo companyNames={it.companyNames} size="sm" className="h-5 w-5 shrink-0" />
                        ) : (
                          <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="text-sm font-medium flex-1 break-words">{it.name}</span>
                        <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">Informativo</Badge>
                        <span className="text-xs text-muted-foreground shrink-0">{format(parseISO(it.date), "dd/MM/yyyy")}</span>
                        <span className="text-xs font-semibold shrink-0 ml-2">
                          {formatCLP(itemTotalBothYears(it))}
                        </span>
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="p-3 pt-0 space-y-4">
                        {it.superficie_m2 == null && (
                          <p className="text-[10px] text-amber-600">
                            Sin superficie cargada -- GGCC (ingresado en UF/m2) no se puede convertir a monto hasta que se cargue en "Ítems de Presupuesto informativos".
                          </p>
                        )}
                        {[currentYear, targetYear].map((year) => (
                          <div key={year} className="space-y-1">
                            <p className="text-xs font-semibold text-muted-foreground">{year}</p>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs border-collapse">
                                <thead>
                                  <tr>
                                    <th className="text-left p-1 font-medium">Categoría</th>
                                    {MESES.map((m) => (
                                      <th key={m} className="text-right p-1 font-medium whitespace-nowrap">{m}</th>
                                    ))}
                                    <th className="text-right p-1 font-medium">Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr className="text-muted-foreground">
                                    <td className="p-1 whitespace-nowrap italic">UF estimada</td>
                                    {ufSeriesByYear[year].map((v, i) => (
                                      <td key={i} className="text-right p-1 whitespace-nowrap">{formatCLP(v)}</td>
                                    ))}
                                    <td />
                                  </tr>
                                  {ITEM_CATEGORIES.map(({ key, label }) => {
                                    const values = it.monthly[key][year];
                                    const total = sumYear(values);
                                    const fieldName = key === "ggcc" ? "ggcc_uf_m2" : key === "fondo_promocion" ? "fondo_promocion_uf" : "otros_uf";
                                    const rawItem = items.find((x) => x.id === it.itemId);
                                    const currentUfValue = rawItem?.[fieldName] ?? null;
                                    return (
                                      <tr key={key} className="border-t">
                                        <td className="p-1 whitespace-nowrap">
                                          <div className="flex items-center gap-1">
                                            {label}
                                            <Badge variant="outline" className="text-[9px] px-1 py-0">Manual</Badge>
                                          </div>
                                        </td>
                                        <td colSpan={12} className="p-1">
                                          <div className="flex items-center gap-1">
                                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                              {key === "ggcc" ? "UF/m2:" : "UF/mes:"}
                                            </span>
                                            <Input
                                              type="number"
                                              className="h-6 w-24 text-xs"
                                              value={itemEdits[itemEditKey(it.itemId, fieldName)] ?? String(currentUfValue ?? "")}
                                              onChange={(e) =>
                                                setItemEdits((prev) => ({ ...prev, [itemEditKey(it.itemId, fieldName)]: e.target.value }))
                                              }
                                              onBlur={(e) => saveItemField(it.itemId, fieldName, e.target.value)}
                                            />
                                          </div>
                                        </td>
                                        <td className="text-right p-1 font-semibold whitespace-nowrap">{formatCLP(total)}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
