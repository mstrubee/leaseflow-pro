import { Fragment, useEffect } from "react";
import { IngresosOrigenMargen, LineasAdicionales } from "./SupuestosLines";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, CornerDownRight } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip as RTooltip, Legend, CartesianGrid,
} from "recharts";
import { Card, Field, FieldConv, Kpi, NumCell, Stat } from "@/components/contracts/BusinessCaseFinanciero";
import { fmtMM, fmtPct } from "@/lib/businessCase/format";
import type { BCInputs } from "@/lib/businessCase/model";
import {
  AutoInvLine, AutoInvMethod, AutoplanetInputs, AutoplanetResult, BLOCK_LABEL, INV_CATEGORIES,
  PnlNode, newInvLine,
} from "@/lib/autoplanet/model";

type Mutate = (key: string, fn: (p: AutoplanetInputs) => AutoplanetInputs) => void;

interface Props {
  inputs: AutoplanetInputs;
  result: AutoplanetResult;
  readOnly: boolean;
  update: <K extends keyof AutoplanetInputs>(key: K, value: AutoplanetInputs[K]) => void;
  updateArr: (key: "ventaMes" | "ufRates", idx: number, value: number) => void;
  mutate: Mutate;
  undo: () => void;
}

const PIE_COLORS = ["#3b82f6", "#8b5cf6", "#f59e0b", "#10b981", "#64748b", "#f43f5e", "#06b6d4"];
const yearCols = [0, 1, 2, 3, 4, 5];

