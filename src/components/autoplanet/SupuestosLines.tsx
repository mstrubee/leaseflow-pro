import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CornerDownRight, Plus, Trash2 } from "lucide-react";
import { Card, NumCell } from "@/components/contracts/BusinessCaseFinanciero";
import { fmtMM, fmtPct } from "@/lib/businessCase/format";
import {
  AutoplanetInputs, AutoplanetResult, BLOCK_LABEL, IngresoLine, PNL_BASE, PnlLine, PnlNode,
  descendantIds, newIngresoLine, newPnlLine, removeLineCascade,
} from "@/lib/autoplanet/model";

type Mutate = (key: string, fn: (p: AutoplanetInputs) => AutoplanetInputs) => void;

const ROOT = "__root";
const ORIGEN_SUGGESTIONS = ["Servicios", "Repuestos y productos", "Convenios / flota", "Seguros y garantías", "Otros"];
const YEARS_0_5 = [0, 1, 2, 3, 4, 5];

function findById(nodes: PnlNode[], id: string): PnlNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const f = findById(n.children, id);
    if (f) return f;
  }
  return undefined;
}

/** Ordena una lista con parentId en recorrido de árbol (padre antes que sus hijas) y calcula la profundidad. */
function flatten<T extends { id: string; parentId: string | null }>(lines: T[], isRoot: (l: T) => boolean): { line: T; depth: number }[] {
  const out: { line: T; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (l: T, depth: number) => {
    if (seen.has(l.id)) return;
    seen.add(l.id);
    out.push({ line: l, depth });
    lines.filter((c) => c.parentId === l.id).forEach((c) => walk(c, depth + 1));
  };
  lines.filter(isRoot).forEach((l) => walk(l, 0));
  return out;
}

// ─────────────────── Ingresos y Costos Directos (único lugar donde se ingresan) ───────────────────
export function IngresosYCostosDirectos({ inputs, result, ro, mutate }: { inputs: AutoplanetInputs; result: AutoplanetResult; ro: boolean; mutate: Mutate }) {
  const lines = inputs.ingresoLines;
  const ingresosNode = result.directos.find((n) => n.id === "ingresos");
  const costoVentasNode = result.directos.find((n) => n.id === "costoVentas");
  const otrosNode = result.directos.find((n) => n.id === "otrosCostos");
  const costosVarNode = result.directos.find((n) => n.id === "costosVar");

  const patch = (id: string, field: string, change: Partial<IngresoLine>) =>
    mutate(`ing.${id}.${field}`, (p) => ({ ...p, ingresoLines: p.ingresoLines.map((l) => (l.id === id ? { ...l, ...change } : l)) }));
  const add = () => mutate(`ing.add.${Date.now()}`, (p) => ({ ...p, ingresoLines: [...p.ingresoLines, newIngresoLine()] }));
  const remove = (id: string) => mutate(`ing.rm.${id}`, (p) => ({ ...p, ingresoLines: p.ingresoLines.filter((l) => l.id !== id) }));

  const otrosLines = inputs.pnlLines.filter((l) => l.bloque === "directos");
  const addOtro = () => mutate(`pnl.add.${Date.now()}`, (p) => ({ ...p, pnlLines: [...p.pnlLines, newPnlLine("directos", "otrosCostos")] }));

  return (
    <Card title="Ingresos y Costos Directos"
      sub="Único lugar donde se ingresan los ingresos y los costos directos. Los ingresos del año 1 se ingresan aquí; los años siguientes crecen con la tasa de «Ventas y Crecimiento UF anual». Proyecciones se calcula desde aquí.">
      <datalist id="autoplanet-origenes">{ORIGEN_SUGGESTIONS.map((o) => <option key={o} value={o} />)}</datalist>

      {/* ───── Ingresos: una sola línea, con líneas hijas ───── */}
      <div className="rounded-md border">
        <div className="flex items-center gap-3 bg-muted/40 px-3 py-2">
          <span className="text-sm font-semibold">Ingresos</span>
          <span className="text-xs text-muted-foreground">Año 1: ${fmtMM(ingresosNode?.total[1] ?? 0)} MM · {fmtMM(result.ventaMes[0])} MM/mes</span>
          {!ro && (
            <Button variant="outline" size="sm" className="ml-auto h-7 gap-1 text-xs" onClick={add}>
              <Plus className="h-3.5 w-3.5" /> Agregar línea de ingreso
            </Button>
          )}
        </div>
        <div className="space-y-2 p-2">
          {lines.length === 0 && <p className="text-xs text-muted-foreground px-1">Sin líneas de ingreso. Agrega una para comenzar.</p>}
          {lines.map((l) => {
            const rev = ingresosNode ? findById(ingresosNode.children, l.id) : undefined;
            const cost = costoVentasNode ? findById(costoVentasNode.children, `cv_${l.id}`) : undefined;
            return (
              <div key={l.id} className="rounded-md border p-2 space-y-2 ml-4">
                <div className="flex flex-wrap items-center gap-2">
                  <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground" />
                  <Input value={l.nombre} disabled={ro} onChange={(e) => patch(l.id, "nombre", { nombre: e.target.value })} className="h-7 w-44 text-xs" placeholder="Nombre" />
                  <Input value={l.origen} disabled={ro} list="autoplanet-origenes" onChange={(e) => patch(l.id, "origen", { origen: e.target.value })} className="h-7 w-44 text-xs" placeholder="Origen (ej: Servicios)" />
                  <Select value={l.modo} disabled={ro} onValueChange={(v) => patch(l.id, "modo", { modo: v as IngresoLine["modo"] })}>
                    <SelectTrigger className="h-7 w-44 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="directo">Venta directa (MM/mes)</SelectItem>
                      <SelectItem value="volumen">Volumen × ticket</SelectItem>
                    </SelectContent>
                  </Select>
                  {!ro && (
                    <Button variant="ghost" size="icon" className="ml-auto h-7 w-7" title="Eliminar línea de ingreso" onClick={() => remove(l.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  )}
                </div>

                <div className="flex flex-wrap items-end gap-4 text-xs">
                  {l.modo === "directo" ? (
                    <Labeled label="Venta año 1 (MM/mes)"><NumCell value={l.ventaMes} disabled={ro} w="w-24" onChange={(v) => patch(l.id, "ventaMes", { ventaMes: v })} /></Labeled>
                  ) : (
                    <>
                      <Labeled label="Atenciones/mes (año 1)"><NumCell value={l.unidades} disabled={ro} w="w-24" onChange={(v) => patch(l.id, "unidades", { unidades: v })} /></Labeled>
                      <Labeled label="Ticket promedio (CLP)"><NumCell value={l.ticket} disabled={ro} w="w-28" onChange={(v) => patch(l.id, "ticket", { ticket: v })} /></Labeled>
                    </>
                  )}
                  <span className="pb-1 text-muted-foreground">Ingresos año 1: <b className="text-foreground">${fmtMM(rev?.total[1] ?? 0)} MM</b></span>
                </div>

                {/* Costo de venta de esta línea: se despliega según el margen ingresado */}
                <div className="flex flex-wrap items-end gap-4 text-xs rounded bg-muted/30 px-2 py-1.5">
                  <span className="pb-1 font-medium">Costo de venta</span>
                  <Labeled label="Margen %">
                    <Input type="number" step="any" disabled={ro} className="h-7 w-36 text-xs text-right px-1"
                      value={l.margen ?? ""} placeholder={`= ${fmtPct(result.margenDirectoProm)} ponderado`}
                      onChange={(e) => patch(l.id, "margen", { margen: e.target.value === "" ? null : parseFloat(e.target.value) || 0 })} />
                  </Labeled>
                  <span className="pb-1 text-muted-foreground">Año 1: <b className="text-foreground">${fmtMM(Math.abs(cost?.total[1] ?? 0))} MM</b></span>
                  <span className="pb-1 text-muted-foreground">Año 5: <b className="text-foreground">${fmtMM(Math.abs(cost?.total[5] ?? 0))} MM</b></span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ───── Costos directos ───── */}
      <div className="mt-3 space-y-2">
        <SummaryRow title="Costo de ventas" detail="Suma del costo de venta de cada línea de ingreso (según su margen)" node={costoVentasNode} />

        <div className="rounded-md border">
          <div className="flex items-center gap-3 bg-muted/40 px-3 py-2">
            <span className="text-sm font-semibold">Otros costos directos</span>
            <span className="text-xs text-muted-foreground">Total año 1: ${fmtMM(Math.abs(otrosNode?.total[1] ?? 0))} MM · solo se ingresan líneas hijas</span>
            {!ro && (
              <Button variant="outline" size="sm" className="ml-auto h-7 gap-1 text-xs" onClick={addOtro}>
                <Plus className="h-3.5 w-3.5" /> Agregar línea
              </Button>
            )}
          </div>
          <div className="space-y-2 p-2">
            {otrosLines.length === 0 && <p className="text-xs text-muted-foreground px-1">Sin líneas.</p>}
            {otrosLines.map((l) => (
              <PnlLineCard key={l.id} line={l} ro={ro} mutate={mutate} className="ml-4" year1Only
                projection={otrosNode ? findById(otrosNode.children, l.id)?.total : undefined} />
            ))}
            {otrosLines.length > 0 && (
              <div className="ml-4 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">Crec. anual % (aplica a las líneas en MM/año):</span>
                {inputs.otrosCostosCrec.map((r, i) => (
                  <Labeled key={i} label={`Año ${i + 2}`}>
                    <NumCell value={r} disabled={ro} w="w-16" onChange={(v) => mutate(`otrosCostosCrec.${i}`, (p) => {
                      const a = [...p.otrosCostosCrec];
                      a[i] = v;
                      return { ...p, otrosCostosCrec: a };
                    })} />
                  </Labeled>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-md border px-3 py-2 flex flex-wrap items-center gap-3 text-xs">
          <span className="text-sm font-semibold">Costos variables</span>
          <span className="text-muted-foreground">% de las Ventas (total de los Ingresos)</span>
          <NumCell value={inputs.costosVar} disabled={ro} w="w-20" onChange={(v) => mutate("costosVar", (p) => ({ ...p, costosVar: v }))} />
          <span className="text-muted-foreground">Año 1: <b className="text-foreground">${fmtMM(Math.abs(costosVarNode?.total[1] ?? 0))} MM</b></span>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="text-xs">
          <thead><tr className="text-muted-foreground">
            <th className="text-left pr-3 font-normal" />
            {[1, 2, 3, 4, 5].map((y) => <th key={y} className="px-3 font-normal text-right">Año {y}</th>)}
          </tr></thead>
          <tbody>
            <tr>
              <td className="pr-3 py-0.5 text-muted-foreground">Ingresos totales (MM/año)</td>
              {[1, 2, 3, 4, 5].map((y) => <td key={y} className="px-3 text-right font-medium">{fmtMM(result.ingresos[y])}</td>)}
            </tr>
            <tr>
              <td className="pr-3 py-0.5 text-muted-foreground">Margen directo ponderado</td>
              {[1, 2, 3, 4, 5].map((y) => <td key={y} className="px-3 text-right font-medium">{fmtPct(result.margenDirecto[y])}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-0.5"><span className="text-[11px] text-muted-foreground">{label}</span>{children}</label>;
}

function SummaryRow({ title, detail, node }: { title: string; detail: string; node?: PnlNode }) {
  return (
    <div className="rounded-md border px-3 py-2 flex flex-wrap items-center gap-3 text-xs">
      <span className="text-sm font-semibold">{title}</span>
      <span className="text-muted-foreground">{detail}</span>
      <span className="ml-auto text-muted-foreground">Año 1: <b className="text-foreground">${fmtMM(Math.abs(node?.total[1] ?? 0))} MM</b></span>
    </div>
  );
}

// ─────────────────── Líneas de costo: tarjeta editable de una PnlLine ───────────────────
function PnlLineCard({ line: l, ro, mutate, className = "", parentSelect, depth = 0, year1Only = false, projection }: {
  line: PnlLine; ro: boolean; mutate: Mutate; className?: string;
  /** Solo año 1 (el resto crece con la tasa anual), como las ventas. */
  year1Only?: boolean;
  /** Proyección calculada (con signo) de los años 0..5, para mostrarla bajo el año 1. */
  projection?: number[];
  /** Si se entrega, se muestra el selector «Hija de» y el botón «Hija». */
  parentSelect?: { options: { value: string; label: string }[]; onAddChild: () => void; hasChildren: boolean };
  depth?: number;
}) {
  const patch = (field: string, change: Partial<PnlLine>) =>
    mutate(`pnl.${l.id}.${field}`, (p) => ({ ...p, pnlLines: p.pnlLines.map((x) => (x.id === l.id ? { ...x, ...change } : x)) }));
  const setYear = (i: number, v: number) => {
    const valores = [...l.valores];
    while (valores.length < 6) valores.push(0);
    valores[i] = v;
    patch(`v${i}`, { valores });
  };
  const remove = () => mutate(`pnl.rm.${l.id}`, (p) => ({ ...p, pnlLines: removeLineCascade(p.pnlLines, l.id) }));
  const isGroup = parentSelect?.hasChildren ?? false;
  const years = year1Only ? [1, 2, 3, 4, 5] : YEARS_0_5;

  return (
    <div className={`rounded-md border p-2 space-y-2 ${className}`} style={depth ? { marginLeft: depth * 20 } : undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground" />
        <Input value={l.nombre} disabled={ro} onChange={(e) => patch("nombre", { nombre: e.target.value })} className="h-7 w-44 text-xs" />
        {parentSelect && (
          <Select value={l.parentId ?? ROOT} disabled={ro} onValueChange={(v) => patch("parent", { parentId: v === ROOT ? null : v })}>
            <SelectTrigger className="h-7 w-52 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{parentSelect.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {!isGroup && (
          <Select value={l.modo} disabled={ro} onValueChange={(v) => patch("modo", { modo: v as PnlLine["modo"] })}>
            <SelectTrigger className="h-7 w-44 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="monto">Monto (MM/año)</SelectItem>
              <SelectItem value="pct">% de los Ingresos</SelectItem>
            </SelectContent>
          </Select>
        )}
        {!ro && (
          <div className="ml-auto flex gap-1">
            {parentSelect && <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={parentSelect.onAddChild}><Plus className="h-3 w-3" /> Hija</Button>}
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Eliminar línea" onClick={remove}>
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </div>
        )}
      </div>
      {isGroup ? (
        <p className="text-[11px] text-muted-foreground">Subtotal: suma de sus hijas.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="text-xs">
            <thead><tr className="text-muted-foreground">
              <th className="text-left pr-3 font-normal" />
              {years.map((y) => <th key={y} className="px-1 font-normal text-center">{y === 0 ? "Año 0" : `Año ${y}`}</th>)}
            </tr></thead>
            <tbody>
              <tr>
                <td className="pr-3 py-1 whitespace-nowrap text-muted-foreground">{l.modo === "pct" ? "% de Ingresos" : year1Only ? "MM CLP año 1" : "MM CLP / año"}</td>
                {years.map((i) => (
                  <td key={i} className="px-1 text-center">
                    {(!year1Only || i === 1) && <NumCell value={l.valores?.[i] ?? 0} disabled={ro} w="w-16" onChange={(v) => setYear(i, v)} />}
                  </td>
                ))}
              </tr>
              {projection && (
                <tr>
                  <td className="pr-3 py-0.5 text-[10px] text-muted-foreground">Proyección (MM/año)</td>
                  {[1, 2, 3, 4, 5].map((y) => <td key={y} className="px-1 text-center text-[10px] text-muted-foreground">{fmtMM(Math.abs(projection[y] ?? 0))}</td>)}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────── Gastos Operacionales: líneas adicionales ───────────────────
export function GastosOperacionalesLineas({ inputs, ro, mutate }: { inputs: AutoplanetInputs; ro: boolean; mutate: Mutate }) {
  const bloque = "operacionales" as const;
  const lines = inputs.pnlLines.filter((l) => l.bloque === bloque);
  const ids = new Set(lines.map((l) => l.id));
  const baseKeys = PNL_BASE.filter((b) => b.bloque === bloque);
  const baseKeySet = new Set<string>(baseKeys.map((b) => b.key));
  const isRoot = (l: PnlLine) => l.parentId === null || l.parentId === l.id || (!ids.has(l.parentId) && !baseKeySet.has(l.parentId));
  // Las líneas cuyo padre es una línea base se listan bajo ese padre.
  const ordered = [
    ...baseKeys.flatMap((b) => flatten(lines, (l) => l.parentId === b.key).map((x) => ({ ...x, depth: x.depth + 1 }))),
    ...flatten(lines, isRoot),
  ];
  const add = (parentId: string | null) =>
    mutate(`pnl.add.${Date.now()}`, (p) => ({ ...p, pnlLines: [...p.pnlLines, newPnlLine(bloque, parentId)] }));

  return (
    <Card title={`${BLOCK_LABEL[bloque]} — líneas adicionales`}
      sub="Gastos extra, por ejemplo seguros o comisiones. Cuelgan de una línea existente o van como línea propia.">
      {ordered.length === 0 && <p className="text-xs text-muted-foreground">Sin líneas adicionales.</p>}
      <div className="space-y-2">
        {ordered.map(({ line: l, depth }) => {
          const blocked = descendantIds(lines, l.id);
          return (
            <PnlLineCard key={l.id} line={l} ro={ro} mutate={mutate} depth={Math.max(0, depth - 1)}
              parentSelect={{
                hasChildren: lines.some((c) => c.parentId === l.id),
                onAddChild: () => add(l.id),
                options: [
                  { value: ROOT, label: "Línea propia del bloque" },
                  ...baseKeys.map((b) => ({ value: b.key, label: `Hija de: ${b.label}` })),
                  ...lines.filter((o) => !blocked.has(o.id)).map((o) => ({ value: o.id, label: `Hija de: ${o.nombre || "(sin nombre)"}` })),
                ],
              }} />
          );
        })}
      </div>
      {!ro && (
        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs mt-3" onClick={() => add(null)}>
          <Plus className="h-3.5 w-3.5" /> Agregar línea
        </Button>
      )}
    </Card>
  );
}
