import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Users, Wrench, FileText, TrendingUp } from "lucide-react";
import { format, parseISO, differenceInBusinessDays } from "date-fns";
import { es } from "date-fns/locale";

// ─── helpers ────────────────────────────────────────────────────────────────

const H1_END = "2026-06-30";
const SLA_CRITICO_DAYS = 5;
const SLA_ALTO_DAYS = 15;

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

// ─── types ───────────────────────────────────────────────────────────────────

interface FrancoData {
  criticosH1Total: number;
  criticosH1Resueltos: number;
  altosH1Total: number;
  altosH1Resueltos: number;
  criticosH2Total: number;
  criticosH2EnSLA: number;
  altosH2Total: number;
  altosH2EnSLA: number;
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
  totalCombinaciones: number;
  cubiertas3: number;
  cubiertas5: number;
  gaps: Array<{ categoria: string; zona: string; count: number }>;
}

// ─── Beatriz card ─────────────────────────────────────────────────────────────

function BeatrizCard({ data, loading }: { data: BeatrizData | null; loading: boolean }) {
  if (loading) return <CardSkeleton title="Beatriz Valenzuela" subtitle="Cobertura de Proveedores" />;

  const score100 = data ? pct(data.cubiertas3, data.totalCombinaciones) : 0;
  const score130 = data ? pct(data.cubiertas5, data.totalCombinaciones) : 0;
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
            <span>Cobertura ≥3 proveedores (meta 100%)</span>
            <span className="font-semibold">{score100}%</span>
          </div>
          <Progress value={Math.min(score100, 100)} className="h-2" />
        </div>
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>Cobertura ≥5 proveedores (sobrecumplimiento)</span>
            <span className="font-semibold">{score130}%</span>
          </div>
          <Progress value={Math.min(score130, 100)} className="h-2" />
        </div>
        {data && data.gaps.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              {data.gaps.length} combinación{data.gaps.length !== 1 ? "es" : ""} sin cobertura suficiente
            </summary>
            <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
              {data.gaps.map((g, i) => (
                <div key={i} className="flex justify-between border-b pb-1">
                  <span>{g.categoria} / {g.zona}</span>
                  <span className="text-muted-foreground">{g.count} proveedor{g.count !== 1 ? "es" : ""}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Franco card ──────────────────────────────────────────────────────────────

function FrancoCard({ data, loading }: { data: FrancoData | null; loading: boolean }) {
  if (loading) return <CardSkeleton title="Franco Leiva" subtitle="Resolución de Forms" />;

  const pCritH1 = data ? pct(data.criticosH1Resueltos, data.criticosH1Total) : 0;
  const pAltH1  = data ? pct(data.altosH1Resueltos,   data.altosH1Total)    : 0;
  const pCritH2 = data ? pct(data.criticosH2EnSLA,    data.criticosH2Total) : 0;
  const pAltH2  = data ? pct(data.altosH2EnSLA,       data.altosH2Total)    : 0;

  // weighted score: 30/30/30/10
  const score = Math.round(
    (pCritH1 * 0.30) +
    ((pAltH1 / 80) * 100 * 0.30) +  // 100% normalized to 80% target
    (pCritH2 * 0.30) +
    ((pAltH2 / 90) * 100 * 0.10)    // 100% normalized to 90% target
  );

  const rows = [
    { label: "Críticos H1 (meta: 100%)", pct: pCritH1, peso: "30%", meta: 100 },
    { label: "Altos H1 (meta: 80%)",     pct: pAltH1,  peso: "30%", meta: 80 },
    { label: "Críticos H2 SLA ≤5d (meta: 100%)", pct: pCritH2, peso: "30%", meta: 100 },
    { label: "Altos H2 SLA ≤15d (meta: 90%)",    pct: pAltH2,  peso: "10%", meta: 90 },
  ];

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
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex justify-between text-xs mb-1">
              <span>{r.label} <span className="text-muted-foreground">({r.peso})</span></span>
              <span className={`font-semibold ${r.pct >= r.meta ? "text-emerald-600" : r.pct >= r.meta * 0.7 ? "text-amber-500" : "text-destructive"}`}>
                {r.pct}%
              </span>
            </div>
            <Progress value={Math.min((r.pct / r.meta) * 100, 100)} className="h-1.5" />
          </div>
        ))}

        {data && data.detalle.length > 0 && (
          <details className="text-xs mt-2">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Ver detalle de forms resueltos desde hoy ({data.detalle.filter(d => d.resuelto_at).length})
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
                      <td className={`py-1 text-right font-semibold ${d.en_sla ? "text-emerald-600" : "text-destructive"}`}>
                        {d.dias_habiles ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.detalle.filter(d => d.resuelto_at && d.semestre === "H2" && d.dias_habiles !== null).length > 0 && (
                <p className="mt-2 text-muted-foreground">
                  Promedio SLA H2:{" "}
                  <span className="font-semibold text-foreground">
                    {Math.round(
                      data.detalle
                        .filter(d => d.resuelto_at && d.semestre === "H2" && d.dias_habiles !== null)
                        .reduce((acc, d) => acc + (d.dias_habiles ?? 0), 0) /
                      data.detalle.filter(d => d.resuelto_at && d.semestre === "H2" && d.dias_habiles !== null).length
                    )}{" "}
                    días hábiles
                  </span>
                </p>
              )}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Evelyn card ──────────────────────────────────────────────────────────────

function EvelynCard({ data, loading, francoData }: { data: EvelynData | null; loading: boolean; francoData: FrancoData | null }) {
  if (loading) return <CardSkeleton title="Evelyn Padilla" subtitle="OC y Facturas al Día" />;

  const cobertura = data ? pct(data.ocConFactura, data.ocConNumero) : 0;
  const velocidad = data?.velocidadPromedio ?? null;

  // score: 70% cobertura + 30% velocidad
  const velScore = velocidad === null ? 0
    : velocidad <= 3 ? 130
    : velocidad <= 5 ? 100
    : velocidad <= 10 ? 70
    : 0;
  const score = Math.round(cobertura * 0.70 + velScore * 0.30);
  const superPerformance = cobertura >= 100 && velocidad !== null && velocidad <= 3;

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
            <span>OC con factura registrada (meta: 100%)</span>
            <span className="font-semibold">{cobertura}%</span>
          </div>
          <Progress value={cobertura} className="h-2" />
          {data && <p className="text-xs text-muted-foreground mt-1">{data.ocConFactura} de {data.ocConNumero} OC con factura</p>}
        </div>

        {velocidad !== null && (
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>Velocidad promedio de carga</span>
              <span className={`font-semibold ${velocidad <= 3 ? "text-emerald-600" : velocidad <= 5 ? "text-blue-600" : velocidad <= 10 ? "text-amber-500" : "text-destructive"}`}>
                {velocidad.toFixed(1)} días háb.
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Meta: ≤5 días · Sobrecumplimiento: ≤3 días</p>
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

        const criticoIds = (cats || []).filter((c: any) => c.code === "critico").map((c: any) => c.id);
        const altoIds    = (cats || []).filter((c: any) => c.code === "alto").map((c: any) => c.id);

        // Fetch all forms with criticidad crítico or alto, this year
        const { data: forms } = await supabase
          .from("maintenance_forms" as any)
          .select("id, form_number, sub_status, created_date, sub_status_resuelto_at, criticality_category_id")
          .in("criticality_category_id", [...criticoIds, ...altoIds])
          .eq("year", 2026)
          .is("deleted_at", null);

        const allForms = (forms || []) as any[];

        const isH1 = (f: any) => f.created_date && f.created_date <= H1_END;
        const isH2 = (f: any) => f.created_date && f.created_date > H1_END;
        const isResuelto = (f: any) => f.sub_status === "resuelto";
        const isCritico = (f: any) => criticoIds.includes(f.criticality_category_id);
        const isAlto    = (f: any) => altoIds.includes(f.criticality_category_id);

        const criticosH1 = allForms.filter(f => isCritico(f) && isH1(f));
        const altosH1    = allForms.filter(f => isAlto(f)    && isH1(f));
        const criticosH2 = allForms.filter(f => isCritico(f) && isH2(f));
        const altosH2    = allForms.filter(f => isAlto(f)    && isH2(f));

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
            const sla = isCritico(f) ? SLA_CRITICO_DAYS : SLA_ALTO_DAYS;
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
          criticosH2Total: criticosH2.length,
          criticosH2EnSLA: criticosH2.filter(f => enSLA(f, SLA_CRITICO_DAYS)).length,
          altosH2Total: altosH2.length,
          altosH2EnSLA: altosH2.filter(f => enSLA(f, SLA_ALTO_DAYS)).length,
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
        const { data: cats } = await supabase
          .from("supplier_categories" as any)
          .select("id, name")
          .is("parent_id", null);

        const { data: zones } = await supabase
          .from("supplier_influence_zones" as any)
          .select("supplier_id, region");

        const { data: suppliers } = await supabase
          .from("suppliers" as any)
          .select("id, category_id");

        const catList   = (cats || []) as any[];
        const zoneList  = (zones || []) as any[];
        const suppList  = (suppliers || []) as any[];

        // Map supplier → zones
        const suppZones = new Map<string, Set<string>>();
        zoneList.forEach((z: any) => {
          const s = suppZones.get(z.supplier_id) || new Set();
          s.add(z.region);
          suppZones.set(z.supplier_id, s);
        });

        // Get unique zones across all suppliers
        const allZones = new Set<string>();
        zoneList.forEach((z: any) => allZones.add(z.region));

        // Count suppliers per categoria×zona
        const combMap = new Map<string, number>();
        suppList.forEach((s: any) => {
          const zones = suppZones.get(s.id) || new Set();
          zones.forEach((z) => {
            const key = `${s.category_id}||${z}`;
            combMap.set(key, (combMap.get(key) || 0) + 1);
          });
        });

        const catNames = new Map(catList.map((c: any) => [c.id, c.name]));
        const total = catList.length * allZones.size;

        let cubiertas3 = 0, cubiertas5 = 0;
        const gaps: BeatrizData["gaps"] = [];

        catList.forEach((c: any) => {
          allZones.forEach((z) => {
            const count = combMap.get(`${c.id}||${z}`) || 0;
            if (count >= 3) cubiertas3++;
            if (count >= 5) cubiertas5++;
            if (count < 3) gaps.push({ categoria: c.name, zona: z, count });
          });
        });

        setBeatrizData({ totalCombinaciones: total, cubiertas3, cubiertas5, gaps });
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