export function AutoplanetCaseEditor({ inputs, result, readOnly: ro, update, updateArr, mutate, undo }: Props) {
  // Ctrl+Z / Cmd+Z deshace la última edición (los inputs son controlados por React).
  useEffect(() => {
    if (ro) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [ro, undo]);

  return (
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
          <Kpi label="Inversión (MM)" value={`$${fmtMM(result.totalCapex)}`} sub={`Inventario aparte: $${fmtMM(result.inv.inventario)}`} />
        </div>
        <Card title="Información del Proyecto">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="Nombre"><Input value={inputs.nombre} disabled={ro} onChange={(e) => update("nombre", e.target.value)} className="h-8 text-sm" /></Field>
            <Field label="Dirección"><Input value={inputs.direccion} disabled={ro} onChange={(e) => update("direccion", e.target.value)} className="h-8 text-sm" /></Field>
            <Field label="Comuna"><Input value={inputs.comuna} disabled={ro} onChange={(e) => update("comuna", e.target.value)} className="h-8 text-sm" /></Field>
            <div className="col-span-2 md:col-span-3">
              <Field label="Descripción"><Input value={inputs.descripcion} disabled={ro} onChange={(e) => update("descripcion", e.target.value)} className="h-8 text-sm" /></Field>
            </div>
          </div>
        </Card>
        <Card title="Resumen operativo">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Stat label="Ingresos Año 1 (MM)" value={fmtMM(result.ingresos[1])} />
            <Stat label="EBITDA Año 1 (MM)" value={fmtMM(result.ebitda[1])} />
            <Stat label="Meses año 1" value={`${result.mesesY1}`} />
            <Stat label="EBITDA Margin Año 5" value={fmtPct(result.ebitdaMargin5)} />
          </div>
        </Card>
      </TabsContent>

      {/* ───────── INVERSIÓN ───────── */}
      <TabsContent value="inversion" className="space-y-4">
        {INV_CATEGORIES.filter((c) => c.id !== "inventario").map((cat) => {
          const group = result.inv.groups.find((g) => g.categoria === cat.id)!;
          return (
            <InvGroupCard key={cat.id} title={cat.label} sub={cat.hint} rows={group.rows} subtotal={group.subtotal}
              inputs={inputs} ro={ro} mutate={mutate} categoria={cat.id} />
          );
        })}

        <div className="rounded-lg border bg-muted/30 p-3 text-sm flex flex-wrap gap-x-8 gap-y-1">
          <span className="font-semibold">Inversión sin inventario: ${fmtMM(result.inv.total - result.inv.inventario)} MM</span>
          <span className="text-muted-foreground">Depreciable: ${fmtMM(result.inv.fisica)} MM</span>
        </div>

        {/* El inventario se mantiene separado del resto de la inversión (capital de trabajo, no se deprecia). */}
        {(() => {
          const cat = INV_CATEGORIES.find((c) => c.id === "inventario")!;
          const group = result.inv.groups.find((g) => g.categoria === "inventario")!;
          return (
            <InvGroupCard title={cat.label} sub={cat.hint} rows={group.rows} subtotal={group.subtotal}
              inputs={inputs} ro={ro} mutate={mutate} categoria="inventario" />
          );
        })()}

        <div className="rounded-lg border p-3 flex items-center justify-between font-semibold">
          <span>Inversión total (incluye inventario)</span>
          <span>${fmtMM(result.inv.total)} MM</span>
        </div>

        <Card title="Composición de la inversión">
          <div style={{ height: 260 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={result.inv.groups.filter((g) => g.subtotal > 0)} dataKey="subtotal" nameKey="label" cx="50%" cy="50%" outerRadius={90} label={(e: { label: string }) => e.label}>
                  {result.inv.groups.filter((g) => g.subtotal > 0).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <RTooltip formatter={(v: number) => `${fmtMM(v)} MM`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </TabsContent>

      {/* ───────── PROYECCIONES ───────── */}
      <TabsContent value="proyecciones" className="space-y-4">
        <Card title="Estado de Resultados" sub="MM CLP — Año 0 = pre-apertura. Solo lectura: todo se calcula desde Inversión y Supuestos (ahí se editan los ingresos, su origen y margen, y las líneas adicionales).">
          <div className="overflow-x-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr className="text-right text-muted-foreground border-b">
                  <th className="text-left py-1">Línea</th>
                  {yearCols.map((i) => <th key={i} className="px-2">{i === 0 ? "Año 0" : `Año ${i}`}</th>)}
                </tr>
              </thead>
              <tbody>
                <SectionRow label={BLOCK_LABEL.directos} />
                {result.directos.map((n) => <PnlNodeRows key={n.id} node={n} depth={0} />)}
                <TotalRow label="Margen Contribución" vals={result.margenCtrib} />
                <PctRow label="Margen directo %" vals={result.margenDirecto} />

                <SectionRow label={BLOCK_LABEL.operacionales} />
                {result.operacionales.map((n) => <PnlNodeRows key={n.id} node={n} depth={0} />)}
                <TotalRow label="Total Gastos Operacionales" vals={result.gavs} />

                <SectionRow label="Resultado" />
                <TotalRow label="EBITDA" vals={result.ebitda} />
                <ValueRow label="Depreciación" vals={result.depreciacion} />
                <TotalRow label="EBIT" vals={result.ebit} />
                <ValueRow label="Impuesto" vals={result.impuesto} />
                <TotalRow label="UDI" vals={result.udi} />
                <TotalRow label="Flujo operativo" vals={result.flujoOp} />
                <ValueRow label="Flujo acumulado" vals={result.payback} />
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Los costos % de Supuestos se calculan sobre el total de Ingresos; el costo de ventas usa el margen de cada fuente de ingreso. El escenario aplica a todas las fuentes de ingreso.
          </p>
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

      {/* ───────── SUPUESTOS (idénticos al Business Case de contratos) ───────── */}
      <TabsContent value="supuestos" className="space-y-4">
        <Card title="Contrato">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="Superficie (m²)"><NumCell value={inputs.superficie} disabled={ro} w="w-full" onChange={(v) => update("superficie", v)} /></Field>
            <Field label="UF / m²"><NumCell value={inputs.ufM2} disabled={ro} w="w-full" onChange={(v) => update("ufM2", v)} /></Field>
            <Field label="Gasto común (UF/mes)"><NumCell value={inputs.gastoComunUf} disabled={ro} w="w-full" onChange={(v) => update("gastoComunUf", v)} /></Field>
            <Field label="Gracia (meses)"><NumCell value={inputs.graciaMeses} disabled={ro} w="w-full" onChange={(v) => update("graciaMeses", v)} /></Field>
            <Field label="Duración (años)"><NumCell value={inputs.durContratoAnios} disabled={ro} w="w-full" onChange={(v) => update("durContratoAnios", v)} /></Field>
            <Field label="Inicio"><Input type="date" value={inputs.inicio} disabled={ro} onChange={(e) => update("inicio", e.target.value)} className="h-8 text-sm" /></Field>
          </div>
        </Card>

        <Card title="UF y económico">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="UF base (CLP)"><NumCell value={inputs.ufBase} disabled={ro} w="w-full" onChange={(v) => update("ufBase", v)} /></Field>
            <Field label="Tasa descuento %"><NumCell value={inputs.waccRate} disabled={ro} w="w-full" onChange={(v) => update("waccRate", v)} /></Field>
            <Field label="Impuesto %"><NumCell value={inputs.taxRate} disabled={ro} w="w-full" onChange={(v) => update("taxRate", v)} /></Field>
          </div>
        </Card>

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

        <IngresosOrigenMargen inputs={inputs} result={result} ro={ro} mutate={mutate} />

        <Card title="Márgenes y costos" sub="Conversión a MM CLP (Año 1) bajo cada campo">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <FieldConv label="Margen directo % (promedio)" conv={`Ponderado por ingresos, desde «Origen y margen de los ingresos» · Costo venta A1: $${fmtMM(Math.abs(nodeTotal(result.directos, "costoVentas", 1)))} MM`}>
              <Input value={fmtPct(result.margenDirectoProm)} disabled readOnly className="h-7 w-full text-xs text-right px-1 bg-muted/40" /></FieldConv>
            <FieldConv label="Otros costos dir. %" conv={`A1: $${fmtMM(Math.abs(nodeTotal(result.directos, "otrosCostos", 1)))} MM`}>
              <NumCell value={inputs.otrosCostosDir} disabled={ro} w="w-full" onChange={(v) => update("otrosCostosDir", v)} /></FieldConv>
            <FieldConv label="Costos variables %" conv={`A1: $${fmtMM(Math.abs(nodeTotal(result.directos, "costosVar", 1)))} MM`}>
              <NumCell value={inputs.costosVar} disabled={ro} w="w-full" onChange={(v) => update("costosVar", v)} /></FieldConv>
            <FieldConv label="Gastos generales %" conv={`A1: $${fmtMM(Math.abs(nodeTotal(result.operacionales, "gastosGral", 1)))} MM`}>
              <NumCell value={inputs.gralPct} disabled={ro} w="w-full" onChange={(v) => update("gralPct", v)} /></FieldConv>
            <FieldConv label="Tecnología %" conv={`A1: $${fmtMM(Math.abs(nodeTotal(result.operacionales, "tecnologia", 1)))} MM`}>
              <NumCell value={inputs.tecPct} disabled={ro} w="w-full" onChange={(v) => update("tecPct", v)} /></FieldConv>
            <FieldConv label="Ocupación %" conv={`A1: $${fmtMM(Math.abs(nodeTotal(result.operacionales, "ocupacion", 1)))} MM`}>
              <NumCell value={inputs.ocupPct} disabled={ro} w="w-full" onChange={(v) => update("ocupPct", v)} /></FieldConv>
            <FieldConv label="Personal Año 1 (n° personas)" conv={`= $${fmtMM(Math.abs(nodeOwn(result.operacionales, "personal", 1)))} MM/año`}>
              <NumCell value={inputs.personalY1} disabled={ro} w="w-full" onChange={(v) => update("personalY1", v)} /></FieldConv>
            <FieldConv label="Costo por persona (MM/año)" conv={`≈ $${fmtMM(inputs.costoPersonaMM / 12)} MM/mes`}>
              <NumCell value={inputs.costoPersonaMM} disabled={ro} w="w-full" onChange={(v) => update("costoPersonaMM", v)} /></FieldConv>
            <FieldConv label="Crec. personal %" conv={`A5: $${fmtMM(Math.abs(nodeOwn(result.operacionales, "personal", 5)))} MM`}>
              <NumCell value={inputs.personalCrec} disabled={ro} w="w-full" onChange={(v) => update("personalCrec", v)} /></FieldConv>
            <FieldConv label="CAPEX depreciable (MM)" conv="Se lee desde Inversión (sin inventario ni garantía)">
              <Input value={fmtMM(result.inv.fisica)} disabled readOnly className="h-7 w-full text-xs text-right px-1 bg-muted/40" /></FieldConv>
            <FieldConv label="Años depreciación" conv={`Depr. anual: $${fmtMM(Math.abs(result.depreciacion[1]))} MM`}>
              <NumCell value={inputs.deprAnos} disabled={ro} w="w-full" onChange={(v) => update("deprAnos", v)} /></FieldConv>
          </div>
        </Card>
        <LineasAdicionales inputs={inputs} ro={ro} mutate={mutate} />
      </TabsContent>
    </Tabs>
  );
}

// ───────── helpers de lectura del árbol ─────────
function findNode(nodes: PnlNode[], id: string): PnlNode | undefined {
  return nodes.find((n) => n.id === id);
}
const nodeTotal = (nodes: PnlNode[], id: string, year: number) => findNode(nodes, id)?.total[year] ?? 0;
const nodeOwn = (nodes: PnlNode[], id: string, year: number) => findNode(nodes, id)?.own[year] ?? 0;

// ───────── Inversión ─────────
const METHOD_LABEL: Record<AutoInvMethod, string> = { total: "Total (MM)", uf_m2: "UF/m²", auto: "1 mes canon" };

function InvGroupCard({ title, sub, rows, subtotal, inputs, ro, mutate, categoria }: {
  title: string; sub: string; rows: AutoplanetResult["inv"]["groups"][number]["rows"]; subtotal: number;
  inputs: AutoplanetInputs; ro: boolean; mutate: Mutate; categoria: AutoInvLine["categoria"];
}) {
  const patch = (id: string, field: string, change: Partial<AutoInvLine>) =>
    mutate(`inv.${id}.${field}`, (p) => ({ ...p, invLines: p.invLines.map((l) => (l.id === id ? { ...l, ...change } : l)) }));
  const remove = (id: string) =>
    mutate(`inv.rm.${id}`, (p) => ({ ...p, invLines: p.invLines.filter((l) => l.id !== id) }));
  const add = () =>
    mutate(`inv.add.${Date.now()}`, (p) => ({ ...p, invLines: [...p.invLines, newInvLine(categoria)] }));

  return (
    <Card title={title} sub={`${sub} — MM CLP`}>
      <table className="w-full text-sm">
        <thead><tr className="text-xs text-muted-foreground border-b">
          <th className="py-1 text-left">Línea</th><th className="text-left px-1">Método</th>
          <th className="text-center">Valor</th><th className="text-right px-2">Monto (MM)</th><th className="text-right">UF/m²</th><th className="w-8" />
        </tr></thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={6} className="py-2 text-xs text-muted-foreground">Sin líneas. Agrega una para incluirla en la inversión.</td></tr>
          )}
          {rows.map((r) => {
            const ufM2eq = inputs.superficie && inputs.ufBase ? (r.monto * 1e6) / inputs.ufBase / inputs.superficie : 0;
            return (
              <tr key={r.id} className="border-b border-gray-100">
                <td className="py-1 pr-2">
                  <Input value={r.nombre} disabled={ro} onChange={(e) => patch(r.id, "nombre", { nombre: e.target.value })} className="h-7 text-xs" />
                </td>
                <td className="px-1">
                  {/* La garantía automática (1 mes de canon) solo aplica a la categoría Garantía */}
                  <Select value={r.metodo} disabled={ro} onValueChange={(v) => patch(r.id, "metodo", { metodo: v as AutoInvMethod })}>
                    <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(METHOD_LABEL) as AutoInvMethod[])
                        .filter((m) => m !== "auto" || categoria === "garantia")
                        .map((m) => <SelectItem key={m} value={m}>{METHOD_LABEL[m]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
                <td className="text-center">
                  {r.metodo === "auto"
                    ? <span className="text-xs text-muted-foreground">Sistema</span>
                    : <NumCell value={r.valor} disabled={ro} w="w-24" onChange={(v) => patch(r.id, "valor", { valor: v })} />}
                </td>
                <td className="text-right px-2 whitespace-nowrap">{fmtMM(r.monto)}</td>
                <td className="text-right text-muted-foreground whitespace-nowrap">{ufM2eq.toFixed(1).replace(".", ",")}</td>
                <td className="text-right">
                  {!ro && (
                    <Button variant="ghost" size="icon" className="h-6 w-6" title="Eliminar línea" onClick={() => remove(r.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
          <tr className="font-semibold">
            <td className="py-1.5" colSpan={3}>
              {!ro && (
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={add}>
                  <Plus className="h-3.5 w-3.5" /> Agregar línea
                </Button>
              )}
            </td>
            <td className="text-right px-2">{fmtMM(subtotal)}</td><td colSpan={2} />
          </tr>
        </tbody>
      </table>
    </Card>
  );
}

// ───────── Proyecciones ─────────
function SectionRow({ label }: { label: string }) {
  return (
    <tr><td colSpan={1 + yearCols.length} className="pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</td></tr>
  );
}

function ValueRow({ label, vals }: { label: string; vals: number[] }) {
  return (
    <tr className="border-b border-gray-50">
      <td className="text-left py-1">{label}</td>
      {yearCols.map((i) => <td key={i} className="text-right px-2">{fmtMM(vals[i] ?? 0)}</td>)}
    </tr>
  );
}

function TotalRow({ label, vals }: { label: string; vals: number[] }) {
  return (
    <tr className="border-b border-gray-50 font-semibold bg-muted/30">
      <td className="text-left py-1 pl-1">{label}</td>
      {yearCols.map((i) => <td key={i} className="text-right px-2">{fmtMM(vals[i] ?? 0)}</td>)}
    </tr>
  );
}

function PctRow({ label, vals }: { label: string; vals: number[] }) {
  return (
    <tr className="border-b border-gray-50 text-muted-foreground">
      <td className="text-left py-1 pl-1 italic">{label}</td>
      {yearCols.map((i) => <td key={i} className="text-right px-2">{fmtPct(vals[i] ?? 0)}</td>)}
    </tr>
  );
}

/** Fila de solo lectura del estado de resultados (con sus líneas hijas). */
function PnlNodeRows({ node, depth }: { node: PnlNode; depth: number }) {
  const hasKids = node.children.length > 0;
  return (
    <Fragment>
      <tr className={`border-b border-gray-50 ${depth === 0 && node.id === "ingresos" ? "font-semibold" : ""}`}>
        <td className="py-0.5" style={{ paddingLeft: depth * 16 }}>
          <span className="inline-flex items-center gap-1">
            {depth > 0 && <CornerDownRight className="h-3 w-3 text-muted-foreground shrink-0" />}
            {node.label}
            {node.origen && <span className="text-[10px] text-muted-foreground">· {node.origen}</span>}
            {node.margen != null && <span className="text-[10px] text-muted-foreground">· margen {node.margen}%</span>}
          </span>
        </td>
        {yearCols.map((i) => <td key={i} className="text-right px-2">{fmtMM(node.total[i] ?? 0)}</td>)}
      </tr>
      {node.base && hasKids && (
        <tr className="text-muted-foreground border-b border-gray-50">
          <td style={{ paddingLeft: 16 }} className="py-0.5 italic">↳ Según Supuestos (base)</td>
          {yearCols.map((i) => <td key={i} className="text-right px-2">{fmtMM(node.own[i] ?? 0)}</td>)}
        </tr>
      )}
      {node.children.map((c) => <PnlNodeRows key={c.id} node={c} depth={depth + 1} />)}
    </Fragment>
  );
}
