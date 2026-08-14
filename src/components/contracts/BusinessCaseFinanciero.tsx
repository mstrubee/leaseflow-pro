import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Check, FileText, Sheet } from "lucide-react";
import { exportBusinessCasePDF, exportBusinessCaseExcel } from "@/lib/businessCase/exportV2";
import { toast } from "sonner";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip as RTooltip, Legend, CartesianGrid,
} from "recharts";
import { useBusinessCaseV2 } from "@/hooks/useBusinessCaseV2";
import type { BCSeed, BCInputs } from "@/lib/businessCase/model";
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

function NumCell({ value, onChange, disabled, w = "w-20", step = "any" }: { value: number; onChange: (v: number) => void; disabled?: boolean; w?: string; step?: string }) {
  return (
    <Input type="number" step={step} value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)} disabled={disabled}
      className={`h-7 ${w} text-xs text-right px-1`} />
  );
}

export function BusinessCaseFinanciero({ open, onOpenChange, contractId, seed, canEdit }: Props) {
  const { config, inputs, result, loading, saving, update, updateArr, setInvOverride } =
    useBusinessCaseV2({ contractId, seed, enabled: open });
  const ro = !canEdit;

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
                <Kpi label="TIR" value={result.tir != null ? fmtPct(result.tir) : "N/A"} sub={`Hurdle ${inputs.waccRate}%`} good={result.tir != null && result.tir > inputs.waccRate / 100} />
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
                </div>
              </Card>

              <Card title="Contrato (resumen)">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <Stat label="Canon" value={`${fmtMM(result.canonUF)} UF/mes`} />
                  <Stat label="Garantía" value={`${fmtMM(result.garantiaUF)} UF`} />
                  <Stat label="Meses año 1" value={`${result.mesesY1}`} />
                  <Stat label="EBITDA Margin Año 5" value={fmtPct(result.ebitdaMargin5)} />
                </div>
              </Card>
            </TabsContent>

            {/* ───────── INVERSIÓN ───────── */}
            <TabsContent value="inversion" className="space-y-4">
              <Card title={`Plan de Inversión — ${inputs.categoria}`} sub="MM CLP — las líneas dependen de la categoría (config global). Los montos son editables por proyecto.">
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-muted-foreground border-b">
                    <th className="py-1 text-left">Línea</th><th className="text-left">Método</th><th className="text-center">Monto (MM)</th><th className="text-right">% · UF/m²</th>
                  </tr></thead>
                  <tbody>
                    {result.inv.rows.map((r) => {
                      const ufM2eq = inputs.superficie && inputs.ufBase ? (r.monto * 1e6) / inputs.ufBase / inputs.superficie : 0;
                      return (
                        <tr key={r.id} className="border-b border-gray-100">
                          <td className="py-1">{r.nombre}</td>
                          <td className="text-xs">{r.metodo === "uf_m2" ? "UF/m²" : r.metodo === "auto" ? "Sistema" : "Total"}</td>
                          <td className="text-center"><NumCell value={r.monto} disabled={ro} w="w-24" onChange={(v) => setInvOverride(r.id, v)} /></td>
                          <td className="text-right text-muted-foreground whitespace-nowrap">
                            {r.pct.toFixed(1)}% · {ufM2eq.toFixed(1).replace(".", ",")} UF/m²
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="font-semibold">
                      <td className="py-1.5">Total</td><td />
                      <td className="text-center">{fmtMM(result.inv.total)}</td>
                      <td className="text-right">100% · {(inputs.superficie && inputs.ufBase ? (result.inv.total * 1e6) / inputs.ufBase / inputs.superficie : 0).toFixed(1).replace(".", ",")} UF/m²</td>
                    </tr>
                  </tbody>
                </table>
              </Card>
              <Card title="Composición del CAPEX">
                <div style={{ height: 260 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={result.inv.rows.filter((r) => r.monto > 0)} dataKey="monto" nameKey="nombre" cx="50%" cy="50%" outerRadius={90} label={(e: { nombre: string }) => e.nombre}>
                        {result.inv.rows.filter((r) => r.monto > 0).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <RTooltip formatter={(v: number) => `${fmtMM(v)} MM`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </TabsContent>

            {/* ───────── PROYECCIONES ───────── */}
            <TabsContent value="proyecciones" className="space-y-4">
              <Card title="Estado de Resultados" sub="MM CLP — Año 0 = pre-apertura">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs whitespace-nowrap">
                    <thead><tr className="text-right text-muted-foreground border-b">
                      <th className="text-left py-1">Línea</th>{yearCols.map((i) => <th key={i} className="px-2">{i === 0 ? "Año 0" : `Año ${i}`}</th>)}
                    </tr></thead>
                    <tbody>
                      <PnlRow label="Ingresos" vals={result.ingresos} bold />
                      <PnlRow label="Costo de Ventas" vals={result.costoVentas} />
                      <PnlRow label="Otros costos dir." vals={result.otrosCostos} />
                      <PnlRow label="Costos variables" vals={result.costosVar} />
                      <PnlRow label="Margen Contribución" vals={result.margenCtrib} bold />
                      <PnlRow label="Personal" vals={result.personal} />
                      <PnlRow label="Publicidad" vals={result.publicidad} />
                      <PnlRow label="Gastos Generales" vals={result.gastosGral} />
                      <PnlRow label="Tecnología" vals={result.tecnologia} />
                      <PnlRow label="Ocupación" vals={result.ocupacion} />
                      <PnlRow label="Canon Arriendo" vals={result.canonArr} />
                      <PnlRow label="Gasto Común" vals={result.gastoComun} />
                      <PnlRow label="EBITDA" vals={result.ebitda} bold />
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
                  <Field label="UF / m²"><NumCell value={inputs.ufM2} disabled={ro} w="w-full" onChange={(v) => update("ufM2", v)} /></Field>
                  <Field label="Gasto común (UF/mes)"><NumCell value={inputs.gastoComunUf} disabled={ro} w="w-full" onChange={(v) => update("gastoComunUf", v)} /></Field>
                  <Field label="Gracia (meses)"><NumCell value={inputs.graciaMeses} disabled={ro} w="w-full" onChange={(v) => update("graciaMeses", v)} /></Field>
                  <Field label="Duración (años)"><NumCell value={inputs.durContratoAnios} disabled={ro} w="w-full" onChange={(v) => update("durContratoAnios", v)} /></Field>
                  <Field label="Inicio"><Input type="date" value={inputs.inicio} disabled={ro} onChange={(e) => update("inicio", e.target.value)} className="h-8 text-sm" /></Field>
                  <FieldConv
                    label="Apertura al público"
                    conv={`Opera ${result.mesesOperacion} ${result.mesesOperacion === 1 ? "mes" : "meses"} el año 1 · personal desde 1 mes antes (${result.mesesPersonal})`}
                  >
                    <Input
                      type="date"
                      value={inputs.apertura || ""}
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

              {/* Ventas + Crecimiento UF en una sola sección, alineadas por año y en tiempo real */}
              <Card title="Ventas y Crecimiento UF anual" sub="Editar cualquiera recalcula el modelo en tiempo real">
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
                          <td key={i} className="px-1 text-center"><NumCell value={v} disabled={ro} onChange={(val) => updateArr("ventaMes", i, val)} /></td>
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

              <Card title="Márgenes y costos" sub="Conversión a MM CLP (Año 1) bajo cada campo">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <FieldConv label="Margen directo %" conv={`Costo venta A1: $${fmtMM(Math.abs(result.costoVentas[1]))} MM`}>
                    <NumCell value={inputs.margenDir} disabled={ro} w="w-full" onChange={(v) => update("margenDir", v)} /></FieldConv>
                  <FieldConv label="Otros costos dir. %" conv={`A1: $${fmtMM(Math.abs(result.otrosCostos[1]))} MM`}>
                    <NumCell value={inputs.otrosCostosDir} disabled={ro} w="w-full" onChange={(v) => update("otrosCostosDir", v)} /></FieldConv>
                  <FieldConv label="Costos variables %" conv={`A1: $${fmtMM(Math.abs(result.costosVar[1]))} MM`}>
                    <NumCell value={inputs.costosVar} disabled={ro} w="w-full" onChange={(v) => update("costosVar", v)} /></FieldConv>
                  <FieldConv label="Gastos generales %" conv={`A1: $${fmtMM(Math.abs(result.gastosGral[1]))} MM`}>
                    <NumCell value={inputs.gralPct} disabled={ro} w="w-full" onChange={(v) => update("gralPct", v)} /></FieldConv>
                  <FieldConv label="Tecnología %" conv={`A1: $${fmtMM(Math.abs(result.tecnologia[1]))} MM`}>
                    <NumCell value={inputs.tecPct} disabled={ro} w="w-full" onChange={(v) => update("tecPct", v)} /></FieldConv>
                  <FieldConv label="Ocupación %" conv={`A1: $${fmtMM(Math.abs(result.ocupacion[1]))} MM`}>
                    <NumCell value={inputs.ocupPct} disabled={ro} w="w-full" onChange={(v) => update("ocupPct", v)} /></FieldConv>
                  <FieldConv label="Personal Año 1 (n° personas)" conv={`= $${fmtMM(Math.abs(result.personal[1]))} MM (${result.mesesY1} ${result.mesesY1 === 1 ? "mes" : "meses"})`}>
                    <NumCell value={inputs.personalY1} disabled={ro} w="w-full" onChange={(v) => update("personalY1", v)} /></FieldConv>
                  <FieldConv label="Costo por persona (MM/año)" conv={`≈ $${fmtMM(inputs.costoPersonaMM / 12)} MM/mes`}>
                    <NumCell value={inputs.costoPersonaMM} disabled={ro} w="w-full" onChange={(v) => update("costoPersonaMM", v)} /></FieldConv>
                  {/* El crecimiento de personal ya no es un input: los años 2..5
                      se reajustan por la variación de UF del año anterior, igual
                      que la planilla oficial. Se muestra el resultado del año 5. */}
                  <FieldConv label="Personal Año 5" conv="Reajustado por variación UF">
                    <Input value={`$${fmtMM(Math.abs(result.personal[5]))} MM`} disabled readOnly className="h-7 w-full text-xs text-right px-1 bg-muted/40" /></FieldConv>
                  <FieldConv label="CAPEX depreciable (MM)" conv="Se lee desde Inversión (física)">
                    <Input value={fmtMM(result.inv.fisica)} disabled readOnly className="h-7 w-full text-xs text-right px-1 bg-muted/40" /></FieldConv>
                  <FieldConv label="Años depreciación" conv={`Depr. anual: $${fmtMM(Math.abs(result.depreciacion[1]))} MM`}>
                    <NumCell value={inputs.deprAnos} disabled={ro} w="w-full" onChange={(v) => update("deprAnos", v)} /></FieldConv>
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
function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2"><h3 className="text-sm font-semibold">{title}</h3>{sub && <p className="text-xs text-muted-foreground">{sub}</p>}</div>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label className="text-xs">{label}</Label><div className="mt-0.5">{children}</div></div>;
}
function FieldConv({ label, conv, children }: { label: string; conv: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-0.5">{children}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{conv}</div>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[11px] text-muted-foreground">{label}</div><div className="font-semibold">{value}</div></div>;
}
function PnlRow({ label, vals, bold }: { label: string; vals: number[]; bold?: boolean }) {
  return (
    <tr className={`border-b border-gray-50 ${bold ? "font-semibold" : ""}`}>
      <td className="text-left py-1">{label}</td>
      {yearCols.map((i) => <td key={i} className="text-right px-2">{fmtMM(vals[i] ?? 0)}</td>)}
    </tr>
  );
}
