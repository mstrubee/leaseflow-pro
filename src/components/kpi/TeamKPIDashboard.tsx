import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Loader2, Users, Wrench, FileText, TrendingUp, Settings, ChevronDown } from "lucide-react";
import { format, parseISO, differenceInBusinessDays } from "date-fns";
import { es } from "date-fns/locale";

// ─── helpers ────────────────────────────────────────────────────────────────

const H1_END = "2026-06-30";
const SLA_CRITICO_DAYS = 5;
const SLA_ALTO_DAYS = 15;
const SLA_MEDIO_BAJO_DAYS = 30;

function scoreBadge(score: number) {
  if (score >= 115) return <Badge className="bg-emerald-600 text-white">130% — Sobrecumplimiento</Badge>;
  if (score >= 100) return <Badge className="bg-blue-600 text-white">100% — Esperado</Badge>;
  if (score >= 70) return <Badge className="bg-amber-500 text-white">70% — Underperformance</Badge>;
  return <Badge variant="destructive">Bajo mínimo</Badge>;
}

function pct(num: number, den: number) {
  if (den === 0) return 0;
  return Math.round((num / den) * 100);
}

function AdminSection({ label, open, onOpenChange, children }: {
  label?: string; open: boolean; onOpenChange: (v: boolean) => void; children: React.ReactNode;
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground w-full mt-2">
        <Settings className="h-3.5 w-3.5" />
        {label ?? "Configuración admin"}
        <ChevronDown className={`h-3.5 w-3.5 ml-auto transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 border rounded-md p-3 bg-muted/30 space-y-3 text-xs">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function WeightRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 text-muted-foreground">{label}</span>
      <Input
        type="number" min={0} max={100} step={1}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-16 h-6 text-xs text-right px-1"
      />
      <span className="text-muted-foreground">%</span>
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
  criticosH1Total: number;
  criticosH1Resueltos: number;
  altosH1Total: number;
  altosH1Resueltos: number;
  mediosBajosH1Total: number;
  mediosBajosH1Resueltos: number;
  criticosH2Total: number;
  criticosH2EnSLA: number;
  altosH2Total: number;
  altosH2EnSLA: number;
  mediosBajosH2Total: number;
  mediosBajosH2EnSLA: number;
  detalle: Array<{
    form_number: string;
    criticidad: string;
    semestre: "H1" | "H2";
    created_date: string;
    resuelto_at: string | null;
    dias_habiles: number | null;
    en_sla: boolean | null;
  }>;
}

interface EvelynData {
  ocConNumero: number;
  ocConFactura: number;
  ocSinFactura: Array<{ order_number: string; order_date: string | null }>;
  velocidadPromedio: number | null;
}

interface BeatrizData {
  categories: Array<{ id: string; name: string }>;
  zones: string[];
  matrix: Record<string, number>;
  suppliersMap: Record<string, Array<{ id: string; name: string }>>;
}

// ─── Beatriz card ─────────────────────────────────────────────────────────────

const BEATRIZ_EXCLUDED_KEY = "beatriz_kpi_excluded_cats";
const BEATRIZ_CFG_KEY = "beatriz_kpi_cfg";

interface BeatrizCfg { metaMin: number; metaSobre: number; }
const BEATRIZ_DEFAULTS: BeatrizCfg = { metaMin: 3, metaSobre: 5 };

function cellColor(count: number, metaMin: number, metaSobre: number) {
  if (count >= metaSobre) return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (count >= metaMin)   return "bg-blue-50 text-blue-800 border-blue-200";
  if (count >= 1)         return "bg-amber-50 text-amber-800 border-amber-200";
  return "bg-red-50 text-red-700 border-red-200";
}

function BeatrizCard({ data, loading }: { data: BeatrizData | null; loading: boolean }) {
  const [excludedIds, setExcludedIds] = useState<Set<string>>(() =>
    new Set(loadLS<string[]>(BEATRIZ_EXCLUDED_KEY, []))
  );
  const [cfg, setCfg] = useState<BeatrizCfg>(() => loadLS(BEATRIZ_CFG_KEY, BEATRIZ_DEFAULTS));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [expandedCell, setExpandedCell] = useState<string | null>(null);

  const toggleCell = (key: string) => setExpandedCell(prev => prev === key ? null : key);
  const toggleExclude = (id: string) => {
    setExcludedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      saveLS(BEATRIZ_EXCLUDED_KEY, [...next]);
      return next;
    });
  };
  const updateCfg = (patch: Partial<BeatrizCfg>) => {
    setCfg(prev => { const next = { ...prev, ...patch }; saveLS(BEATRIZ_CFG_KEY, next); return next; });
  };

  if (loading) return <CardSkeleton title="Beatriz Valenzuela" subtitle="Cobertura de Proveedores" />;

  const activeCats = data ? data.categories.filter(c => !excludedIds.has(c.id)) : [];
  const zones = data?.zones ?? [];
  const matrix = data?.matrix ?? {};
  const totalComb = activeCats.length * zones.length;
  let cubiertas3 = 0, cubiertas5 = 0;
  activeCats.forEach(c => zones.forEach(z => {
    const count = matrix[`${c.id}||${z}`] ?? 0;
    if (count >= cfg.metaMin)   cubiertas3++;
    if (count >= cfg.metaSobre) cubiertas5++;
  }));

  const score100 = pct(cubiertas3, totalComb);
  const score130 = pct(cubiertas5, totalComb);
  const score = score100 >= 100 ? (score130 >= 100 ? 130 : 100) : score100 >= 70 ? 70 : score100;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Beatriz Valenzuela</CardTitle>
              <p className="text-xs text-muted-foreground">Encargada Activos Fijos y Proveedores</p>
            </div>
          </div>
          {data && scoreBadge(score)}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>Cobertura ≥{cfg.metaMin} proveedores (meta 100%)</span>
            <span className="font-semibold">{score100}%</span>
          </div>
          <Progress value={Math.min(score100, 100)} className="h-2" />
          <p className="text-xs text-muted-foreground mt-1">{cubiertas3} de {totalComb} combinaciones cubiertas</p>
        </div>
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>Cobertura ≥{cfg.metaSobre} proveedores (sobrecumplimiento)</span>
            <span className="font-semibold">{score130}%</span>
          </div>
          <Progress value={Math.min(score130, 100)} className="h-2" />
        </div>

        {data && activeCats.length > 0 && zones.length > 0 && (
          <div className="overflow-x-auto">
            <p className="text-xs font-medium text-muted-foreground mb-1">Matriz cobertura (categoría × zona)</p>
            <table className="text-xs border-collapse w-full">
              <thead>
                <tr>
                  <th className="text-left py-1 pr-2 font-medium text-muted-foreground min-w-[120px]">Categoría</th>
                  {zones.map(z => (
                    <th key={z} className="text-center py-1 px-1 font-medium text-muted-foreground whitespace-nowrap min-w-[60px]" title={z}>
                      {z.length > 8 ? z.slice(0, 8) + "…" : z}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeCats.map(c => {
                  const openZone = zones.find(z => expandedCell === `${c.id}||${z}`);
                  return (
                    <>
                      <tr key={c.id} className="border-t">
                        <td className="py-1 pr-2 truncate max-w-[140px]" title={c.name}>{c.name}</td>
                        {zones.map(z => {
                          const key = `${c.id}||${z}`;
                          const count = matrix[key] ?? 0;
                          const isOpen = expandedCell === key;
                          return (
                            <td key={z} className="text-center py-1 px-1">
                              <button
                                onClick={() => count > 0 ? toggleCell(key) : undefined}
                                className={`inline-block rounded border px-1.5 py-0.5 font-semibold transition-opacity ${cellColor(count, cfg.metaMin, cfg.metaSobre)} ${count > 0 ? "cursor-pointer hover:opacity-70 underline decoration-dotted" : "cursor-default"} ${isOpen ? "ring-2 ring-offset-1 ring-primary" : ""}`}
                              >
                                {count}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                      {openZone && (() => {
                        const key = `${c.id}||${openZone}`;
                        const suppList = data?.suppliersMap?.[key] ?? [];
                        return (
                          <tr key={`${c.id}-detail`} className="bg-muted/40">
                            <td colSpan={zones.length + 1} className="py-2 px-3 text-xs">
                              <div className="flex items-center gap-2 mb-1.5 font-medium">
                                <span>{c.name}</span><span className="text-muted-foreground">·</span>
                                <span className="text-muted-foreground">{openZone}</span>
                                <span className="ml-auto text-muted-foreground">{suppList.length} proveedor{suppList.length !== 1 ? "es" : ""}</span>
                              </div>
                              <ul className="space-y-0.5 columns-2">
                                {suppList.map(s => <li key={s.id} className="text-muted-foreground">• {s.name}</li>)}
                              </ul>
                            </td>
                          </tr>
                        );
                      })()}
                    </>
                  );
                })}
              </tbody>
            </table>
            <div className="flex gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-emerald-100 border border-emerald-200" /> ≥{cfg.metaSobre} óptimo</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-blue-50 border border-blue-200" /> {cfg.metaMin}–{cfg.metaSobre - 1} meta</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-amber-50 border border-amber-200" /> 1–{cfg.metaMin - 1} bajo</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-50 border border-red-200" /> 0 sin cobertura</span>
            </div>
          </div>
        )}

        {data && (
          <AdminSection label="Configuración admin" open={settingsOpen} onOpenChange={setSettingsOpen}>
            <div>
              <p className="font-medium mb-2">Umbrales de cobertura</p>
              <div className="space-y-2">
                <WeightRow label={`Meta (≥N proveedores)`} value={cfg.metaMin} onChange={v => updateCfg({ metaMin: v })} />
                <WeightRow label={`Sobrecumplimiento (≥N proveedores)`} value={cfg.metaSobre} onChange={v => updateCfg({ metaSobre: v })} />
              </div>
            </div>
            <div>
              <p className="font-medium mb-2">Excluir categorías de la meta</p>
              <div className="space-y-1.5">
                {data.categories.map(c => (
                  <label key={c.id} className="flex items-center gap-2 cursor-pointer hover:text-foreground text-muted-foreground">
                    <Checkbox checked={excludedIds.has(c.id)} onCheckedChange={() => toggleExclude(c.id)} />
                    <span className={excludedIds.has(c.id) ? "line-through" : ""}>{c.name}</span>
                  </label>
                ))}
              </div>
              {excludedIds.size > 0 && <p className="text-amber-600 mt-1">{excludedIds.size} categoría{excludedIds.size !== 1 ? "s" : ""} excluida{excludedIds.size !== 1 ? "s" : ""}.</p>}
            </div>
          </AdminSection>
        )}
      </CardContent>
    </Card>
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
}
const FRANCO_DEFAULTS: FrancoCfg = {
  wCritH1: 25, wAltH1: 25, wMedH1: 20, wCritH2: 15, wAltH2: 10, wMedH2: 5,
  tCritH1: 100, tAltH1: 80, tMedH1: 80, tCritH2: 80, tAltH2: 80, tMedH2: 80,
  slaCritico: 5, slaAlto: 15, slaMedioBajo: 30,
};

function FrancoCard({ data, loading }: { data: FrancoData | null; loading: boolean }) {
  const [cfg, setCfg] = useState<FrancoCfg>(() => loadLS(FRANCO_CFG_KEY, FRANCO_DEFAULTS));
  const [settingsOpen, setSettingsOpen] = useState(false);

  const updateCfg = (patch: Partial<FrancoCfg>) => {
    setCfg(prev => { const next = { ...prev, ...patch }; saveLS(FRANCO_CFG_KEY, next); return next; });
  };

  if (loading) return <CardSkeleton title="Franco Leiva" subtitle="Resolución de Forms" />;

  const pCritH1 = data ? pct(data.criticosH1Resueltos,    data.criticosH1Total)    : 0;
  const pAltH1  = data ? pct(data.altosH1Resueltos,       data.altosH1Total)       : 0;
  const pMedH1  = data ? pct(data.mediosBajosH1Resueltos, data.mediosBajosH1Total) : 0;
  const pCritH2 = data ? pct(data.criticosH2EnSLA,        data.criticosH2Total)    : 0;
  const pAltH2  = data ? pct(data.altosH2EnSLA,           data.altosH2Total)       : 0;
  const pMedH2  = data ? pct(data.mediosBajosH2EnSLA,     data.mediosBajosH2Total) : 0;

  const totalW = cfg.wCritH1 + cfg.wAltH1 + cfg.wMedH1 + cfg.wCritH2 + cfg.wAltH2 + cfg.wMedH2;
  const norm = (p: number, t: number, w: number) => t > 0 && totalW > 0 ? (p / t) * 100 * (w / totalW) : 0;
  const score = Math.round(
    norm(pCritH1, cfg.tCritH1, cfg.wCritH1) + norm(pAltH1, cfg.tAltH1, cfg.wAltH1) +
    norm(pMedH1,  cfg.tMedH1,  cfg.wMedH1)  + norm(pCritH2, cfg.tCritH2, cfg.wCritH2) +
    norm(pAltH2,  cfg.tAltH2,  cfg.wAltH2)  + norm(pMedH2,  cfg.tMedH2,  cfg.wMedH2)
  );

  const rows = [
    { label: "Críticos H1",        val: pCritH1, meta: cfg.tCritH1, peso: cfg.wCritH1 },
    { label: "Altos H1",           val: pAltH1,  meta: cfg.tAltH1,  peso: cfg.wAltH1  },
    { label: "Medios+Bajos H1",    val: pMedH1,  meta: cfg.tMedH1,  peso: cfg.wMedH1  },
    { label: `Críticos H2 SLA ≤${cfg.slaCritico}d`,    val: pCritH2, meta: cfg.tCritH2, peso: cfg.wCritH2 },
    { label: `Altos H2 SLA ≤${cfg.slaAlto}d`,          val: pAltH2,  meta: cfg.tAltH2,  peso: cfg.wAltH2  },
    { label: `Medios+Bajos H2 SLA ≤${cfg.slaMedioBajo}d`, val: pMedH2, meta: cfg.tMedH2, peso: cfg.wMedH2 },
  ];

  const warnTotal = totalW !== 100 && <p className="text-amber-600 text-xs">⚠ Las ponderaciones suman {totalW}% (deben sumar 100%)</p>;

  return (
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
          {data && scoreBadge(score)}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map(r => (
          <div key={r.label}>
            <div className="flex justify-between text-xs mb-1">
              <span>{r.label} <span className="text-muted-foreground">(meta: {r.meta}% · peso: {r.peso}%)</span></span>
              <span className={`font-semibold ${r.val >= r.meta ? "text-emerald-600" : r.val >= r.meta * 0.7 ? "text-amber-500" : "text-destructive"}`}>
                {r.val}%
              </span>
            </div>
            <Progress value={Math.min((r.val / r.meta) * 100, 100)} className="h-1.5" />
          </div>
        ))}

        {data && data.detalle.length > 0 && (
          <details className="text-xs mt-2">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Ver detalle de forms resueltos ({data.detalle.filter(d => d.resuelto_at).length})
            </summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-1 pr-2">Form</th>
                    <th className="text-left py-1 pr-2">Criticidad</th>
                    <th className="text-left py-1 pr-2">Sem.</th>
                    <th className="text-left py-1 pr-2">Creado</th>
                    <th className="text-left py-1 pr-2">Resuelto</th>
                    <th className="text-right py-1">Días háb.</th>
                  </tr>
                </thead>
                <tbody>
                  {data.detalle.filter(d => d.resuelto_at).map((d, i) => (
                    <tr key={i} className="border-b hover:bg-muted/30">
                      <td className="py-1 pr-2 font-mono">{d.form_number}</td>
                      <td className="py-1 pr-2">{d.criticidad}</td>
                      <td className="py-1 pr-2">{d.semestre}</td>
                      <td className="py-1 pr-2">{d.created_date ? format(parseISO(d.created_date), "dd/MM/yy") : "—"}</td>
                      <td className="py-1 pr-2">{d.resuelto_at ? format(parseISO(d.resuelto_at), "dd/MM/yy") : "—"}</td>
                      <td className={`py-1 text-right font-semibold ${d.en_sla ? "text-emerald-600" : "text-destructive"}`}>{d.dias_habiles ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}

        <AdminSection open={settingsOpen} onOpenChange={setSettingsOpen}>
          <div>
            <p className="font-medium mb-2">Ponderaciones (%)</p>
            {warnTotal}
            <div className="space-y-1.5 mt-1">
              <WeightRow label="Críticos H1"     value={cfg.wCritH1} onChange={v => updateCfg({ wCritH1: v })} />
              <WeightRow label="Altos H1"         value={cfg.wAltH1}  onChange={v => updateCfg({ wAltH1: v })}  />
              <WeightRow label="Medios+Bajos H1"  value={cfg.wMedH1}  onChange={v => updateCfg({ wMedH1: v })}  />
              <WeightRow label="Críticos H2"      value={cfg.wCritH2} onChange={v => updateCfg({ wCritH2: v })} />
              <WeightRow label="Altos H2"         value={cfg.wAltH2}  onChange={v => updateCfg({ wAltH2: v })}  />
              <WeightRow label="Medios+Bajos H2"  value={cfg.wMedH2}  onChange={v => updateCfg({ wMedH2: v })}  />
            </div>
          </div>
          <div>
            <p className="font-medium mb-2">Metas (%)</p>
            <div className="space-y-1.5">
              <WeightRow label="Meta Críticos H1"     value={cfg.tCritH1} onChange={v => updateCfg({ tCritH1: v })} />
              <WeightRow label="Meta Altos H1"         value={cfg.tAltH1}  onChange={v => updateCfg({ tAltH1: v })}  />
              <WeightRow label="Meta Medios+Bajos H1"  value={cfg.tMedH1}  onChange={v => updateCfg({ tMedH1: v })}  />
              <WeightRow label="Meta Críticos H2"      value={cfg.tCritH2} onChange={v => updateCfg({ tCritH2: v })} />
              <WeightRow label="Meta Altos H2"         value={cfg.tAltH2}  onChange={v => updateCfg({ tAltH2: v })}  />
              <WeightRow label="Meta Medios+Bajos H2"  value={cfg.tMedH2}  onChange={v => updateCfg({ tMedH2: v })}  />
            </div>
          </div>
          <div>
            <p className="font-medium mb-2">SLA H2 (días hábiles)</p>
            <div className="space-y-1.5">
              <WeightRow label="SLA Críticos"     value={cfg.slaCritico}    onChange={v => updateCfg({ slaCritico: v })}    />
              <WeightRow label="SLA Altos"         value={cfg.slaAlto}       onChange={v => updateCfg({ slaAlto: v })}       />
              <WeightRow label="SLA Medios+Bajos"  value={cfg.slaMedioBajo}  onChange={v => updateCfg({ slaMedioBajo: v })}  />
            </div>
          </div>
        </AdminSection>
      </CardContent>
    </Card>
  );
}

// ─── Evelyn card ──────────────────────────────────────────────────────────────

const EVELYN_CFG_KEY = "evelyn_kpi_cfg";
interface EvelynCfg {
  wCobertura: number; wVelocidad: number;
  velOptimo: number; velMeta: number; velMinimo: number;
}
const EVELYN_DEFAULTS: EvelynCfg = {
  wCobertura: 70, wVelocidad: 30,
  velOptimo: 3, velMeta: 5, velMinimo: 10,
};

function EvelynCard({ data, loading, francoData }: { data: EvelynData | null; loading: boolean; francoData: FrancoData | null }) {
  const [cfg, setCfg] = useState<EvelynCfg>(() => loadLS(EVELYN_CFG_KEY, EVELYN_DEFAULTS));
  const [settingsOpen, setSettingsOpen] = useState(false);

  const updateCfg = (patch: Partial<EvelynCfg>) => {
    setCfg(prev => { const next = { ...prev, ...patch }; saveLS(EVELYN_CFG_KEY, next); return next; });
  };

  if (loading) return <CardSkeleton title="Evelyn Padilla" subtitle="OC y Facturas al Día" />;

  const cobertura = data ? pct(data.ocConFactura, data.ocConNumero) : 0;
  const velocidad = data?.velocidadPromedio ?? null;

  const velScore = velocidad === null ? 0
    : velocidad <= cfg.velOptimo ? 130
    : velocidad <= cfg.velMeta   ? 100
    : velocidad <= cfg.velMinimo ? 70
    : 0;

  const totalW = cfg.wCobertura + cfg.wVelocidad;
  const score = totalW > 0 ? Math.round((cobertura * cfg.wCobertura + velScore * cfg.wVelocidad) / totalW) : 0;
  const superPerformance = cobertura >= 100 && velocidad !== null && velocidad <= cfg.velOptimo;
  const warnTotal = totalW !== 100 && <p className="text-amber-600">⚠ Las ponderaciones suman {totalW}% (deben sumar 100%)</p>;

  return (
    <Card className={superPerformance ? "border-emerald-500 border-2" : ""}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Evelyn Padilla</CardTitle>
              <p className="text-xs text-muted-foreground">Encargada de Digitación y Control de Gestión</p>
            </div>
          </div>
          {data && scoreBadge(score)}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>OC con factura registrada (meta: 100%) <span className="text-muted-foreground text-xs">({cfg.wCobertura}%)</span></span>
            <span className="font-semibold">{cobertura}%</span>
          </div>
          <Progress value={cobertura} className="h-2" />
          {data && <p className="text-xs text-muted-foreground mt-1">{data.ocConFactura} de {data.ocConNumero} OC con factura</p>}
        </div>

        {velocidad !== null && (
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>Velocidad promedio de carga <span className="text-muted-foreground text-xs">({cfg.wVelocidad}%)</span></span>
              <span className={`font-semibold ${velocidad <= cfg.velOptimo ? "text-emerald-600" : velocidad <= cfg.velMeta ? "text-blue-600" : velocidad <= cfg.velMinimo ? "text-amber-500" : "text-destructive"}`}>
                {velocidad.toFixed(1)} días háb.
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Óptimo: ≤{cfg.velOptimo}d · Meta: ≤{cfg.velMeta}d · Mínimo: ≤{cfg.velMinimo}d</p>
          </div>
        )}

        {superPerformance && (
          <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 space-y-1">
            <div className="flex items-center gap-1 font-semibold"><TrendingUp className="h-3.5 w-3.5" /> Equipo en ritmo óptimo</div>
            {francoData && <p>Franco tiene {francoData.criticosH1Resueltos + francoData.altosH1Resueltos} forms cerrados habilitados por OC completas.</p>}
          </div>
        )}

        {data && data.ocSinFactura.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              {data.ocSinFactura.length} OC sin factura registrada (pendientes)
            </summary>
            <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
              {data.ocSinFactura.map((oc, i) => (
                <div key={i} className="flex justify-between border-b pb-1">
                  <span className="font-mono">{oc.order_number}</span>
                  <span className="text-muted-foreground">{oc.order_date ? format(parseISO(oc.order_date), "dd/MM/yyyy") : "—"}</span>
                </div>
              ))}
            </div>
          </details>
        )}

        <AdminSection open={settingsOpen} onOpenChange={setSettingsOpen}>
          {warnTotal}
          <div>
            <p className="font-medium mb-2">Ponderaciones (%)</p>
            <div className="space-y-1.5">
              <WeightRow label="Cobertura OC"     value={cfg.wCobertura} onChange={v => updateCfg({ wCobertura: v })} />
              <WeightRow label="Velocidad carga"  value={cfg.wVelocidad} onChange={v => updateCfg({ wVelocidad: v })} />
            </div>
          </div>
          <div>
            <p className="font-medium mb-2">Velocidad (días hábiles)</p>
            <div className="space-y-1.5">
              <WeightRow label="Óptimo (≤N días)"  value={cfg.velOptimo}  onChange={v => updateCfg({ velOptimo: v })}  />
              <WeightRow label="Meta (≤N días)"     value={cfg.velMeta}    onChange={v => updateCfg({ velMeta: v })}    />
              <WeightRow label="Mínimo (≤N días)"   value={cfg.velMinimo}  onChange={v => updateCfg({ velMinimo: v })}  />
            </div>
          </div>
        </AdminSection>
      </CardContent>
    </Card>
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
  const [francoData, setFrancoData] = useState<FrancoData | null>(null);
  const [evelynData, setEvelynData] = useState<EvelynData | null>(null);
  const [beatrizData, setBeatrizData] = useState<BeatrizData | null>(null);
  const [loadingFranco, setLoadingFranco] = useState(true);
  const [loadingEvelyn, setLoadingEvelyn] = useState(true);
  const [loadingBeatriz, setLoadingBeatriz] = useState(true);

  // ── Franco ────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoadingFranco(true);
      try {
        // Fetch criticality categories
        const { data: cats } = await supabase
          .from("maintenance_criticality_categories" as any)
          .select("id, code, name");
        const critMap = new Map<string, string>();
        (cats || []).forEach((c: any) => critMap.set(c.id, c.code));

        const criticoIds   = (cats || []).filter((c: any) => c.code === "critico").map((c: any) => c.id);
        const altoIds      = (cats || []).filter((c: any) => c.code === "alto").map((c: any) => c.id);
        const medioBajoIds = (cats || []).filter((c: any) => ["medio", "bajo"].includes(c.code)).map((c: any) => c.id);

        // Fetch all forms (all criticalities) this year
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

        const criticosH1   = allForms.filter(f => isCritico(f)   && isH1(f));
        const altosH1      = allForms.filter(f => isAlto(f)      && isH1(f));
        const mediosBajosH1 = allForms.filter(f => isMedioBajo(f) && isH1(f));
        const criticosH2   = allForms.filter(f => isCritico(f)   && isH2(f));
        const altosH2      = allForms.filter(f => isAlto(f)      && isH2(f));
        const mediosBajosH2 = allForms.filter(f => isMedioBajo(f) && isH2(f));

        // SLA: only forms with sub_status_resuelto_at (tracked from today)
        const enSLA = (f: any, maxDays: number) => {
          if (!f.sub_status_resuelto_at || !f.created_date) return false;
          const dias = differenceInBusinessDays(parseISO(f.sub_status_resuelto_at), parseISO(f.created_date));
          return dias <= maxDays;
        };

        // Detalle para tabla
        const detalle = allForms
          .filter(f => f.sub_status_resuelto_at || isResuelto(f))
          .map(f => {
            const dias = f.sub_status_resuelto_at && f.created_date
              ? differenceInBusinessDays(parseISO(f.sub_status_resuelto_at), parseISO(f.created_date))
              : null;
            const sla = isCritico(f) ? SLA_CRITICO_DAYS : isAlto(f) ? SLA_ALTO_DAYS : SLA_MEDIO_BAJO_DAYS;
            return {
              form_number: f.form_number,
              criticidad: critMap.get(f.criticality_category_id) || "—",
              semestre: isH1(f) ? "H1" as const : "H2" as const,
              created_date: f.created_date,
              resuelto_at: f.sub_status_resuelto_at,
              dias_habiles: dias,
              en_sla: dias !== null ? dias <= sla : null,
            };
          })
          .sort((a, b) => (b.resuelto_at || "").localeCompare(a.resuelto_at || ""));

        setFrancoData({
          criticosH1Total: criticosH1.length,
          criticosH1Resueltos: criticosH1.filter(isResuelto).length,
          altosH1Total: altosH1.length,
          altosH1Resueltos: altosH1.filter(isResuelto).length,
          mediosBajosH1Total: mediosBajosH1.length,
          mediosBajosH1Resueltos: mediosBajosH1.filter(isResuelto).length,
          criticosH2Total: criticosH2.length,
          criticosH2EnSLA: criticosH2.filter(f => enSLA(f, SLA_CRITICO_DAYS)).length,
          altosH2Total: altosH2.length,
          altosH2EnSLA: altosH2.filter(f => enSLA(f, SLA_ALTO_DAYS)).length,
          mediosBajosH2Total: mediosBajosH2.length,
          mediosBajosH2EnSLA: mediosBajosH2.filter(f => enSLA(f, SLA_MEDIO_BAJO_DAYS)).length,
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
        const ocIds = ocList.map((o: any) => o.id);

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

        // Velocidad: days between order_date and earliest invoice_date
        const velocidades: number[] = [];
        ocConFactura.forEach((o: any) => {
          const invDates = invoiceMap.get(o.id) || [];
          if (!o.order_date || invDates.length === 0) return;
          const earliest = invDates.sort()[0];
          if (!earliest) return;
          const dias = differenceInBusinessDays(parseISO(earliest), parseISO(o.order_date));
          if (dias >= 0) velocidades.push(dias);
        });

        setEvelynData({
          ocConNumero: ocList.length,
          ocConFactura: ocConFactura.length,
          ocSinFactura,
          velocidadPromedio: velocidades.length > 0
            ? velocidades.reduce((a, b) => a + b, 0) / velocidades.length
            : null,
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
        // Load ALL categories (no parent_id filter), ordered by name
        const { data: cats, error: catsErr } = await supabase
          .from("supplier_categories" as any)
          .select("id, name")
          .order("name");

        const { data: zones, error: zonesErr } = await supabase
          .from("supplier_influence_zones" as any)
          .select("supplier_id, region")
          .limit(5000);

        // Fetch all suppliers with name (suppliers table has no deleted_at)
        const { data: suppliers, error: suppsErr } = await supabase
          .from("suppliers" as any)
          .select("id, name, category_id")
          .not("category_id", "is", null)
          .limit(5000);

        console.log("[Beatriz] cats:", cats?.length, catsErr);
        console.log("[Beatriz] zones:", zones?.length, zonesErr);
        console.log("[Beatriz] suppliers:", suppliers?.length, suppsErr);

        const catList  = (cats || []) as any[];
        const zoneList = (zones || []) as any[];
        const suppList = (suppliers || []) as any[];

        // Map supplier → set of zones
        const suppZones = new Map<string, Set<string>>();
        zoneList.forEach((z: any) => {
          const s = suppZones.get(z.supplier_id) || new Set();
          s.add(z.region);
          suppZones.set(z.supplier_id, s);
        });

        // Unique zones sorted
        const allZones = new Set<string>();
        zoneList.forEach((z: any) => allZones.add(z.region));

        // Build count matrix + supplier name lists per category×zone
        const matrix: Record<string, number> = {};
        const suppliersMap: Record<string, Array<{ id: string; name: string }>> = {};

        suppList.forEach((s: any) => {
          const sZones = suppZones.get(s.id) || new Set<string>();
          sZones.forEach((z: string) => {
            const key = `${s.category_id}||${z}`;
            matrix[key] = (matrix[key] || 0) + 1;
            if (!suppliersMap[key]) suppliersMap[key] = [];
            suppliersMap[key].push({ id: s.id, name: s.name });
          });
        });

        // Sort each cell's supplier list alphabetically
        Object.values(suppliersMap).forEach(list =>
          list.sort((a, b) => a.name.localeCompare(b.name, "es"))
        );

        setBeatrizData({
          categories: catList.map((c: any) => ({ id: c.id, name: c.name })),
          zones: [...allZones].sort(),
          matrix,
          suppliersMap,
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
        <BeatrizCard data={beatrizData} loading={loadingBeatriz} />
        <FrancoCard  data={francoData}  loading={loadingFranco} />
        <EvelynCard  data={evelynData}  loading={loadingEvelyn} francoData={francoData} />
      </div>

      <div className="text-xs text-muted-foreground border-t pt-4 space-y-1">
        <p><strong>Escala de bonos:</strong> 70% = Underperformance · 100% = Esperado · 130% = Sobrecumplimiento</p>
        <p><strong>Franco SLA H2:</strong> Solo se calculan forms resueltos con fecha registrada desde la implementación de este sistema.</p>
        <p><strong>Evelyn:</strong> Denominador = OC con número de OC creadas por Admin/Finanzas.</p>
      </div>
    </div>
  );
}
