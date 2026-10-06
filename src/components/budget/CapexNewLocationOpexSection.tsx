import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCLP } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Loader2, Building2 } from "lucide-react";
import { computeArriendoPeriods, type RentPeriodsVersionInput } from "@/lib/businessCase/rentPeriods";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

type Category = "arriendo" | "ggcc" | "fondo_promocion" | "otros";
const CATEGORIES: { key: Category; label: string }[] = [
  { key: "arriendo", label: "Arriendo" },
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

const isMissing = {
  arriendo: (v: VersionRow) => !v.initial_rent && !v.regime_rent,
  ggcc: (v: VersionRow) => v.gastos_comunes_uf_m2 == null && v.gastos_comunes_percentage == null,
  fondo_promocion: (v: VersionRow) => v.fondo_promocion_percentage == null,
  otros: (v: VersionRow) => v.otros_egresos_amount == null,
};

export function CapexNewLocationOpexSection({ contractIds, currentYear, targetYear, ufValue }: Props) {
  const [loading, setLoading] = useState(false);
  const [contracts, setContracts] = useState<Record<string, ContractRow>>({});
  const [versions, setVersions] = useState<Record<string, VersionRow>>({});
  const [overrides, setOverrides] = useState<Record<string, ManualOverride>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Edición local de los inputs manuales (texto crudo, por "contractId::year::category").
  const [manualEdits, setManualEdits] = useState<Record<string, string>>({});

  const overrideKey = (contractId: string, year: number, category: Category) => `${contractId}::${year}::${category}`;

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

  // Para cada contrato: 4 categorías × 12 meses × 2 años -- con el valor
  // automático o, si falta el dato fuente, el override manual persistido.
  interface ContractMonthlyData {
    contractId: string;
    name: string;
    companyNames: string[];
    missing: Record<Category, boolean>;
    monthly: Record<Category, { [year: number]: number[] }>; // 12 valores por año
  }
  const perContractData: ContractMonthlyData[] = useMemo(() => {
    return sortedIds
      .map((contractId) => {
        const contract = contracts[contractId];
        const version = versions[contractId];
        if (!contract || !version) return null;
        const companyNames = (contract.contract_companies || []).map((cc) => cc.companies?.name).filter(Boolean) as string[];
        const missing: Record<Category, boolean> = {
          arriendo: isMissing.arriendo(version),
          ggcc: isMissing.ggcc(version),
          fondo_promocion: isMissing.fondo_promocion(version),
          otros: isMissing.otros(version),
        };
        const monthly: Record<Category, { [year: number]: number[] }> = {
          arriendo: { [currentYear]: [], [targetYear]: [] },
          ggcc: { [currentYear]: [], [targetYear]: [] },
          fondo_promocion: { [currentYear]: [], [targetYear]: [] },
          otros: { [currentYear]: [], [targetYear]: [] },
        };
        [currentYear, targetYear].forEach((year) => {
          for (let m = 1; m <= 12; m++) {
            const auto = computeAutoMonthly(version, contract.superficie_edificada_local, contract.metros_lineales_frente, year, m);
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
        return { contractId, name: contract.name, companyNames, missing, monthly };
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
    return totals;
  }, [perContractData, currentYear, targetYear]);

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

  if (contractIds.length === 0) return null;

  return (
    <div className="space-y-3 border-t pt-4">
      <p className="text-sm font-medium">
        Presupuesto Operativo de Nuevos Locales ({currentYear}-{targetYear})
      </p>
      <p className="text-xs text-muted-foreground">
        Estimación mensual (Arriendo, GGCC, Fondo de Promoción, Otros) para contratos "Nuevo" con CAPEX en {currentYear} o {targetYear}.
        Calculado automáticamente cuando el contrato tiene el dato; si falta, se puede ingresar un monto manual (marcado "Manual").
      </p>

      {loading ? (
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
          </div>
        </>
      )}
    </div>
  );
}
