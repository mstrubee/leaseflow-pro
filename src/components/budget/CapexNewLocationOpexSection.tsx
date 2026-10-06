import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCLP } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Loader2, Building2, CalendarClock } from "lucide-react";
import { computeArriendoPeriods, type RentPeriodsVersionInput } from "@/lib/businessCase/rentPeriods";
import { format, parseISO } from "date-fns";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

type Category = "arriendo" | "ggcc" | "fondo_promocion" | "otros";
const CATEGORIES: { key: Category; label: string }[] = [
  { key: "arriendo", label: "Arriendo" },
  { key: "ggcc", label: "GGCC" },
  { key: "fondo_promocion", label: "Fondo Promoción" },
  { key: "otros", label: "Otros" },
];
// Los Ítems de Presupuesto informativos (gantt_overview_budget_items) no
// tienen canon -- son solo informativos, sin contrato -- así que no
// participan de la categoría Arriendo, a diferencia de los contratos.
type ItemCategory = Exclude<Category, "arriendo">;
const ITEM_CATEGORIES: { key: ItemCategory; label: string }[] = [
  { key: "ggcc", label: "GGCC" },
  { key: "fondo_promocion", label: "Fondo Promoción" },
  { key: "otros", label: "Otros" },
];

interface ContractRow {
  id: string;
  name: string;
  superficie_edificada_local: number | null;
  metros_lineales_frente: number | null;
  contract_companies: { companies: { name: string | null } | null }[] | null;
}

// Mismo set de columnas que buildBCSeed/ContractDetail necesitan para
// computeArriendoPeriods, sobre la versión ACTUAL (is_current = true).
interface VersionRow extends RentPeriodsVersionInput {
  id: string;
  contract_id: string;
  effective_date: string | null;
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
}

interface Props {
  contractIds: string[];
  currentYear: number;
  targetYear: number;
  ufValue: number;
}

// Parsea el label "M{start}-M{end}" de un RentPeriodRow (ver rentPeriods.ts).
const parsePeriodLabel = (label: string): { start: number; end: number } | null => {
  const m = label.match(/^M(\d+)-M(\d+)$/);
  if (!m) return null;
  return { start: parseInt(m[1], 10), end: parseInt(m[2], 10) };
};

// Offset de mes (1-indexado) de un mes calendario respecto a effective_date:
// offset 1 = el mes calendario que contiene effective_date.
// Ej: effective_date 2026-07-15 -> julio/2026 es offset 1, agosto/2026
// offset 2, junio/2026 offset 0 (antes de empezar), enero/2027 offset 7.
const monthOffset = (effectiveDate: string, calYear: number, calMonth1Indexed: number): number => {
  const eff = new Date(effectiveDate + "T00:00:00");
  const effYear = eff.getFullYear();
  const effMonth = eff.getMonth() + 1; // 1-indexado
  return (calYear - effYear) * 12 + (calMonth1Indexed - effMonth) + 1;
};

// computeAutoMonthly necesita effective_date para ubicar cada mes dentro del
// contrato (monthOffset) -- sin él, SIEMPRE da $0 en las 4 categorías, sin
// importar si canon/GGCC/etc. están cargados. Antes esto no se detectaba
// como "dato faltante" (ej. Puerto Montt - Alerce: con regime_rent y
// gastos_comunes_uf_m2 cargados, pero effective_date null), así que el
// contrato quedaba en $0 para siempre sin ofrecer el campo manual para
// corregirlo. Ahora, sin effective_date, las 4 categorías caen a manual.
const isMissing = {
  arriendo: (v: VersionRow) => !v.effective_date || (!v.initial_rent && !v.regime_rent),
  ggcc: (v: VersionRow) => !v.effective_date || (v.gastos_comunes_uf_m2 == null && v.gastos_comunes_percentage == null),
  fondo_promocion: (v: VersionRow) => !v.effective_date || v.fondo_promocion_percentage == null,
  otros: (v: VersionRow) => !v.effective_date || v.otros_egresos_amount == null,
};

