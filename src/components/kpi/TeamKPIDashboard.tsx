import { useEffect, useState, Fragment } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { CategoryMultiSelect } from "@/components/suppliers/CategoryMultiSelect";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Users, Wrench, FileText, TrendingUp, Settings, ChevronDown } from "lucide-react";
import { format, parseISO, differenceInBusinessDays } from "date-fns";
import { toast } from "sonner";

// ─── helpers ────────────────────────────────────────────────────────────────

const H1_END = "2026-06-30";
const SLA_CRITICO_DAYS = 5;
const SLA_ALTO_DAYS = 15;
const SLA_MEDIO_BAJO_DAYS = 30;

function scoreBadge(score: number) {
  if (score >= 115) return <Badge className="bg-emerald-600 text-white">130% — Sobrecumplimiento</Badge>;
  if (score >= 100) return <Badge className="bg-blue-600 text-white">100% — Esperado</Badge>;
  if (score >= 70)  return <Badge className="bg-amber-500 text-white">70% — Underperformance</Badge>;
  return <Badge variant="destructive">Bajo mínimo</Badge>;
}

function pct(num: number, den: number) {
  if (den === 0) return 0;
  return Math.round((num / den) * 100);
}

function AdminSection({ label, onSave, onCancel, children }: {
  label?: string;
  onSave?: () => void;
  onCancel?: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const handleSave = () => { onSave?.(); setOpen(false); };
  const handleCancel = () => { onCancel?.(); setOpen(false); };

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground w-full py-1 select-none"
      >
        <Settings className="h-3.5 w-3.5 shrink-0" />
        <span>{label ?? "Configuración admin"}</span>
        <ChevronDown className={`h-3.5 w-3.5 ml-auto transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-2 border rounded-md p-3 bg-muted/30 space-y-3 text-xs">
          {children}
          {(onSave || onCancel) && (
            <div className="flex gap-2 justify-end pt-2 border-t border-border/50">
              {onCancel && (
                <Button variant="outline" size="sm" className="h-7 text-xs" type="button" onClick={handleCancel}>
                  Cancelar
                </Button>
              )}
              {onSave && (
                <Button size="sm" className="h-7 text-xs" type="button" onClick={handleSave}>
                  Guardar
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WeightRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 text-muted-foreground">{label}</span>
      <Input
        type="number" min={0} max={200} step={1}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-16 h-6 text-xs text-right px-1"
      />
      <span className="text-muted-foreground">%</span>
    </div>
  );
}

function SupplierCountRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 text-muted-foreground">{label}</span>
      <Input
        type="number" min={0} max={999} step={1}
        value={value}
        onFocus={e => e.currentTarget.select()}
        onChange={e => onChange(Number(e.target.value))}
        className="w-16 h-6 text-xs text-right px-1"
      />
      <span className="text-muted-foreground">prov.</span>
    </div>
  );
}

function loadLS<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function saveLS(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// ─── types ───────────────────────────────────────────────────────────────────

interface FrancoData {
  criticosH1Total: number; criticosH1Resueltos: number;
  altosH1Total: number;    altosH1Resueltos: number;
  mediosBajosH1Total: number; mediosBajosH1Resueltos: number;
  criticosH2Total: number; criticosH2EnSLA: number;
  altosH2Total: number;    altosH2EnSLA: number;
  mediosBajosH2Total: number; mediosBajosH2EnSLA: number;
  detalle: Array<{
    form_number: string; criticidad: string; semestre: "H1" | "H2";
    created_date: string; resuelto_at: string | null;
    dias_habiles: number | null; en_sla: boolean | null;
  }>;
}

interface EvelynData {
  ocConNumero: number; ocConFactura: number;
  ocSinFactura: Array<{ order_number: string; order_date: string | null }>;
  velocidadPromedio: number | null;
  // OTs año completo
  formsAnioEjecutados: number;
  formsAnioResueltos: number;
  // OTs semestre en curso
  formsSemEjecutados: number;
  formsSemResueltos: number;
  semestreLabel: string;
}

// Cobertura de una categoría de servicio: conteo de proveedores por
// "<rubroId>||<zona>" y el detalle de proveedores por celda.
interface CatCoverage {
  matrix: Record<string, number>;
  suppliersMap: Record<string, Array<{ id: string; name: string }>>;
}
interface BeatrizData {
  rubros: Array<{ id: string; name: string }>; // rubros activos (para nombres)
  zones: string[];
  compras: CatCoverage;
  mantenciones: CatCoverage;
}

// ─── Beatriz card ─────────────────────────────────────────────────────────────

// Config de Beatriz: por cada CATEGORÍA de servicio (Compras = does_installations,
// Mantenciones = does_maintenance) el admin define cuántos proveedores se exigen
// POR RUBRO y POR ZONA para el 100% (min) y el 130% (sobre), y QUÉ rubros cuentan
// para esa categoría (rubroIds). Se persiste en kpi_team_config (key 'beatriz')
// para que la config sea global. El puntaje del bono junta (pooled) todas las
// celdas rubro×zona de ambas categorías; la visualización es separada por
// categoría para ver dónde faltan proveedores.
const BEATRIZ_CFG_DB_KEY = "beatriz";
type CatKey = "compras" | "mantenciones";
const CAT_LABEL: Record<CatKey, string> = { compras: "Compras", mantenciones: "Mantenciones" };
const CAT_KEYS: CatKey[] = ["compras", "mantenciones"];

interface CatCfg { min: number; sobre: number; rubroIds: string[]; }
interface BeatrizCfg { compras: CatCfg; mantenciones: CatCfg; }
const BEATRIZ_DEFAULTS: BeatrizCfg = {
  compras:      { min: 2, sobre: 4, rubroIds: [] },
  mantenciones: { min: 3, sobre: 5, rubroIds: [] },
};

function cellColor(count: number, metaMin: number, metaSobre: number) {
  if (count >= metaSobre) return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (count >= metaMin)   return "bg-blue-50 text-blue-800 border-blue-200";
  if (count >= 1)         return "bg-amber-50 text-amber-800 border-amber-200";
  return "bg-red-50 text-red-700 border-red-200";
}

function BeatrizCard({ data, loading }: { data: BeatrizData | null; loading: boolean }) {
  const { isAdmin } = useAuth();
  const [cfg, setCfg]           = useState<BeatrizCfg>(BEATRIZ_DEFAULTS);
  const [savedCfg, setSavedCfg] = useState<BeatrizCfg>(BEATRIZ_DEFAULTS);
  const [expandedCell, setExpandedCell] = useState<string | null>(null);
  const [detailOpen, setDetailOpen]     = useState(false);
  const [savingCfg, setSavingCfg]       = useState(false);

  // Config global desde la base (la fija ADMIN; todos la ven reflejada).
  useEffect(() => {
    (async () => {
      const { data: row } = await supabase
        .from("kpi_team_config")
        .select("config")
        .eq("key", BEATRIZ_CFG_DB_KEY)
        .maybeSingle();
      if (row?.config) {
        const raw = row.config as Partial<BeatrizCfg>;
        const merge = (d: CatCfg, r?: Partial<CatCfg>): CatCfg => ({
          min: r?.min ?? d.min,
          sobre: r?.sobre ?? d.sobre,
          rubroIds: r?.rubroIds ?? d.rubroIds,
        });
        const c: BeatrizCfg = {
          compras: merge(BEATRIZ_DEFAULTS.compras, raw.compras),
          mantenciones: merge(BEATRIZ_DEFAULTS.mantenciones, raw.mantenciones),
        };
        setCfg(c);
        setSavedCfg(c);
      }
    })();
  }, []);

  const toggleCell = (key: string) => setExpandedCell(prev => prev === key ? null : key);

  const updateCat = (catKey: CatKey, patch: Partial<CatCfg>) =>
    setCfg(prev => ({ ...prev, [catKey]: { ...prev[catKey], ...patch } }));

  const saveBeatrizAdmin = async () => {
    setSavingCfg(true);
    try {
      const { error } = await supabase
        .from("kpi_team_config")
        .upsert(
          { key: BEATRIZ_CFG_DB_KEY, config: cfg as unknown as Json, updated_at: new Date().toISOString() },
          { onConflict: "key" },
        );
      if (error) throw error;
      setSavedCfg(cfg);
      toast.success("Configuración guardada");
    } catch (err) {
      console.error("Error guardando config KPI:", err);
      toast.error("Error al guardar la configuración");
      setCfg(savedCfg);
    } finally {
      setSavingCfg(false);
    }
  };

  const cancelBeatrizAdmin = () => setCfg(savedCfg);

  if (loading) return <CardSkeleton title="Beatriz Valenzuela" subtitle="Cobertura de Proveedores" />;

  const zones = data?.zones ?? [];
  const rubroName = new Map((data?.rubros ?? []).map(r => [r.id, r.name] as const));

  // Estadística de cobertura de una categoría: celdas (rubros elegidos × zonas)
  // cubiertas al 100% (≥min) y al 130% (≥sobre).
  const catStats = (catKey: CatKey) => {
    const conf = cfg[catKey];
    const cov = data ? data[catKey] : null;
    const cells = conf.rubroIds.length * zones.length;
    let c100 = 0, c130 = 0;
    if (cov) {
      conf.rubroIds.forEach(rid => zones.forEach(z => {
        const n = cov.matrix[`${rid}||${z}`] ?? 0;
        if (n >= conf.min)   c100++;
        if (n >= conf.sobre) c130++;
      }));
    }
    return { cells, c100, c130 };
  };
  const stats: Record<CatKey, { cells: number; c100: number; c130: number }> = {
    compras: catStats("compras"),
    mantenciones: catStats("mantenciones"),
  };

  // Puntaje del bono: pooled sobre ambas categorías.
  const pooledCells = stats.compras.cells + stats.mantenciones.cells;
  const score100 = pct(stats.compras.c100 + stats.mantenciones.c100, pooledCells);
  const score130 = pct(stats.compras.c130 + stats.mantenciones.c130, pooledCells);
  const score    = score100 >= 100 ? (score130 >= 100 ? 130 : 100) : score100 >= 70 ? 70 : score100;
  const sinConfigurar = pooledCells === 0;

  return (
    <>
      {/* ── Summary card ── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">Beatriz Valenzuela</CardTitle>
                <p className="text-xs text-muted-foreground">Activos Fijos y Proveedores</p>
              </div>
            </div>
            {data && !sinConfigurar && scoreBadge(score)}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {sinConfigurar ? (
            <p className="text-xs text-muted-foreground italic">
              Sin configurar. {isAdmin ? "Definí los rubros por categoría en “Ver detalle → Configuración admin”." : "Pendiente de configuración."}
            </p>
          ) : (
            <>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Cobertura meta (100%)</span>
                  <span className="font-semibold">{score100}%</span>
                </div>
                <Progress value={Math.min(score100, 100)} className="h-2" />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Cobertura sobrecumplimiento</span>
                  <span className="font-semibold">{score130}%</span>
                </div>
                <Progress value={Math.min(score130, 100)} className="h-2" />
              </div>
              <p className="text-xs text-muted-foreground">
                {stats.compras.c100 + stats.mantenciones.c100} de {pooledCells} celdas rubro × zona cubiertas
              </p>
            </>
          )}
          <Button variant="outline" size="sm" className="w-full" onClick={() => setDetailOpen(true)}>
            Ver detalle
          </Button>
        </CardContent>
      </Card>

      {/* ── Detail dialog ── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="w-[95vw] max-w-[95vw]" onInteractOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Beatriz Valenzuela — Cobertura de Proveedores</DialogTitle>
          </DialogHeader>
          <div className="max-h-[78vh] overflow-y-auto space-y-4 pr-1">

            {/* Admin — solo visible para admin (Beatriz, no-admin, no lo ve).
                Va ARRIBA para que, al desplegarse, sea visible de inmediato. */}
            {data && isAdmin && (
              <AdminSection label="Configuración admin" onSave={saveBeatrizAdmin} onCancel={cancelBeatrizAdmin}>
                <p className="text-muted-foreground">
                  Por cada categoría: proveedores exigibles <strong>por rubro y por zona</strong> para
                  el 100% (meta) y el 130% (sobrecumplimiento), y qué rubros cuentan para esa categoría.
                </p>
                {CAT_KEYS.map(catKey => (
                  <div key={catKey} className="border rounded-md p-2 space-y-2">
                    <p className="font-medium">{CAT_LABEL[catKey]}</p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                      <SupplierCountRow label="Meta 100%"  value={cfg[catKey].min}   onChange={v => updateCat(catKey, { min: v })} />
                      <SupplierCountRow label="Sobre 130%" value={cfg[catKey].sobre} onChange={v => updateCat(catKey, { sobre: v })} />
                    </div>
                    <p className="text-[11px] text-muted-foreground">Rubros que cuentan para {CAT_LABEL[catKey]}:</p>
                    <CategoryMultiSelect
                      value={cfg[catKey].rubroIds}
                      onChange={ids => updateCat(catKey, { rubroIds: ids })}
                      placeholder="Seleccionar rubros"
                    />
                  </div>
                ))}
                {savingCfg && (
                  <p className="flex items-center gap-1 text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Guardando...
                  </p>
                )}
              </AdminSection>
            )}

            {/* Resumen del bono (pooled) */}
            {!sinConfigurar && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Cobertura meta (100%)</span>
                    <span className="font-semibold">{score100}%</span>
                  </div>
                  <Progress value={Math.min(score100, 100)} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-1">
                    {stats.compras.c100 + stats.mantenciones.c100} de {pooledCells} celdas
                  </p>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Cobertura sobrecumplimiento (130%)</span>
                    <span className="font-semibold">{score130}%</span>
                  </div>
                  <Progress value={Math.min(score130, 100)} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-1">
                    {stats.compras.c130 + stats.mantenciones.c130} de {pooledCells} celdas
                  </p>
                </div>
              </div>
            )}

            {sinConfigurar && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No hay rubros configurados para ninguna categoría.
                {isAdmin ? " Usá “Configuración admin” arriba para elegirlos." : ""}
              </p>
            )}

            {/* Visualización por categoría (separada, para ver dónde faltan proveedores) */}
            {CAT_KEYS.map(catKey => {
              const conf = cfg[catKey];
              const cov = data ? data[catKey] : null;
              const s = stats[catKey];
              if (conf.rubroIds.length === 0) return null;
              const p100 = pct(s.c100, s.cells);
              return (
                <div key={catKey}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">{CAT_LABEL[catKey]}</span>
                    <span className="text-xs text-muted-foreground">
                      meta ≥{conf.min}/zona · {s.c100} de {s.cells} celdas ({p100}%)
                    </span>
                  </div>
                  {zones.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No hay zonas de influencia registradas.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="text-xs border-collapse w-full">
                        <thead>
                          <tr>
                            <th className="text-left py-1.5 pr-3 font-medium text-muted-foreground min-w-[160px] sticky left-0 bg-background">
                              Rubro
                            </th>
                            {zones.map(z => (
                              <th key={z} className="text-center py-1.5 px-2 font-medium text-muted-foreground whitespace-nowrap min-w-[80px]">
                                {z}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {conf.rubroIds.map(rid => {
                            const openZone = zones.find(z => expandedCell === `${catKey}||${rid}||${z}`);
                            return (
                              <Fragment key={rid}>
                                <tr className="border-t">
                                  <td className="py-1.5 pr-3 font-medium sticky left-0 bg-background">{rubroName.get(rid) ?? rid}</td>
                                  {zones.map(z => {
                                    const cellKey = `${catKey}||${rid}||${z}`;
                                    const count = cov?.matrix[`${rid}||${z}`] ?? 0;
                                    const isOpen = expandedCell === cellKey;
                                    return (
                                      <td key={z} className="text-center py-1.5 px-2">
                                        <button
                                          onClick={() => count > 0 ? toggleCell(cellKey) : undefined}
                                          className={`inline-block rounded border px-2 py-0.5 font-semibold transition-opacity
                                            ${cellColor(count, conf.min, conf.sobre)}
                                            ${count > 0 ? "cursor-pointer hover:opacity-70 underline decoration-dotted" : "cursor-default"}
                                            ${isOpen ? "ring-2 ring-offset-1 ring-primary" : ""}`}
                                        >
                                          {count}
                                        </button>
                                      </td>
                                    );
                                  })}
                                </tr>
                                {openZone && (() => {
                                  const suppList = cov?.suppliersMap[`${rid}||${openZone}`] ?? [];
                                  return (
                                    <tr className="bg-muted/40">
                                      <td colSpan={zones.length + 1} className="py-2 px-3 text-xs">
                                        <div className="flex items-center gap-2 mb-1.5 font-medium">
                                          <span>{rubroName.get(rid) ?? rid}</span>
                                          <span className="text-muted-foreground">·</span>
                                          <span className="text-muted-foreground">{openZone}</span>
                                          <span className="ml-auto text-muted-foreground">
                                            {suppList.length} proveedor{suppList.length !== 1 ? "es" : ""}
                                          </span>
                                        </div>
                                        <ul className="space-y-0.5 columns-2">
                                          {suppList.map(sp => <li key={sp.id} className="text-muted-foreground">• {sp.name}</li>)}
                                        </ul>
                                      </td>
                                    </tr>
                                  );
                                })()}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}

            {!sinConfigurar && (
              <div className="flex gap-4 mt-1 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-emerald-100 border border-emerald-200" /> sobrecumplimiento</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-blue-50 border border-blue-200" /> meta</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-amber-50 border border-amber-200" /> bajo la meta</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-50 border border-red-200" /> 0 sin cobertura</span>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Franco card ──────────────────────────────────────────────────────────────

const FRANCO_CFG_KEY = "franco_kpi_cfg";

interface FrancoCfg {
  wCritH1: number; wAltH1: number; wMedH1: number;
  wCritH2: number; wAltH2: number; wMedH2: number;
  tCritH1: number; tAltH1: number; tMedH1: number;
  tCritH2: number; tAltH2: number; tMedH2: number;
  slaCritico: number; slaAlto: number; slaMedioBajo: number;
  targetTotal: number; // target sum of weights (e.g. 50 if these KPIs = 50% of evaluation)
}
const FRANCO_DEFAULTS: FrancoCfg = {
  wCritH1: 25, wAltH1: 25, wMedH1: 20, wCritH2: 15, wAltH2: 10, wMedH2: 5,
  tCritH1: 100, tAltH1: 80, tMedH1: 80, tCritH2: 80, tAltH2: 80, tMedH2: 80,
  slaCritico: 5, slaAlto: 15, slaMedioBajo: 30,
  targetTotal: 100,
};

function FrancoCard({ data, loading }: { data: FrancoData | null; loading: boolean }) {
  const [cfg, setCfg]             = useState<FrancoCfg>(() => loadLS(FRANCO_CFG_KEY, FRANCO_DEFAULTS));
  const [savedCfg, setSavedCfg]   = useState<FrancoCfg>(() => loadLS(FRANCO_CFG_KEY, FRANCO_DEFAULTS));
  const [detailOpen, setDetailOpen] = useState(false);

  const updateCfg = (patch: Partial<FrancoCfg>) => {
    setCfg(prev => ({ ...prev, ...patch })); // no auto-save
  };

  const saveFrancoAdmin = () => {
    saveLS(FRANCO_CFG_KEY, cfg);
    setSavedCfg(cfg);
  };

  const cancelFrancoAdmin = () => {
    setCfg(savedCfg);
  };

  if (loading) return <CardSkeleton title="Franco Leiva" subtitle="Resolución de Forms" />;

  const pCritH1 = data ? pct(data.criticosH1Resueltos,    data.criticosH1Total)    : 0;
  const pAltH1  = data ? pct(data.altosH1Resueltos,       data.altosH1Total)       : 0;
  const pMedH1  = data ? pct(data.mediosBajosH1Resueltos, data.mediosBajosH1Total) : 0;
  const pCritH2 = data ? pct(data.criticosH2EnSLA,        data.criticosH2Total)    : 0;
  const pAltH2  = data ? pct(data.altosH2EnSLA,           data.altosH2Total)       : 0;
  const pMedH2  = data ? pct(data.mediosBajosH2EnSLA,     data.mediosBajosH2Total) : 0;

  const totalW = cfg.wCritH1 + cfg.wAltH1 + cfg.wMedH1 + cfg.wCritH2 + cfg.wAltH2 + cfg.wMedH2;
  // Normalize by targetTotal so the score reflects performance against the configured weight sum
  const normBy = cfg.targetTotal > 0 ? cfg.targetTotal : totalW;
  const norm   = (p: number, t: number, w: number) => t > 0 && normBy > 0 ? (p / t) * 100 * (w / normBy) : 0;
  const score  = Math.round(
    norm(pCritH1, cfg.tCritH1, cfg.wCritH1) + norm(pAltH1, cfg.tAltH1, cfg.wAltH1) +
    norm(pMedH1,  cfg.tMedH1,  cfg.wMedH1)  + norm(pCritH2, cfg.tCritH2, cfg.wCritH2) +
    norm(pAltH2,  cfg.tAltH2,  cfg.wAltH2)  + norm(pMedH2,  cfg.tMedH2,  cfg.wMedH2)
  );

  const rows = [
    { label: "Críticos H1",                              val: pCritH1, meta: cfg.tCritH1, peso: cfg.wCritH1 },
    { label: "Altos H1",                                 val: pAltH1,  meta: cfg.tAltH1,  peso: cfg.wAltH1  },
    { label: "Medios+Bajos H1",                          val: pMedH1,  meta: cfg.tMedH1,  peso: cfg.wMedH1  },
    { label: `Críticos H2 SLA ≤${cfg.slaCritico}d`,      val: pCritH2, meta: cfg.tCritH2, peso: cfg.wCritH2 },
    { label: `Altos H2 SLA ≤${cfg.slaAlto}d`,            val: pAltH2,  meta: cfg.tAltH2,  peso: cfg.wAltH2  },
    { label: `Medios+Bajos H2 SLA ≤${cfg.slaMedioBajo}d`,val: pMedH2,  meta: cfg.tMedH2,  peso: cfg.wMedH2  },
  ];

  return (
    <>
      {/* ── Summary card — shows all 6 bars ── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">Franco Leiva</CardTitle>
                <p className="text-xs text-muted-foreground">Encargado de Mantenciones</p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              {data && scoreBadge(score)}
              {cfg.targetTotal !== 100 && (
                <span className="text-[10px] text-muted-foreground">
                  Suma objetivo: {cfg.targetTotal}% · actual: {totalW}%
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {rows.map(r => (
            <div key={r.label}>
              <div className="flex justify-between text-xs mb-1">
                <span>
                  {r.label}
                  <span className="text-muted-foreground ml-1">(meta: {r.meta}% · peso: {r.peso}%)</span>
                </span>
                <span className={`font-semibold ${r.val >= r.meta ? "text-emerald-600" : r.val >= r.meta * 0.7 ? "text-amber-500" : "text-destructive"}`}>
                  {r.val}%
                </span>
              </div>
              <Progress value={Math.min((r.val / r.meta) * 100, 100)} className="h-1.5" />
            </div>
          ))}
          <Button variant="outline" size="sm" className="w-full mt-1" onClick={() => setDetailOpen(true)}>
            Ver detalle
          </Button>
        </CardContent>
      </Card>

      {/* ── Detail dialog — forms table + admin ── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl" onInteractOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Franco Leiva — Detalle y Configuración</DialogTitle>
          </DialogHeader>
          <div className="max-h-[75vh] overflow-y-auto space-y-4 pr-1">

            {/* Forms detail table */}
            {data && data.detalle.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-muted/50 border-b">
                  <p className="text-sm font-medium">
                    Detalle de forms resueltos ({data.detalle.filter(d => d.resuelto_at).length})
                  </p>
                </div>
                <div className="overflow-x-auto max-h-60 overflow-y-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 bg-background border-b">
                      <tr className="text-muted-foreground">
                        <th className="text-left py-2 px-3">Form</th>
                        <th className="text-left py-2 px-2">Criticidad</th>
                        <th className="text-left py-2 px-2">Sem.</th>
                        <th className="text-left py-2 px-2">Creado</th>
                        <th className="text-left py-2 px-2">Resuelto</th>
                        <th className="text-right py-2 px-3">Días háb.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.detalle.filter(d => d.resuelto_at).map((d, i) => (
                        <tr key={i} className="border-b hover:bg-muted/30">
                          <td className="py-1.5 px-3 font-mono">{d.form_number}</td>
                          <td className="py-1.5 px-2">{d.criticidad}</td>
                          <td className="py-1.5 px-2">{d.semestre}</td>
                          <td className="py-1.5 px-2">{d.created_date ? format(parseISO(d.created_date), "dd/MM/yy") : "—"}</td>
                          <td className="py-1.5 px-2">{d.resuelto_at ? format(parseISO(d.resuelto_at), "dd/MM/yy") : "—"}</td>
                          <td className={`py-1.5 px-3 text-right font-semibold ${d.en_sla ? "text-emerald-600" : "text-destructive"}`}>
                            {d.dias_habiles ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Admin */}
            <AdminSection onSave={saveFrancoAdmin} onCancel={cancelFrancoAdmin}>
              {/* Suma total de ponderaciones */}
              <div>
                <p className="font-medium mb-1">Suma total de ponderaciones</p>
                <p className="text-muted-foreground mb-2">
                  Define a cuánto debe sumar el conjunto de pesos (ej. 50% si estos KPIs representan
                  la mitad de la evaluación total). El score se calcula normalizando contra este valor.
                </p>
                <WeightRow
                  label="Suma objetivo (%)"
                  value={cfg.targetTotal}
                  onChange={v => updateCfg({ targetTotal: v })}
                />
                <p className="mt-1 text-muted-foreground">
                  Suma actual de pesos: <span className={totalW === cfg.targetTotal ? "text-emerald-600 font-medium" : "text-amber-600 font-medium"}>{totalW}%</span>
                  {totalW !== cfg.targetTotal && ` (objetivo: ${cfg.targetTotal}%)`}
                </p>
              </div>

              <div>
                <p className="font-medium mb-2">Ponderaciones (%)</p>
                <div className="space-y-1.5">
                  <WeightRow label="Críticos H1"         value={cfg.wCritH1} onChange={v => updateCfg({ wCritH1: v })} />
                  <WeightRow label="Altos H1"             value={cfg.wAltH1}  onChange={v => updateCfg({ wAltH1: v })}  />
                  <WeightRow label="Medios+Bajos H1"      value={cfg.wMedH1}  onChange={v => updateCfg({ wMedH1: v })}  />
                  <WeightRow label="Críticos H2"          value={cfg.wCritH2} onChange={v => updateCfg({ wCritH2: v })} />
                  <WeightRow label="Altos H2"             value={cfg.wAltH2}  onChange={v => updateCfg({ wAltH2: v })}  />
                  <WeightRow label="Medios+Bajos H2"      value={cfg.wMedH2}  onChange={v => updateCfg({ wMedH2: v })}  />
                </div>
              </div>

              <div>
                <p className="font-medium mb-2">Metas (%)</p>
                <div className="space-y-1.5">
                  <WeightRow label="Meta Críticos H1"        value={cfg.tCritH1} onChange={v => updateCfg({ tCritH1: v })} />
                  <WeightRow label="Meta Altos H1"            value={cfg.tAltH1}  onChange={v => updateCfg({ tAltH1: v })}  />
                  <WeightRow label="Meta Medios+Bajos H1"     value={cfg.tMedH1}  onChange={v => updateCfg({ tMedH1: v })}  />
                  <WeightRow label="Meta Críticos H2"         value={cfg.tCritH2} onChange={v => updateCfg({ tCritH2: v })} />
                  <WeightRow label="Meta Altos H2"            value={cfg.tAltH2}  onChange={v => updateCfg({ tAltH2: v })}  />
                  <WeightRow label="Meta Medios+Bajos H2"     value={cfg.tMedH2}  onChange={v => updateCfg({ tMedH2: v })}  />
                </div>
              </div>

              <div>
                <p className="font-medium mb-2">SLA H2 (días hábiles)</p>
                <div className="space-y-1.5">
                  <WeightRow label="SLA Críticos"        value={cfg.slaCritico}   onChange={v => updateCfg({ slaCritico: v })}   />
                  <WeightRow label="SLA Altos"            value={cfg.slaAlto}      onChange={v => updateCfg({ slaAlto: v })}      />
                  <WeightRow label="SLA Medios+Bajos"     value={cfg.slaMedioBajo} onChange={v => updateCfg({ slaMedioBajo: v })} />
                </div>
              </div>
            </AdminSection>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Evelyn card ──────────────────────────────────────────────────────────────

const EVELYN_CFG_KEY = "evelyn_kpi_cfg";
interface EvelynCfg {
  wCobertura: number; wVelocidad: number; wOTs: number;
  velOptimo: number; velMeta: number; velMinimo: number;
}
const EVELYN_DEFAULTS: EvelynCfg = {
  wCobertura: 70, wVelocidad: 20, wOTs: 10,
  velOptimo: 3, velMeta: 5, velMinimo: 10,
};

function EvelynCard({ data, loading, francoData }: { data: EvelynData | null; loading: boolean; francoData: FrancoData | null }) {
  const [cfg, setCfg]               = useState<EvelynCfg>(() => loadLS(EVELYN_CFG_KEY, EVELYN_DEFAULTS));
  const [savedCfg, setSavedCfg]     = useState<EvelynCfg>(() => loadLS(EVELYN_CFG_KEY, EVELYN_DEFAULTS));
  const [detailOpen, setDetailOpen] = useState(false);

  const updateCfg = (patch: Partial<EvelynCfg>) => {
    setCfg(prev => ({ ...prev, ...patch })); // no auto-save
  };

  const saveEvelynAdmin = () => {
    saveLS(EVELYN_CFG_KEY, cfg);
    setSavedCfg(cfg);
  };

  const cancelEvelynAdmin = () => {
    setCfg(savedCfg);
  };

  if (loading) return <CardSkeleton title="Evelyn Padilla" subtitle="OC y Facturas al Día" />;

  const cobertura  = data ? pct(data.ocConFactura, data.ocConNumero) : 0;
  const velocidad  = data?.velocidadPromedio ?? null;
  const totalOTsAnio = data ? data.formsAnioEjecutados + data.formsAnioResueltos : 0;
  const totalOTsSem  = data ? data.formsSemEjecutados  + data.formsSemResueltos  : 0;
  const otsAnio    = data ? pct(data.formsAnioResueltos, totalOTsAnio) : 0;
  const otsSem     = data ? pct(data.formsSemResueltos,  totalOTsSem)  : 0;
  const otsResueltas = otsAnio; // score usa el año completo

  const velScore = velocidad === null ? 0
    : velocidad <= cfg.velOptimo ? 130
    : velocidad <= cfg.velMeta   ? 100
    : velocidad <= cfg.velMinimo ? 70
    : 0;

  const totalW = cfg.wCobertura + cfg.wVelocidad + cfg.wOTs;
  const score  = totalW > 0
    ? Math.round(
        (cobertura * cfg.wCobertura + velScore * cfg.wVelocidad + otsResueltas * cfg.wOTs) / totalW
      )
    : 0;
  const superPerformance = cobertura >= 100 && velocidad !== null && velocidad <= cfg.velOptimo;

  return (
    <>
      {/* ── Summary card ── */}
      <Card className={superPerformance ? "border-emerald-500 border-2" : ""}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">Evelyn Padilla</CardTitle>
                <p className="text-xs text-muted-foreground">Digitación y Control de Gestión</p>
              </div>
            </div>
            {data && scoreBadge(score)}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">OC con factura (meta 100%)</span>
              <span className="font-semibold">{cobertura}%</span>
            </div>
            <Progress value={cobertura} className="h-2" />
            {data && <p className="text-xs text-muted-foreground mt-1">{data.ocConFactura} de {data.ocConNumero} OC</p>}
          </div>
          {velocidad !== null && (
            <div className="bg-muted/50 rounded-md px-3 py-2 flex justify-between items-center">
              <span className="text-muted-foreground text-xs">Velocidad promedio</span>
              <span className={`font-semibold text-sm ${velocidad <= cfg.velOptimo ? "text-emerald-600" : velocidad <= cfg.velMeta ? "text-blue-600" : velocidad <= cfg.velMinimo ? "text-amber-500" : "text-destructive"}`}>
                {velocidad.toFixed(1)} días háb.
              </span>
            </div>
          )}
          {data && (
            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">OTs Ejecutado→Resuelto (año)</span>
                  <span className="font-semibold">{otsAnio}%</span>
                </div>
                <Progress value={otsAnio} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  {data.formsAnioResueltos} resueltos · {data.formsAnioEjecutados} pendientes
                </p>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">OTs Ejecutado→Resuelto ({data.semestreLabel})</span>
                  <span className="font-semibold">{otsSem}%</span>
                </div>
                <Progress value={otsSem} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  {data.formsSemResueltos} resueltos · {data.formsSemEjecutados} pendientes
                </p>
              </div>
            </div>
          )}
          {superPerformance && (
            <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800 flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 shrink-0" />
              <span className="font-semibold">Equipo en ritmo óptimo</span>
            </div>
          )}
          <Button variant="outline" size="sm" className="w-full" onClick={() => setDetailOpen(true)}>
            Ver detalle
          </Button>
        </CardContent>
      </Card>

      {/* ── Detail dialog ── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-xl" onInteractOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Evelyn Padilla — OC y Facturas al Día</DialogTitle>
          </DialogHeader>
          <div className="max-h-[75vh] overflow-y-auto space-y-4 pr-1">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>OC con factura registrada (meta: 100%)</span>
                <span className="font-semibold">{cobertura}%</span>
              </div>
              <Progress value={cobertura} className="h-2" />
              {data && <p className="text-xs text-muted-foreground mt-1">{data.ocConFactura} de {data.ocConNumero} OC con factura</p>}
            </div>

            {velocidad !== null && (
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Velocidad promedio de carga <span className="text-muted-foreground text-xs">({cfg.wVelocidad}% peso)</span></span>
                  <span className={`font-semibold ${velocidad <= cfg.velOptimo ? "text-emerald-600" : velocidad <= cfg.velMeta ? "text-blue-600" : velocidad <= cfg.velMinimo ? "text-amber-500" : "text-destructive"}`}>
                    {velocidad.toFixed(1)} días háb.
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Óptimo: ≤{cfg.velOptimo}d · Meta: ≤{cfg.velMeta}d · Mínimo: ≤{cfg.velMinimo}d</p>
              </div>
            )}

            {data && (
              <div className="space-y-3">
                <p className="text-sm font-medium">
                  OTs subidas: Ejecutado → Resuelto
                  <span className="text-muted-foreground text-xs ml-1">({cfg.wOTs}% peso)</span>
                </p>
                {/* Año */}
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Año 2026</span>
                    <span className={`font-semibold ${otsAnio >= 100 ? "text-emerald-600" : otsAnio >= 70 ? "text-amber-500" : "text-destructive"}`}>
                      {otsAnio}%
                    </span>
                  </div>
                  <Progress value={otsAnio} className="h-2" />
                  <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                    <span>{data.formsAnioResueltos} resueltos (OT subida)</span>
                    <span className={data.formsAnioEjecutados > 0 ? "text-amber-600 font-medium" : ""}>
                      {data.formsAnioEjecutados} pendientes de OT
                    </span>
                  </div>
                </div>
                {/* Semestre */}
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">{data.semestreLabel}</span>
                    <span className={`font-semibold ${otsSem >= 100 ? "text-emerald-600" : otsSem >= 70 ? "text-amber-500" : "text-destructive"}`}>
                      {otsSem}%
                    </span>
                  </div>
                  <Progress value={otsSem} className="h-2" />
                  <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                    <span>{data.formsSemResueltos} resueltos (OT subida)</span>
                    <span className={data.formsSemEjecutados > 0 ? "text-amber-600 font-medium" : ""}>
                      {data.formsSemEjecutados} pendientes de OT
                    </span>
                  </div>
                </div>
              </div>
            )}

            {superPerformance && (
              <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 space-y-1">
                <div className="flex items-center gap-1 font-semibold"><TrendingUp className="h-3.5 w-3.5" /> Equipo en ritmo óptimo</div>
                {francoData && <p>Franco tiene {francoData.criticosH1Resueltos + francoData.altosH1Resueltos} forms cerrados habilitados por OC completas.</p>}
              </div>
            )}

            {data && data.ocSinFactura.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-muted/50 border-b">
                  <p className="text-sm font-medium">{data.ocSinFactura.length} OC sin factura registrada (pendientes)</p>
                </div>
                <div className="max-h-48 overflow-y-auto divide-y text-xs">
                  {data.ocSinFactura.map((oc, i) => (
                    <div key={i} className="flex justify-between px-3 py-1.5">
                      <span className="font-mono">{oc.order_number}</span>
                      <span className="text-muted-foreground">{oc.order_date ? format(parseISO(oc.order_date), "dd/MM/yyyy") : "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <AdminSection onSave={saveEvelynAdmin} onCancel={cancelEvelynAdmin}>
              <div>
                <p className="font-medium mb-2">Ponderaciones (%)</p>
                <div className="space-y-1.5">
                  <WeightRow label="Cobertura OC"         value={cfg.wCobertura} onChange={v => updateCfg({ wCobertura: v })} />
                  <WeightRow label="Velocidad carga"       value={cfg.wVelocidad} onChange={v => updateCfg({ wVelocidad: v })} />
                  <WeightRow label="OTs Ejecutado→Resuelto" value={cfg.wOTs}      onChange={v => updateCfg({ wOTs: v })}       />
                </div>
              </div>
              <div>
                <p className="font-medium mb-2">Velocidad (días hábiles)</p>
                <div className="space-y-1.5">
                  <WeightRow label="Óptimo (≤N días)" value={cfg.velOptimo}  onChange={v => updateCfg({ velOptimo: v })}  />
                  <WeightRow label="Meta (≤N días)"    value={cfg.velMeta}    onChange={v => updateCfg({ velMeta: v })}    />
                  <WeightRow label="Mínimo (≤N días)"  value={cfg.velMinimo}  onChange={v => updateCfg({ velMinimo: v })}  />
                </div>
              </div>
            </AdminSection>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function CardSkeleton({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="h-3 bg-muted rounded animate-pulse" />
          <div className="h-3 bg-muted rounded animate-pulse w-3/4" />
          <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TeamKPIDashboard() {
  const { isAdmin, hasPermission } = useAuth();

  const showBeatriz = isAdmin || hasPermission("kpi_cobertura_proveedores", "view") || hasPermission("kpi", "view");
  const showFranco  = isAdmin || hasPermission("kpi_resolucion_forms",      "view") || hasPermission("kpi", "view");
  const showEvelyn  = isAdmin || hasPermission("kpi_oc_facturas",           "view") || hasPermission("kpi", "view");

  const [francoData,   setFrancoData]   = useState<FrancoData | null>(null);
  const [evelynData,   setEvelynData]   = useState<EvelynData | null>(null);
  const [beatrizData,  setBeatrizData]  = useState<BeatrizData | null>(null);
  const [loadingFranco,  setLoadingFranco]  = useState(true);
  const [loadingEvelyn,  setLoadingEvelyn]  = useState(true);
  const [loadingBeatriz, setLoadingBeatriz] = useState(true);

  // ── Franco ────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoadingFranco(true);
      try {
        const { data: cats } = await supabase
          .from("maintenance_criticality_categories" as any)
          .select("id, code, name");
        const critMap = new Map<string, string>();
        (cats || []).forEach((c: any) => critMap.set(c.id, c.code));

        const criticoIds   = (cats || []).filter((c: any) => c.code === "critico").map((c: any) => c.id);
        const altoIds      = (cats || []).filter((c: any) => c.code === "alto").map((c: any) => c.id);
        const medioBajoIds = (cats || []).filter((c: any) => ["medio", "bajo"].includes(c.code)).map((c: any) => c.id);

        const { data: forms } = await supabase
          .from("maintenance_forms" as any)
          .select("id, form_number, sub_status, created_date, sub_status_resuelto_at, criticality_category_id")
          .not("criticality_category_id", "is", null)
          .eq("year", 2026)
          .is("deleted_at", null);

        const allForms = (forms || []) as any[];

        const isH1 = (f: any) => f.created_date && f.created_date <= H1_END;
        const isH2 = (f: any) => f.created_date && f.created_date > H1_END;
        const isResuelto = (f: any) => f.sub_status === "resuelto";
        const isCritico   = (f: any) => criticoIds.includes(f.criticality_category_id);
        const isAlto      = (f: any) => altoIds.includes(f.criticality_category_id);
        const isMedioBajo = (f: any) => medioBajoIds.includes(f.criticality_category_id);

        const criticosH1    = allForms.filter(f => isCritico(f)   && isH1(f));
        const altosH1       = allForms.filter(f => isAlto(f)      && isH1(f));
        const mediosBajosH1 = allForms.filter(f => isMedioBajo(f) && isH1(f));
        const criticosH2    = allForms.filter(f => isCritico(f)   && isH2(f));
        const altosH2       = allForms.filter(f => isAlto(f)      && isH2(f));
        const mediosBajosH2 = allForms.filter(f => isMedioBajo(f) && isH2(f));

        const enSLA = (f: any, maxDays: number) => {
          if (!f.sub_status_resuelto_at || !f.created_date) return false;
          const dias = differenceInBusinessDays(parseISO(f.sub_status_resuelto_at), parseISO(f.created_date));
          return dias <= maxDays;
        };

        const detalle = allForms
          .filter(f => f.sub_status_resuelto_at || isResuelto(f))
          .map(f => {
            const dias = f.sub_status_resuelto_at && f.created_date
              ? differenceInBusinessDays(parseISO(f.sub_status_resuelto_at), parseISO(f.created_date))
              : null;
            const sla = isCritico(f) ? SLA_CRITICO_DAYS : isAlto(f) ? SLA_ALTO_DAYS : SLA_MEDIO_BAJO_DAYS;
            return {
              form_number: f.form_number,
              criticidad:  critMap.get(f.criticality_category_id) || "—",
              semestre:    isH1(f) ? "H1" as const : "H2" as const,
              created_date: f.created_date,
              resuelto_at:  f.sub_status_resuelto_at,
              dias_habiles: dias,
              en_sla: dias !== null ? dias <= sla : null,
            };
          })
          .sort((a, b) => (b.resuelto_at || "").localeCompare(a.resuelto_at || ""));

        setFrancoData({
          criticosH1Total:        criticosH1.length,
          criticosH1Resueltos:    criticosH1.filter(isResuelto).length,
          altosH1Total:           altosH1.length,
          altosH1Resueltos:       altosH1.filter(isResuelto).length,
          mediosBajosH1Total:     mediosBajosH1.length,
          mediosBajosH1Resueltos: mediosBajosH1.filter(isResuelto).length,
          criticosH2Total:        criticosH2.length,
          criticosH2EnSLA:        criticosH2.filter(f => enSLA(f, SLA_CRITICO_DAYS)).length,
          altosH2Total:           altosH2.length,
          altosH2EnSLA:           altosH2.filter(f => enSLA(f, SLA_ALTO_DAYS)).length,
          mediosBajosH2Total:     mediosBajosH2.length,
          mediosBajosH2EnSLA:     mediosBajosH2.filter(f => enSLA(f, SLA_MEDIO_BAJO_DAYS)).length,
          detalle,
        });
      } finally {
        setLoadingFranco(false);
      }
    }
    load();
  }, []);

  // ── Evelyn ────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoadingEvelyn(true);
      try {
        const { data: ocs } = await supabase
          .from("purchase_orders" as any)
          .select("id, order_number, order_date")
          .not("order_number", "is", null);

        const ocList = (ocs || []) as any[];
        const ocIds  = ocList.map((o: any) => o.id);

        const { data: invoices } = ocIds.length > 0
          ? await supabase
              .from("invoices" as any)
              .select("purchase_order_id, invoice_date")
              .in("purchase_order_id", ocIds)
          : { data: [] };

        const invoiceMap = new Map<string, string[]>();
        (invoices || []).forEach((inv: any) => {
          const arr = invoiceMap.get(inv.purchase_order_id) || [];
          arr.push(inv.invoice_date);
          invoiceMap.set(inv.purchase_order_id, arr);
        });

        const ocConFactura = ocList.filter((o: any) => invoiceMap.has(o.id));
        const ocSinFactura = ocList
          .filter((o: any) => !invoiceMap.has(o.id))
          .map((o: any) => ({ order_number: o.order_number, order_date: o.order_date }));

        const velocidades: number[] = [];
        ocConFactura.forEach((o: any) => {
          const invDates = invoiceMap.get(o.id) || [];
          if (!o.order_date || invDates.length === 0) return;
          const earliest = invDates.sort()[0];
          if (!earliest) return;
          const dias = differenceInBusinessDays(parseISO(earliest), parseISO(o.order_date));
          if (dias >= 0) velocidades.push(dias);
        });

        // OTs KPI: forms en sub_status "Ejecutado" (pendientes) y "Resuelto" (completados por Evelyn)
        const { data: execForms } = await supabase
          .from("maintenance_forms" as any)
          .select("id, sub_status, created_date")
          .in("sub_status", ["Ejecutado", "Resuelto"])
          .eq("year", 2026)
          .is("deleted_at", null);

        const execList = (execForms || []) as any[];

        // Semestre en curso
        const now = new Date();
        const isH1 = now.getMonth() < 6;
        const semestreLabel = isH1 ? "H1 (Ene–Jun 2026)" : "H2 (Jul–Dic 2026)";
        const semStart = isH1 ? "2026-01-01" : "2026-07-01";
        const semEnd   = isH1 ? "2026-06-30" : "2026-12-31";
        const semList  = execList.filter((f: any) =>
          f.created_date && f.created_date >= semStart && f.created_date <= semEnd
        );

        setEvelynData({
          ocConNumero:       ocList.length,
          ocConFactura:      ocConFactura.length,
          ocSinFactura,
          velocidadPromedio: velocidades.length > 0
            ? velocidades.reduce((a, b) => a + b, 0) / velocidades.length
            : null,
          formsAnioEjecutados: execList.filter((f: any) => f.sub_status === "Ejecutado").length,
          formsAnioResueltos:  execList.filter((f: any) => f.sub_status === "Resuelto").length,
          formsSemEjecutados:  semList.filter((f: any) => f.sub_status === "Ejecutado").length,
          formsSemResueltos:   semList.filter((f: any) => f.sub_status === "Resuelto").length,
          semestreLabel,
        });
      } finally {
        setLoadingEvelyn(false);
      }
    }
    load();
  }, []);

  // ── Beatriz ───────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoadingBeatriz(true);
      try {
        // Rubros activos (supplier_categories), para nombres y selectores.
        const { data: cats } = await supabase
          .from("supplier_categories")
          .select("id, name, is_active")
          .order("name");

        const { data: zones } = await supabase
          .from("supplier_influence_zones")
          .select("supplier_id, region")
          .limit(5000);

        // Categoría de servicio del proveedor: Compras (does_installations) /
        // Mantenciones (does_maintenance).
        const { data: suppliers } = await supabase
          .from("suppliers")
          .select("id, name, category_id, does_installations, does_maintenance")
          .limit(5000);

        // Rubros de cada proveedor (multi vía assignments; fallback a category_id).
        const { data: assignments } = await supabase
          .from("supplier_category_assignments")
          .select("supplier_id, category_id")
          .limit(10000);

        const catList  = (cats || []).filter((c: { is_active: boolean | null }) => c.is_active !== false) as Array<{ id: string; name: string }>;
        const zoneList = (zones || []) as Array<{ supplier_id: string; region: string }>;
        const suppList = (suppliers || []) as Array<{ id: string; name: string; category_id: string | null; does_installations: boolean; does_maintenance: boolean }>;
        const assignList = (assignments || []) as Array<{ supplier_id: string; category_id: string }>;

        const suppZones = new Map<string, Set<string>>();
        zoneList.forEach((z) => {
          const s = suppZones.get(z.supplier_id) || new Set<string>();
          s.add(z.region);
          suppZones.set(z.supplier_id, s);
        });

        const suppRubros = new Map<string, Set<string>>();
        assignList.forEach((a) => {
          const s = suppRubros.get(a.supplier_id) || new Set<string>();
          s.add(a.category_id);
          suppRubros.set(a.supplier_id, s);
        });

        const allZones = new Set<string>();
        zoneList.forEach((z) => allZones.add(z.region));

        const emptyCov = (): CatCoverage => ({ matrix: {}, suppliersMap: {} });
        const cov: Record<CatKey, CatCoverage> = { compras: emptyCov(), mantenciones: emptyCov() };

        const addTo = (catKey: CatKey, rubroId: string, zone: string, s: { id: string; name: string }) => {
          const key = `${rubroId}||${zone}`;
          const c = cov[catKey];
          c.matrix[key] = (c.matrix[key] || 0) + 1;
          (c.suppliersMap[key] ??= []).push({ id: s.id, name: s.name });
        };

        suppList.forEach((s) => {
          const rubros = suppRubros.get(s.id) ?? (s.category_id ? new Set([s.category_id]) : new Set<string>());
          if (rubros.size === 0) return;
          const sZones = suppZones.get(s.id) || new Set<string>();
          if (sZones.size === 0) return;
          rubros.forEach((rid) => sZones.forEach((z) => {
            if (s.does_installations) addTo("compras", rid, z, s);
            if (s.does_maintenance)   addTo("mantenciones", rid, z, s);
          }));
        });

        [cov.compras, cov.mantenciones].forEach(c =>
          Object.values(c.suppliersMap).forEach(list =>
            list.sort((a, b) => a.name.localeCompare(b.name, "es"))
          )
        );

        setBeatrizData({
          rubros: catList.map((c) => ({ id: c.id, name: c.name })),
          zones:  [...allZones].sort(),
          compras: cov.compras,
          mantenciones: cov.mantenciones,
        });
      } finally {
        setLoadingBeatriz(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">KPIs Equipo Mantenciones</h2>
        <p className="text-sm text-muted-foreground">
          Métricas individuales para pago de bonos · Período de medición: Diciembre 2026
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {showBeatriz && <BeatrizCard data={beatrizData} loading={loadingBeatriz} />}
        {showFranco  && <FrancoCard  data={francoData}  loading={loadingFranco}  />}
        {showEvelyn  && <EvelynCard  data={evelynData}  loading={loadingEvelyn}  francoData={francoData} />}
      </div>

      <div className="text-xs text-muted-foreground border-t pt-4 space-y-1">
        <p><strong>Escala de bonos:</strong> 70% = Underperformance · 100% = Esperado · 130% = Sobrecumplimiento</p>
        <p><strong>Franco SLA H2:</strong> Solo se calculan forms resueltos con fecha registrada desde la implementación de este sistema.</p>
        <p><strong>Evelyn:</strong> Denominador = OC con número de OC creadas por Admin/Finanzas.</p>
      </div>
    </div>
  );
}
