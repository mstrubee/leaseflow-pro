import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Loader2, Check, FileText, Sheet, MapPin } from "lucide-react";
import { exportBusinessCasePDF, exportBusinessCaseExcel } from "@/lib/businessCase/exportV2";
import { listSavedIsochrones, fetchSalesProjection, normalizeIsochroneName } from "@/lib/geochile/client";
import { toast } from "sonner";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip as RTooltip, Legend, CartesianGrid,
} from "recharts";
import { useBusinessCaseV2 } from "@/hooks/useBusinessCaseV2";
import type { BCSeed, BCInputs, FormatoLocal } from "@/lib/businessCase/model";
import { FORMATOS_LOCAL, FORMATO_PRESETS, OCUPACION_TARGET_MM, ocupPctFromVenta } from "@/lib/businessCase/model";
import { fmtMM, fmtPct } from "@/lib/businessCase/format";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  seed: BCSeed;
  canEdit?: boolean;
}

const PIE_COLORS = ["#3b82f6", "#8b5cf6", "#f59e0b", "#10b981", "#64748b", "#f43f5e", "#06b6d4"];
const yearCols = [0, 1, 2, 3, 4, 5];

// Default de "Apertura al público" = inicio + gracia (mismo cálculo que dtCanonIso
// en computeBC), mostrado en el campo hasta que el usuario lo modifique a mano.
function addMonthsIso(iso: string, months: number): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "";
  d.setMonth(d.getMonth() + (months || 0));
  return d.toISOString().slice(0, 10);
}

function NumCell({ value, onChange, disabled, w = "w-20", decimals }: { value: number; onChange: (v: number) => void; disabled?: boolean; w?: string; step?: string; decimals?: number }) {
  return (
    <DecimalInput value={value} decimals={decimals}
      onChange={(v) => { if (v !== null) onChange(v); }} disabled={disabled}
      className={`h-7 ${w} text-xs text-right px-1`} />
  );
}