export function CapexNewLocationOpexSection({ contractIds, currentYear, targetYear, ufValue }: Props) {
  const [loading, setLoading] = useState(false);
  const [contracts, setContracts] = useState<Record<string, ContractRow>>({});
  const [versions, setVersions] = useState<Record<string, VersionRow>>({});
  const [overrides, setOverrides] = useState<Record<string, ManualOverride>>({});
  const [items, setItems] = useState<ItemRow[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
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
        const [{ data: contractsData, error: cErr }, { data: versionsData, error: vErr }, { data: overridesData, error: oErr }] =
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
          ]);
        if (cErr) throw cErr;
        if (vErr) throw vErr;
        if (oErr) throw oErr;
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
          .select("id, name, date, superficie_m2, ggcc_uf_m2, fondo_promocion_uf, otros_uf")
          .gte("date", `${currentYear}-01-01`)
          .lte("date", `${targetYear}-12-31`)
          .order("date", { ascending: true });
        if (error) throw error;
        if (cancelled) return;
        setItems(data || []);
      } catch (err) {
        console.error(err);
        toast.error("Error al cargar los ítems de presupuesto informativos");
      } finally {
        if (!cancelled) setItemsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentYear, targetYear]);

  // Monto automático (en CLP) de una categoría de un contrato, para un mes
  // calendario dado, calculado a partir de los tramos de
  // computeArriendoPeriods (en UF, pasados a CLP con el ufValue único del
  // diálogo -- estimación de planificación, no exacto mes a mes).
  const computeAutoMonthly = (version: VersionRow, superficie: number | null, metrosLinealesFrente: number | null, calYear: number, calMonth1Indexed: number) => {
    const zero = { arriendo: 0, ggcc: 0, fondo_promocion: 0, otros: 0 };
    if (!version.effective_date) return zero;
    const offset = monthOffset(version.effective_date, calYear, calMonth1Indexed);
    if (offset < 1 || offset > version.duration_months) return zero;
    const periods = computeArriendoPeriods(version, superficie, metrosLinealesFrente);
    const period = periods.find((p) => {
      const parsed = parsePeriodLabel(p.label);
      return parsed && offset >= parsed.start && offset <= parsed.end;
    });
    if (!period) return zero;
    return {
      arriendo: period.canon * ufValue,
      ggcc: period.ggcc * ufValue,
      fondo_promocion: period.fProm * ufValue,
      otros: period.otros * ufValue,
    };
  };

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

  // Para cada ítem informativo: 3 categorías × 12 meses × 2 años, siempre
  // manual, a partir del mes de su "date" (fecha de la Línea de tiempo
  // general de /reports) -- sin fecha de término definida, se proyecta
  // indefinidamente hacia adelante en ambos años.
  interface ItemMonthlyData {
    itemId: string;
    name: string;
    date: string;
    superficie_m2: number | null;
    monthly: Record<ItemCategory, { [year: number]: number[] }>;
  }
  const perItemData: ItemMonthlyData[] = useMemo(() => {
    return items.map((item) => {
      const itemDate = new Date(item.date + "T00:00:00");
      const monthly: Record<ItemCategory, { [year: number]: number[] }> = {
        ggcc: { [currentYear]: [], [targetYear]: [] },
        fondo_promocion: { [currentYear]: [], [targetYear]: [] },
        otros: { [currentYear]: [], [targetYear]: [] },
      };
      [currentYear, targetYear].forEach((year) => {
        for (let m = 1; m <= 12; m++) {
          const started = year > itemDate.getFullYear() || (year === itemDate.getFullYear() && m >= itemDate.getMonth() + 1);
          const ggcc = started && item.ggcc_uf_m2 != null && item.superficie_m2 != null ? item.ggcc_uf_m2 * item.superficie_m2 * ufValue : 0;
          const fondoPromocion = started && item.fondo_promocion_uf != null ? item.fondo_promocion_uf * ufValue : 0;
          const otros = started && item.otros_uf != null ? item.otros_uf * ufValue : 0;
          monthly.ggcc[year].push(ggcc);
          monthly.fondo_promocion[year].push(fondoPromocion);
          monthly.otros[year].push(otros);
        }
      });
      return { itemId: item.id, name: item.name, date: item.date, superficie_m2: item.superficie_m2, monthly };
    });
  }, [items, currentYear, targetYear, ufValue]);

  // Para cada contrato: 4 categorías × 12 meses × 2 años -- con el valor
  // automático o, si falta el dato fuente, el override manual persistido.
  interface ContractMonthlyData {
    contractId: string;
    name: string;
    companyNames: string[];
    missing: Record<Category, boolean>;
    monthly: Record<Category, { [year: number]: number[] }>; // 12 valores por año
    // true si el contrato no tiene ninguna versión (contract_versions con
    // is_current = true) -- típico de contratos aún "En Negociación" cuyo
    // CAPEX sale del Business Case (ver "Est. Business Case" en /capex), que
    // todavía no cargaron condiciones comerciales formales. Antes esto hacía
    // que el contrato desapareciera ENTERO de la lista, sin aviso -- ahora
    // se muestra igual, con las 4 categorías en modo manual.
    noVersion: boolean;
  }
  const perContractData: ContractMonthlyData[] = useMemo(() => {
    return sortedIds
      .map((contractId) => {
        const contract = contracts[contractId];
        if (!contract) return null;
        const version = versions[contractId];
        const companyNames = (contract.contract_companies || []).map((cc) => cc.companies?.name).filter(Boolean) as string[];
        const missing: Record<Category, boolean> = version
          ? {
              arriendo: isMissing.arriendo(version),
              ggcc: isMissing.ggcc(version),
              fondo_promocion: isMissing.fondo_promocion(version),
              otros: isMissing.otros(version),
            }
          : { arriendo: true, ggcc: true, fondo_promocion: true, otros: true };
        const monthly: Record<Category, { [year: number]: number[] }> = {
          arriendo: { [currentYear]: [], [targetYear]: [] },
          ggcc: { [currentYear]: [], [targetYear]: [] },
          fondo_promocion: { [currentYear]: [], [targetYear]: [] },
          otros: { [currentYear]: [], [targetYear]: [] },
        };
        [currentYear, targetYear].forEach((year) => {
          for (let m = 1; m <= 12; m++) {
            const auto = version
              ? computeAutoMonthly(version, contract.superficie_edificada_local, contract.metros_lineales_frente, year, m)
              : { arriendo: 0, ggcc: 0, fondo_promocion: 0, otros: 0 };
            CATEGORIES.forEach(({ key }) => {
              if (missing[key]) {
                const ov = overrides[overrideKey(contractId, year, key)];
                monthly[key][year].push(ov?.monthly_amount_clp || 0);
              } else {
                monthly[key][year].push(auto[key]);
              }
            });
          }
        });
        return { contractId, name: contract.name, companyNames, missing, monthly, noVersion: !version };
      })
      .filter((x): x is ContractMonthlyData => x !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedIds, contracts, versions, overrides, currentYear, targetYear, ufValue]);

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
                        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="text-sm font-medium flex-1 break-words">{c.name}</span>
                        {c.noVersion && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0" title="El contrato no tiene condiciones comerciales cargadas (sin contract_versions) -- probablemente aún En Negociación.">
                            Sin condiciones comerciales
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
                        <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" />
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