export function BusinessCaseFinanciero({ open, onOpenChange, contractId, seed, canEdit }: Props) {
  const { config, inputs, result, loading, saving, update, updateArr, updateVentaConCrecimiento, setFormato, setInvOverride } =
    useBusinessCaseV2({ contractId, seed, enabled: open });
  const ro = !canEdit;

  const [syncingGeo, setSyncingGeo] = useState(false);

  const handleSyncGeoplanet = async () => {
    if (!inputs?.nombre?.trim()) {
      toast.error("Ingresá el nombre del proyecto antes de sincronizar");
      return;
    }
    setSyncingGeo(true);
    try {
      const target = normalizeIsochroneName(inputs.nombre);
      const isochrones = await listSavedIsochrones();
      const matches = isochrones.filter((iso) => normalizeIsochroneName(iso.name) === target);
      if (matches.length === 0) {
        toast.error(`No se encontró ninguna isócrona en Geochile Compass llamada "${inputs.nombre}"`);
        return;
      }
      if (matches.length > 1) {
        toast.error(`Hay ${matches.length} isócronas llamadas "${inputs.nombre}" en Geochile Compass — asigná una específica desde el Informe Directorio`);
        return;
      }
      const projection = await fetchSalesProjection(matches[0].id);
      update("ventaMes", projection.ventaMes);
      // Curva de maduración de Geochile (columna "Crec." de su panel) — NO
      // toca ufRates, que es la UF real/inflación, un supuesto aparte.
      update("ventaGrowthPct", projection.growthRates);
      // Recalibrar Ocupación % sobre la nueva Venta Año 1 (mismo criterio que
      // updateVentaConCrecimiento/setFormato — sigue editable a mano después).
      update("ocupPct", ocupPctFromVenta(inputs.formato, projection.ventaMes[0]));
      // La proyección de Geochile Compass trae su propio ajuste "Express"
      // (independiente del "Formato de local" de este Business Case) — si no
      // coinciden, las ventas importadas están calibradas para el formato
      // equivocado y hay que avisar en vez de aplicarlas en silencio.
      const bcIsExpress = inputs.formato === "Express";
      const geoIsExpress = !!projection.meta?.isExpress;
      if (bcIsExpress !== geoIsExpress) {
        toast.warning(
          `Ojo: este Business Case es "${inputs.formato}", pero la proyección de "${matches[0].name}" en Geochile Compass ${geoIsExpress ? "SÍ" : "NO"} tiene el ajuste Express aplicado. Las ventas importadas pueden estar sobre/sub-estimadas — revisá el ajuste Express de esa isócrona en Geochile Compass.`,
          { duration: 12000 },
        );
      } else {
        toast.success(`Ventas sincronizadas desde "${matches[0].name}" (Geochile Compass)`);
      }
    } catch (err: any) {
      toast.error(err.message || "No se pudo sincronizar con Geochile Compass");
    } finally {
      setSyncingGeo(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Business Case Financiero
            {saving && <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> guardando…</span>}
            {!saving && !loading && <span className="text-xs text-green-600 inline-flex items-center gap-1"><Check className="h-3 w-3" /> guardado</span>}
            {inputs && result && (
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => exportBusinessCasePDF(inputs, result)}>
                  <FileText className="h-3.5 w-3.5" /> PDF
                </Button>
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
                  onClick={() => {
                    toast.promise(exportBusinessCaseExcel(inputs, result), {
                      loading: "Generando Excel…", success: "Excel generado", error: "No se pudo generar el Excel",
                    });
                  }}>
                  <Sheet className="h-3.5 w-3.5" /> Excel
                </Button>
              </div>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading || !inputs || !result ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <Tabs defaultValue="resumen" className="w-full">
            <TabsList className="flex flex-wrap h-auto">
              <TabsTrigger value="resumen">📋 Resumen</TabsTrigger>
              <TabsTrigger value="inversion">💰 Inversión</TabsTrigger>
              <TabsTrigger value="proyecciones">📈 Proyecciones</TabsTrigger>
              <TabsTrigger value="retorno">🎯 Retorno</TabsTrigger>
              <TabsTrigger value="supuestos">⚙️ Supuestos</TabsTrigger>
            </TabsList>

            {/* ───────── RESUMEN ───────── */}
            <TabsContent value="resumen" className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi label="TIR" value={result.tir != null ? fmtPct(result.tir) : "N/A"} good={result.tir != null && result.tir > inputs.waccRate / 100} />
                <Kpi label="VAN (MM CLP)" value={`$${fmtMM(result.van)}`} good={result.van > 0} />
                <Kpi label="Payback" value={result.paybackAnio > 0 ? `${result.paybackAnio} año${result.paybackAnio === 1 ? "" : "s"}` : ">5 años"} />
                <Kpi label="Inversión (MM)" value={`$${fmtMM(result.totalCapex)}`} />
              </div>

              <Card title="Información del Proyecto">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Field label="Nombre"><Input value={inputs.nombre} disabled={ro} onChange={(e) => update("nombre", e.target.value)} className="h-8 text-sm" /></Field>
                  <Field label="Dirección"><Input value={inputs.direccion} disabled={ro} onChange={(e) => update("direccion", e.target.value)} className="h-8 text-sm" /></Field>
                  <Field label="Comuna"><Input value={inputs.comuna} disabled={ro} onChange={(e) => update("comuna", e.target.value)} className="h-8 text-sm" /></Field>
                  <Field label="Tipo">
                    <Select value={inputs.tipo} disabled={ro} onValueChange={(v) => update("tipo", v)}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>{config.tiposProyecto.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="Categoría">
                    <Select value={inputs.categoria} disabled={ro} onValueChange={(v) => update("categoria", v)}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>{config.categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <FieldConv
                    label="Formato de local"
                    conv={`Precarga ${FORMATO_PRESETS[inputs.formato].personalY1} trabajadores, $${FORMATO_PRESETS[inputs.formato].inventarioMM} MM de inventario y Ocupación calibrada a $${OCUPACION_TARGET_MM[inputs.formato]} MM/mes (editables)`}
                  >
                    <Select value={inputs.formato} disabled={ro} onValueChange={(v) => setFormato(v as FormatoLocal)}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>{FORMATOS_LOCAL.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                    </Select>
                  </FieldConv>
                </div>
              </Card>

              <Card title="Contrato (resumen)">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 text-sm">
                  <Stat label="Canon (vigente)" value={`${fmtMM(result.canonUF)} UF/mes`} />
                  <Stat label="Canon UF/m²" value={`${fmtMM(inputs.ufM2, 2)} UF/m²`} />
                  <Stat label="Garantía" value={`${fmtMM(result.garantiaUF)} UF`} />
                  <Stat label="Meses año 1" value={fmtMM(result.mesesY1, 1)} />
                  <Stat label="EBITDA Margin Año 5" value={fmtPct(result.ebitdaMargin5)} />
                </div>
                {seed.contractPeriods && seed.contractPeriods.length > 0 && (
                  <div className="mt-3 pt-3 border-t">
                    <div className="text-xs text-muted-foreground mb-1.5">
                      Arriendo por periodo (desde el contrato{seed.contractPeriods.length > 1 ? " — escalonado" : ""})
                    </div>
                    <table className="w-full text-xs">
                      <thead><tr className="text-muted-foreground border-b">
                        <th className="text-left py-1 font-normal">Periodo</th>
                        <th className="text-right font-normal">Canon</th>
                        <th className="text-right font-normal">GGCC</th>
                        <th className="text-right font-normal">F.Prom</th>
                        <th className="text-right font-normal">Otros</th>
                        <th className="text-right font-normal">Total</th>
                        <th className="text-right font-normal">UF/m²</th>
                      </tr></thead>
                      <tbody>
                        {seed.contractPeriods.map((p) => (
                          <tr key={p.label} className="border-b border-gray-50">
                            <td className="py-1">{p.label}</td>
                            <td className="text-right">{fmtMM(p.canon, 2)}</td>
                            <td className="text-right">{p.ggcc ? fmtMM(p.ggcc, 2) : "-"}</td>
                            <td className="text-right">{p.fProm ? fmtMM(p.fProm, 2) : "-"}</td>
                            <td className="text-right">{p.otros ? fmtMM(p.otros, 2) : "-"}</td>
                            <td className="text-right font-medium">{fmtMM(p.total, 2)}</td>
                            <td className="text-right">{p.ufM2 != null ? fmtMM(p.ufM2, 2) : "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </TabsContent>

            {/* ───────── INVERSIÓN ───────── */}
            <TabsContent value="inversion" className="space-y-4">
              {(() => {
                // El inventario es capital de trabajo, no CAPEX físico: se muestra
                // aparte y no participa del % ni del UF/m² del plan de inversión.
                const capexRows = result.inv.rows.filter((r) => r.id !== "inv");
                const inventarioRow = result.inv.rows.find((r) => r.id === "inv");
                const capexTotal = capexRows.reduce((s, r) => s + r.monto, 0);
                const ufM2total = inputs.superficie && inputs.ufBase ? (capexTotal * 1e6) / inputs.ufBase / inputs.superficie : 0;
                return (
                  <>
                    <Card title={`Plan de Inversión — ${inputs.categoria}`} sub="MM CLP — CAPEX físico (sin inventario). Los montos son editables por proyecto.">
                      <table className="w-full text-sm">
                        <thead><tr className="text-xs text-muted-foreground border-b">
                          <th className="py-1 text-left">Línea</th><th className="text-left">Método</th><th className="text-center">Monto (MM)</th><th className="text-right">% · UF/m²</th>
                        </tr></thead>
                        <tbody>
                          {capexRows.map((r) => {
                            const pct = capexTotal > 0 ? (r.monto / capexTotal) * 100 : 0;
                            const ufM2eq = inputs.superficie && inputs.ufBase ? (r.monto * 1e6) / inputs.ufBase / inputs.superficie : 0;
                            return (
                              <tr key={r.id} className="border-b border-gray-100">
                                <td className="py-1">{r.nombre}</td>
                                <td className="text-xs">{r.metodo === "uf_m2" ? "UF/m²" : r.metodo === "auto" ? "Sistema" : "Total"}</td>
                                <td className="text-center"><NumCell value={r.monto} disabled={ro} w="w-24" onChange={(v) => setInvOverride(r.id, v)} /></td>
                                <td className="text-right text-muted-foreground whitespace-nowrap">
                                  {pct.toFixed(1)}% · {ufM2eq.toFixed(1).replace(".", ",")} UF/m²
                                </td>
                              </tr>
                            );
                          })}
                          <tr className="font-semibold">
                            <td className="py-1.5">Total CAPEX</td><td />
                            <td className="text-center">{fmtMM(capexTotal)}</td>
                            <td className="text-right">100% · {ufM2total.toFixed(1).replace(".", ",")} UF/m²</td>
                          </tr>
                        </tbody>
                      </table>
                    </Card>
                    {inventarioRow && (
                      <Card title="Inventario" sub="Capital de trabajo — no es CAPEX, no participa del cálculo de UF/m².">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Monto (MM CLP)</span>
                          <NumCell value={inventarioRow.monto} disabled={ro} w="w-28" onChange={(v) => setInvOverride(inventarioRow.id, v)} />
                        </div>
                      </Card>
                    )}
                    <Card title="Composición del CAPEX">
                      <div style={{ height: 260 }}>
                        <ResponsiveContainer>
                          <PieChart>
                            <Pie data={capexRows.filter((r) => r.monto > 0)} dataKey="monto" nameKey="nombre" cx="50%" cy="50%" outerRadius={90} label={(e: { nombre: string }) => e.nombre}>
                              {capexRows.filter((r) => r.monto > 0).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                            </Pie>
                            <RTooltip formatter={(v: number) => `${fmtMM(v)} MM`} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </Card>
                  </>
                );
              })()}
            </TabsContent>

            {/* ───────── PROYECCIONES ───────── */}
            <TabsContent value="proyecciones" className="space-y-4">
              <Card title="Estado de Resultados" sub="MM CLP — Año 0 = pre-apertura">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs whitespace-nowrap">
                    <thead><tr className="text-right text-muted-foreground border-b">
                      <th className="text-left py-1">Línea</th>{yearCols.map((i) => <th key={i} className="px-2">{i === 0 ? "Año 0" : `Año ${i}`}</th>)}
                    </tr></thead>
                    <tbody style={{ backgroundColor: "hsl(173 80% 40% / 0.05)" }}>
                      <SectionRow label="Ingresos y Costos Directos" color="teal" />
                      <PnlRow label="Ingresos" vals={result.ingresos} bold detail={(i) => {
                        if (i === 0) return null;
                        const tramos = result.ingresosTramos[i] || [];
                        if (tramos.length === 0) return null;
                        return (
                          <div className="space-y-1">
                            <p className="font-semibold">Ingresos — Año {i}</p>
                            {tramos.map((t, idx) => (
                              <p key={idx}>{fmtMM(t.meses, 1)} mes{t.meses === 1 ? "" : "es"} × {fmtMM(t.tasa, 1)} MM/mes <span className="text-muted-foreground">(venta año de vida {t.anoVida})</span></p>
                            ))}
                            {result.scenarioFactor !== 1 && (
                              <p className="pt-1 border-t">× {fmtMM(result.scenarioFactor, 2)} (factor de escenario)</p>
                            )}
                            <p className="font-semibold">= {fmtMM(result.ingresos[i])} MM CLP</p>
                          </div>
                        );
                      }} />
                      <PnlRow label="Costo de Ventas" vals={result.costoVentas} />
                      <PnlRow label="Otros costos dir." vals={result.otrosCostos} />
                      <PnlRow label="Costos variables" vals={result.costosVar} />
                      <PnlRow label="Margen Contribución" vals={result.margenCtrib} bold />
                    </tbody>
                    <tbody style={{ backgroundColor: "hsl(var(--primary) / 0.05)" }}>
                      <SectionRow label="Gastos Operacionales" color="orange" />
                      <PnlRow label="Personal" vals={result.personal} />
                      <PnlRow label="Publicidad" vals={result.publicidad} />
                      <PnlRow label="Gastos Generales" vals={result.gastosGral} />
                      <PnlRow label="Tecnología" vals={result.tecnologia} />
                      <PnlRow label="Ocupación" vals={result.ocupacion} />
                      <PnlRow label="Canon Arriendo" vals={result.canonArr} detail={(i) => {
                        if (i === 0) return null;
                        const tramos = result.canonTramos[i] || [];
                        return (
                          <div className="space-y-1">
                            <p className="font-semibold">Canon Arriendo — Año {i}</p>
                            {tramos.map((t, idx) => (
                              <p key={idx}>{t.meses} mes{t.meses === 1 ? "" : "es"} × {fmtMM(t.ufMes, 2)} UF/mes</p>
                            ))}
                            <p className="text-muted-foreground">= {fmtMM(result.canonUfPromedio[i], 2)} UF/mes promedio del año</p>
                            <p className="pt-1 border-t">
                              {fmtMM(result.canonUfPromedio[i], 2)} UF/mes × {fmtMM(result.mesesArr[i], 1)} meses × {fmtMM(result.ufAvgs[i - 1])} CLP/UF (UF promedio del año anterior) ÷ 1.000.000
                            </p>
                            <p className="font-semibold">= {fmtMM(result.canonArr[i])} MM CLP</p>
                          </div>
                        );
                      }} />
                      <PnlRow label="Fondo Promoción" vals={result.fondoPromocion} detail={(i) => {
                        if (i === 0) return null;
                        const canonProm = result.canonUfPromedio[i];
                        const fondoUf = canonProm * ((inputs.fondoPromocionPct || 0) / 100);
                        return (
                          <div className="space-y-1">
                            <p className="font-semibold">Fondo Promoción — Año {i}</p>
                            <p>{fmtMM(inputs.fondoPromocionPct, 1)}% × {fmtMM(canonProm, 2)} UF/mes (canon promedio del año) = {fmtMM(fondoUf, 2)} UF/mes</p>
                            <p className="pt-1 border-t">
                              {fmtMM(fondoUf, 2)} UF/mes × {fmtMM(result.mesesArr[i], 1)} meses × {fmtMM(result.ufAvgs[i - 1])} CLP/UF (UF promedio del año anterior) ÷ 1.000.000
                            </p>
                            <p className="font-semibold">= {fmtMM(result.fondoPromocion[i])} MM CLP</p>
                          </div>
                        );
                      }} />
                      <PnlRow label="Gasto Común" vals={result.gastoComun} detail={(i) => {
                        if (i === 0) return null;
                        const gcomUfMes = (inputs.gastoComunUf || 0) * (inputs.superficie || 0);
                        return (
                          <div className="space-y-1">
                            <p className="font-semibold">Gasto Común — Año {i}</p>
                            <p>{fmtMM(inputs.gastoComunUf, 2)} UF/m² × {fmtMM(inputs.superficie, 0)} m² = {fmtMM(gcomUfMes, 2)} UF/mes</p>
                            <p className="pt-1 border-t">
                              {fmtMM(gcomUfMes, 2)} UF/mes × {fmtMM(result.mesesArr[i], 1)} meses × {fmtMM(result.ufAvgs[i - 1])} CLP/UF (UF promedio del año anterior) ÷ 1.000.000
                            </p>
                            <p className="font-semibold">= {fmtMM(result.gastoComun[i])} MM CLP</p>
                          </div>
                        );
                      }} />
                      <PnlRow label="EBITDA" vals={result.ebitda} bold />
                      <MarginRow label="% EBITDA / Ventas" vals={yearCols.map((i) => (result.ingresos[i] ? result.ebitda[i] / result.ingresos[i] : 0))} />
                    </tbody>
                    <tbody style={{ backgroundColor: "hsl(271 91% 65% / 0.05)" }}>
                      <SectionRow label="Resultado y Flujo" color="purple" />
                      <PnlRow label="Depreciación" vals={result.depreciacion} />
                      <PnlRow label="EBIT" vals={result.ebit} bold />
                      <PnlRow label="Impuesto" vals={result.impuesto} />
                      <PnlRow label="UDI" vals={result.udi} bold />
                      <PnlRow label="Flujo operativo" vals={result.flujoOp} bold />
                      <PnlRow label="Flujo acumulado" vals={result.payback} />
                    </tbody>
                  </table>
                </div>
              </Card>
              <Card title="Ingresos vs EBITDA" sub="MM CLP por año">
                <div style={{ height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart data={yearCols.slice(1).map((i) => ({ name: `Año ${i}`, Ingresos: result.ingresos[i], EBITDA: result.ebitda[i] }))}>
                      <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} />
                      <RTooltip /><Legend />
                      <Bar dataKey="Ingresos" fill="#3b82f6" /><Bar dataKey="EBITDA" fill="#10b981" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </TabsContent>

            {/* ───────── RETORNO ───────── */}
            <TabsContent value="retorno" className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi label="TIR" value={result.tir != null ? fmtPct(result.tir) : "N/A"} good={result.tir != null && result.tir > inputs.waccRate / 100} />
                <Kpi label="VAN" value={`$${fmtMM(result.van)} MM`} good={result.van > 0} />
                <Kpi label="Payback" value={result.paybackAnio > 0 ? `${result.paybackAnio} años` : ">5"} />
                <Kpi label="EBITDA Margin Año 5" value={fmtPct(result.ebitdaMargin5)} />
              </div>
              <Card title="Escenario">
                <div className="flex gap-2">
                  {([["base", "Base"], ["opt", "Optimista (+10%)"], ["cons", "Conservador (-15%)"]] as const).map(([v, l]) => (
                    <Button key={v} size="sm" variant={inputs.scenario === v ? "default" : "outline"} disabled={ro}
                      onClick={() => update("scenario", v as BCInputs["scenario"])}>{l}</Button>
                  ))}
                </div>
              </Card>
              <Card title="Evolución EBITDA %" sub="Margen sobre ventas">
                <div style={{ height: 240 }}>
                  <ResponsiveContainer>
                    <LineChart data={yearCols.slice(1).map((i) => ({ name: `Año ${i}`, "EBITDA %": result.ingresos[i] ? +(result.ebitda[i] / result.ingresos[i] * 100).toFixed(1) : 0 }))}>
                      <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} unit="%" />
                      <RTooltip /><Line type="monotone" dataKey="EBITDA %" stroke="#10b981" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </TabsContent>

            {/* ───────── SUPUESTOS ───────── */}
            <TabsContent value="supuestos" className="space-y-4">
              <Card title="Contrato">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Field label="Superficie (m²)"><NumCell value={inputs.superficie} disabled={ro} w="w-full" onChange={(v) => update("superficie", v)} /></Field>
                  <Field label="UF / m²"><NumCell value={inputs.ufM2} disabled={ro} w="w-full" step="0.01" onChange={(v) => update("ufM2", v)} /></Field>
                  <Field label="Gasto común (UF/m²)"><NumCell value={inputs.gastoComunUf} disabled={ro} w="w-full" step="0.01" onChange={(v) => update("gastoComunUf", v)} /></Field>
                  <Field label="Gracia (meses)"><NumCell value={inputs.graciaMeses} disabled={ro} w="w-full" onChange={(v) => update("graciaMeses", v)} /></Field>
                  <Field label="Duración (años)"><NumCell value={inputs.durContratoAnios} disabled={ro} w="w-full" onChange={(v) => update("durContratoAnios", v)} /></Field>
                  <Field label="Inicio"><Input type="date" value={inputs.inicio} disabled={ro} onChange={(e) => update("inicio", e.target.value)} className="h-8 text-sm" /></Field>
                  <FieldConv
                    label="Apertura al público"
                    conv={`Opera ${result.mesesOperacion} ${result.mesesOperacion === 1 ? "mes" : "meses"} el año 1 · personal desde 1 mes antes (${result.mesesPersonal})`}
                  >
                    <Input
                      type="date"
                      value={inputs.apertura || addMonthsIso(inputs.inicio, inputs.graciaMeses)}
                      disabled={ro}
                      onChange={(e) => update("apertura", e.target.value)}
                      placeholder="Inicio de pago de renta"
                      className="h-8 text-sm"
                    />
                  </FieldConv>
                </div>
              </Card>

              <Card title="UF y económico">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Field label="UF base (CLP)"><NumCell value={inputs.ufBase} disabled={ro} w="w-full" onChange={(v) => update("ufBase", v)} /></Field>
                  <Field label="Tasa descuento %"><NumCell value={inputs.waccRate} disabled={ro} w="w-full" onChange={(v) => update("waccRate", v)} /></Field>
                  <Field label="Impuesto %"><NumCell value={inputs.taxRate} disabled={ro} w="w-full" onChange={(v) => update("taxRate", v)} /></Field>
                </div>
              </Card>

              {/* Ventas + supuestos de crecimiento en una sola sección, alineadas por
                  año y en tiempo real. Dos tasas distintas, no confundir: Crec.
                  Ventas % es la curva de maduración del local (la usa la cascada
                  al editar Venta); Crec. UF anual % es la UF real (inflación,
                  ~3-4%/año) y solo convierte a CLP canon/gasto común/personal. */}
              <Card
                title="Ventas y Supuestos de Crecimiento"
                sub="Editar cualquiera recalcula el modelo en tiempo real"
                action={!ro && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 text-xs shrink-0"
                    disabled={syncingGeo}
                    onClick={handleSyncGeoplanet}
                  >
                    {syncingGeo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
                    Sincronizar con GeoPlanet
                  </Button>
                )}
              >
                <div className="overflow-x-auto">
                  <table className="text-xs">
                    <thead><tr className="text-muted-foreground">
                      <th className="text-left pr-3 font-normal"></th>
                      {[1, 2, 3, 4, 5].map((y) => <th key={y} className="px-2 font-normal text-center">Año {y}</th>)}
                    </tr></thead>
                    <tbody>
                      <tr>
                        <td className="pr-3 py-1 whitespace-nowrap text-muted-foreground">Venta (MM/mes)</td>
                        {inputs.ventaMes.map((v, i) => (
                          <td key={i} className="px-1 text-center"><NumCell value={v} disabled={ro} step="1" decimals={1} onChange={(val) => updateVentaConCrecimiento(i, val)} /></td>
                        ))}
                      </tr>
                      <tr>
                        <td className="pr-3 py-1 whitespace-nowrap text-muted-foreground">Crec. Ventas %</td>
                        {inputs.ventaGrowthPct.map((r, i) => (
                          <td key={i} className="px-1 text-center"><NumCell value={r} disabled={ro} onChange={(v) => updateArr("ventaGrowthPct", i, v)} /></td>
                        ))}
                      </tr>
                      <tr>
                        <td className="pr-3 py-1 whitespace-nowrap text-muted-foreground">Crec. UF anual %</td>
                        {inputs.ufRates.map((r, i) => (
                          <td key={i} className="px-1 text-center"><NumCell value={r} disabled={ro} onChange={(v) => updateArr("ufRates", i, v)} /></td>
                        ))}
                      </tr>
                      <tr>
                        <td className="pr-3 py-1 whitespace-nowrap text-[10px] text-muted-foreground">Ingresos (MM/año)</td>
                        {[1, 2, 3, 4, 5].map((y) => (
                          <td key={y} className="px-1 text-center text-[10px] text-muted-foreground">{fmtMM(result.ingresos[y])}</td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card title="Márgenes y costos" sub="Conversión a MM CLP/mes (promedio) bajo cada campo">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  <FieldConv label="Margen directo %" conv={`Costo venta A1: $${fmtMM(Math.abs(result.costoVentas[1]))} MM`}>
                    <NumCell value={inputs.margenDir} disabled={ro} w="w-20" onChange={(v) => update("margenDir", v)} /></FieldConv>
                  {(() => {
                    // Año 1 es parcial (result.mesesOperacion meses, porque el
                    // local abre a mitad de año) — un "A1: $X MM" ahí no es un
                    // valor mensual, es el total de un año incompleto. Para un
                    // $/mes comparable se promedia el total de costo de los 5
                    // años sobre el total de meses de operación proyectados
                    // (años 2-5 siempre son 12 meses completos, mismo criterio
                    // que mesesOperArr en computeBC).
                    const totalMesesOperacion = result.mesesOperacion + 48;
                    const promedioMensual = (arr: number[]) => {
                      const total = arr.slice(1, 6).reduce((s, x) => s + Math.abs(x), 0);
                      return totalMesesOperacion > 0 ? total / totalMesesOperacion : 0;
                    };
                    return (
                      <>
                        <FieldConv label="Otros costos dir. %" conv={`Prom: $${fmtMM(promedioMensual(result.otrosCostos))} MM/mes`}>
                          <NumCell value={inputs.otrosCostosDir} disabled={ro} w="w-20" step="0.01" onChange={(v) => update("otrosCostosDir", v)} /></FieldConv>
                        <FieldConv label="Costos variables %" conv={`Prom: $${fmtMM(promedioMensual(result.costosVar))} MM/mes`}>
                          <NumCell value={inputs.costosVar} disabled={ro} w="w-20" step="0.01" onChange={(v) => update("costosVar", v)} /></FieldConv>
                        <FieldConv label="Gastos generales %" conv={`Prom: $${fmtMM(promedioMensual(result.gastosGral))} MM/mes`}>
                          <NumCell value={inputs.gralPct} disabled={ro} w="w-20" step="0.01" onChange={(v) => update("gralPct", v)} /></FieldConv>
                        <FieldConv label="Tecnología %" conv={`Prom: $${fmtMM(promedioMensual(result.tecnologia))} MM/mes`}>
                          <NumCell value={inputs.tecPct} disabled={ro} w="w-20" step="0.01" onChange={(v) => update("tecPct", v)} /></FieldConv>
                        <FieldConv label="Ocupación %" conv={`Prom: $${fmtMM(promedioMensual(result.ocupacion))} MM/mes`}>
                          <NumCell value={inputs.ocupPct} disabled={ro} w="w-20" step="0.01" onChange={(v) => update("ocupPct", v)} /></FieldConv>
                      </>
                    );
                  })()}
                  <FieldConv label="# Personas" conv={`= $${fmtMM(Math.abs(result.personal[1]))} MM`}>
                    <NumCell value={inputs.personalY1} disabled={ro} w="w-20" onChange={(v) => update("personalY1", v)} /></FieldConv>
                  <FieldConv label="Costo por persona (MM/año)" conv={`≈ $${fmtMM(inputs.costoPersonaMM / 12)} MM/mes`}>
                    <NumCell value={inputs.costoPersonaMM} disabled={ro} w="w-20" onChange={(v) => update("costoPersonaMM", v)} /></FieldConv>
                  {/* El crecimiento de personal ya no es un input: los años 2..5
                      se reajustan por la variación de UF del año anterior, igual
                      que la planilla oficial. Se muestra el resultado del año 5. */}
                  <FieldConv label="Personal Año 5" conv="Reajustado por variación UF">
                    <Input value={`$${fmtMM(Math.abs(result.personal[5]))} MM`} disabled readOnly className="h-7 w-20 text-xs text-right px-1 bg-muted/40" /></FieldConv>
                  <FieldConv label="CAPEX depreciable (MM)" conv="Se lee desde Inversión (física)">
                    <Input value={fmtMM(result.inv.fisica)} disabled readOnly className="h-7 w-20 text-xs text-right px-1 bg-muted/40" /></FieldConv>
                  <FieldConv label="Años depreciación" conv={`Depr. anual: $${fmtMM(Math.abs(result.depreciacion[1]))} MM`}>
                    <NumCell value={inputs.deprAnos} disabled={ro} w="w-20" onChange={(v) => update("deprAnos", v)} /></FieldConv>
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Kpi({ label, value, sub, good }: { label: string; value: string; sub?: string; good?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${good ? "border-green-300 bg-green-50/50" : "border-gray-200"}`}>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold ${good ? "text-green-700" : ""}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
function Card({ title, sub, action, children }: { title: string; sub?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div><h3 className="text-sm font-semibold">{title}</h3>{sub && <p className="text-xs text-muted-foreground">{sub}</p>}</div>
        {action}
      </div>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label className="text-xs block min-h-[2rem]">{label}</Label><div className="mt-0.5">{children}</div></div>;
}
function FieldConv({ label, conv, children }: { label: string; conv: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <Label className="text-xs block min-h-[2rem]">{label}</Label>
      <div className="mt-0.5">{children}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{conv}</div>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[11px] text-muted-foreground">{label}</div><div className="font-semibold">{value}</div></div>;
}
function PnlRow({
  label, vals, bold, detail,
}: {
  label: string; vals: number[]; bold?: boolean;
  /** Detalle de cálculo por año (índice 0..5). Devolver null para años sin desglose (ej. Año 0). */
  detail?: (i: number) => React.ReactNode | null;
}) {
  return (
    <tr className={`border-b border-gray-50 ${bold ? "font-semibold" : ""}`}>
      <td className="text-left py-1">{label}</td>
      {yearCols.map((i) => {
        const content = detail?.(i);
        if (!content) return <td key={i} className="text-right px-2">{fmtMM(vals[i] ?? 0)}</td>;
        return (
          <td key={i} className="text-right px-2">
            <Popover>
              <PopoverTrigger className="underline decoration-dotted decoration-muted-foreground underline-offset-2 hover:text-primary">
                {fmtMM(vals[i] ?? 0)}
              </PopoverTrigger>
              <PopoverContent className="w-72 text-xs" align="end">{content}</PopoverContent>
            </Popover>
          </td>
        );
      })}
    </tr>
  );
}
// Agrupa el Estado de Resultados por a qué subtotal alimenta cada tramo
// (Margen Contribución / EBITDA / resultado final), sin tocar el alto ni el
// padding de las filas normales (PnlRow) — solo separa visualmente.
const SECTION_COLORS: Record<string, string> = {
  teal: "text-teal-700",
  orange: "text-primary",
  purple: "text-purple-700",
};
function SectionRow({ label, color }: { label: string; color: "teal" | "orange" | "purple" }) {
  return (
    <tr>
      <td colSpan={7} className="pt-3 pb-1">
        <div className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide ${SECTION_COLORS[color]}`}>
          {label}
          <span className="h-px flex-1 bg-current opacity-20" />
        </div>
      </td>
    </tr>
  );
}
function MarginRow({ label, vals }: { label: string; vals: number[] }) {
  return (
    <tr>
      <td className="text-left py-0.5 pb-2 text-[10px] italic text-muted-foreground">{label}</td>
      {yearCols.map((i) => (
        <td key={i} className="text-right px-2 py-0.5 pb-2 text-[10px] font-medium text-green-700">
          {i === 0 ? "—" : fmtPct(vals[i] ?? 0)}
        </td>
      ))}
    </tr>
  );
}
