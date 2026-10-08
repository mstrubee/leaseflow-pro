import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CornerDownRight, Plus, Trash2 } from "lucide-react";
import { Card, NumCell } from "@/components/contracts/BusinessCaseFinanciero";
import { fmtMM, fmtPct } from "@/lib/businessCase/format";
import {
  AutoplanetInputs, AutoplanetResult, BLOCK_LABEL, IngresoLine, PNL_BASE, PnlBlock, PnlLine, PnlNode,
  descendantIds, newIngresoLine, newPnlLine, removeLineCascade,
} from "@/lib/autoplanet/model";

type Mutate = (key: string, fn: (p: AutoplanetInputs) => AutoplanetInputs) => void;

const ROOT = "__root";
const ORIGEN_SUGGESTIONS = ["Servicios", "Repuestos y productos", "Convenios / flota", "Seguros y garantías", "Otros"];

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

function findById(nodes: PnlNode[], id: string): PnlNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const f = findById(n.children, id);
    if (f) return f;
  }
  return undefined;
}

// ───────────────────────── Origen y margen de los ingresos ─────────────────────────
export function IngresosOrigenMargen({ inputs, result, ro, mutate }: { inputs: AutoplanetInputs; result: AutoplanetResult; ro: boolean; mutate: Mutate }) {
  const lines = inputs.ingresoLines;
  const ids = new Set(lines.map((l) => l.id));
  const ordered = flatten(lines, (l) => l.parentId === null || !ids.has(l.parentId) || l.parentId === l.id);
  const ingresosNode = result.directos.find((n) => n.id === "ingresos");

  const patch = (id: string, field: string, change: Partial<IngresoLine>) =>
    mutate(`ing.${id}.${field}`, (p) => ({ ...p, ingresoLines: p.ingresoLines.map((l) => (l.id === id ? { ...l, ...change } : l)) }));
  const setYear = (l: IngresoLine, field: "ventaMes" | "unidades" | "ticket", i: number, v: number) => {
    const arr = [...(l[field] ?? [])];
    while (arr.length < 5) arr.push(0);
    arr[i] = v;
    patch(l.id, `${field}${i}`, { [field]: arr });
  };
  const add = (parentId: string | null) =>
    mutate(`ing.add.${Date.now()}`, (p) => ({ ...p, ingresoLines: [...p.ingresoLines, newIngresoLine(parentId)] }));
  const remove = (id: string) =>
    mutate(`ing.rm.${id}`, (p) => ({ ...p, ingresoLines: removeLineCascade(p.ingresoLines, id) }));

  return (
    <Card title="Origen y margen de los ingresos"
      sub="Define de dónde vienen los ingresos y con qué margen. Aquí se ingresan TODOS los márgenes: el de la venta base y el de cada fuente. El «Margen directo %» de Márgenes y costos es el promedio ponderado de estos. Proyecciones se calcula desde aquí.">
      <datalist id="autoplanet-origenes">{ORIGEN_SUGGESTIONS.map((o) => <option key={o} value={o} />)}</datalist>

      <div className="overflow-x-auto mb-3">
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
            {ingresosNode && lines.length > 0 && (
              <tr>
                <td className="pr-3 py-0.5 text-[10px] text-muted-foreground">Venta base (MM/año)</td>
                {[1, 2, 3, 4, 5].map((y) => <td key={y} className="px-3 text-right text-[10px] text-muted-foreground">{fmtMM(ingresosNode.own[y])}</td>)}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2 mb-2 text-xs">
        <span className="font-medium">Venta base</span>
        <span className="text-muted-foreground">(fila «Venta (MM/mes)» de arriba)</span>
        <span className="ml-auto text-[11px] text-muted-foreground">Margen %</span>
        <NumCell value={inputs.margenDir} disabled={ro} w="w-20" onChange={(v) => mutate("margenDir", (p) => ({ ...p, margenDir: v }))} />
      </div>

      <div className="space-y-2">
        {ordered.length === 0 && <p className="text-xs text-muted-foreground">Sin fuentes adicionales: los ingresos son solo la venta base.</p>}
        {ordered.map(({ line: l, depth }) => {
          const blocked = descendantIds(lines, l.id);
          const isGroup = lines.some((c) => c.parentId === l.id);
          const node = ingresosNode ? findById(ingresosNode.children, l.id) : undefined;
          return (
            <div key={l.id} className="rounded-md border p-2 space-y-2" style={{ marginLeft: depth * 20 }}>
              <div className="flex flex-wrap items-center gap-2">
                {depth > 0 && <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground" />}
                <Input value={l.nombre} disabled={ro} onChange={(e) => patch(l.id, "nombre", { nombre: e.target.value })} className="h-7 w-44 text-xs" placeholder="Nombre" />
                <Input value={l.origen} disabled={ro} list="autoplanet-origenes" onChange={(e) => patch(l.id, "origen", { origen: e.target.value })} className="h-7 w-44 text-xs" placeholder="Origen (ej: Servicios)" />
                <Select value={l.parentId && ids.has(l.parentId) ? l.parentId : ROOT} disabled={ro}
                  onValueChange={(v) => patch(l.id, "parent", { parentId: v === ROOT ? null : v })}>
                  <SelectTrigger className="h-7 w-44 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ROOT}>Directo bajo Ingresos</SelectItem>
                    {lines.filter((o) => !blocked.has(o.id)).map((o) => <SelectItem key={o.id} value={o.id}>Hija de: {o.nombre || "(sin nombre)"}</SelectItem>)}
                  </SelectContent>
                </Select>
                {!isGroup && (
                  <>
                    <Select value={l.modo} disabled={ro} onValueChange={(v) => patch(l.id, "modo", { modo: v as IngresoLine["modo"] })}>
                      <SelectTrigger className="h-7 w-40 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="directo">Venta directa (MM/mes)</SelectItem>
                        <SelectItem value="volumen">Volumen × ticket</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-muted-foreground">Margen %</span>
                      <Input type="number" step="any" disabled={ro} className="h-7 w-20 text-xs text-right px-1"
                        value={l.margen ?? ""} placeholder={`= base (${inputs.margenDir})`}
                        onChange={(e) => patch(l.id, "margen", { margen: e.target.value === "" ? null : parseFloat(e.target.value) || 0 })} />
                    </div>
                  </>
                )}
                {!ro && (
                  <div className="ml-auto flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => add(l.id)}><Plus className="h-3 w-3" /> Hija</Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Eliminar fuente (y sus hijas)" onClick={() => remove(l.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                )}
              </div>

              {isGroup ? (
                <p className="text-[11px] text-muted-foreground">Subtotal: suma de sus hijas (cada hija con su propio margen).</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="text-xs">
                    <thead><tr className="text-muted-foreground">
                      <th className="text-left pr-3 font-normal" />
                      {[1, 2, 3, 4, 5].map((y) => <th key={y} className="px-1 font-normal text-center">Año {y}</th>)}
                    </tr></thead>
                    <tbody>
                      {l.modo === "directo" ? (
                        <YearRow label="Venta (MM/mes)" vals={l.ventaMes} ro={ro} onChange={(i, v) => setYear(l, "ventaMes", i, v)} />
                      ) : (
                        <>
                          <YearRow label="Atenciones / mes" vals={l.unidades} ro={ro} onChange={(i, v) => setYear(l, "unidades", i, v)} />
                          <YearRow label="Ticket promedio (CLP)" vals={l.ticket} ro={ro} w="w-24" onChange={(i, v) => setYear(l, "ticket", i, v)} />
                        </>
                      )}
                      <tr>
                        <td className="pr-3 py-0.5 text-[10px] text-muted-foreground">Ingresos (MM/año)</td>
                        {[1, 2, 3, 4, 5].map((y) => <td key={y} className="px-1 text-center text-[10px] text-muted-foreground">{fmtMM(node?.total[y] ?? 0)}</td>)}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!ro && (
        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs mt-3" onClick={() => add(null)}>
          <Plus className="h-3.5 w-3.5" /> Agregar fuente de ingreso
        </Button>
      )}
    </Card>
  );
}

function YearRow({ label, vals, ro, onChange, w = "w-20" }: { label: string; vals: number[]; ro: boolean; onChange: (i: number, v: number) => void; w?: string }) {
  return (
    <tr>
      <td className="pr-3 py-1 whitespace-nowrap text-muted-foreground">{label}</td>
      {[0, 1, 2, 3, 4].map((i) => (
        <td key={i} className="px-1 text-center"><NumCell value={vals?.[i] ?? 0} disabled={ro} w={w} onChange={(v) => onChange(i, v)} /></td>
      ))}
    </tr>
  );
}

// ───────────────── Costos directos y gastos operacionales adicionales ─────────────────
export function LineasAdicionales({ inputs, ro, mutate }: { inputs: AutoplanetInputs; ro: boolean; mutate: Mutate }) {
  return (
    <>
      {(["directos", "operacionales"] as PnlBlock[]).map((bloque) => (
        <BlockLines key={bloque} bloque={bloque} inputs={inputs} ro={ro} mutate={mutate} />
      ))}
    </>
  );
}

function BlockLines({ bloque, inputs, ro, mutate }: { bloque: PnlBlock; inputs: AutoplanetInputs; ro: boolean; mutate: Mutate }) {
  const lines = inputs.pnlLines.filter((l) => l.bloque === bloque);
  const ids = new Set(lines.map((l) => l.id));
  const baseKeys = PNL_BASE.filter((b) => b.bloque === bloque && b.key !== "ingresos");
  const baseKeySet = new Set<string>(baseKeys.map((b) => b.key));
  const isRoot = (l: PnlLine) => l.parentId === null || l.parentId === l.id || (!ids.has(l.parentId) && !baseKeySet.has(l.parentId));
  // Las líneas cuyo padre es una línea base se listan bajo ese padre.
  const ordered = [
    ...baseKeys.flatMap((b) => flatten(lines, (l) => l.parentId === b.key).map((x) => ({ ...x, depth: x.depth + 1 }))),
    ...flatten(lines, isRoot),
  ];
  const labelOf = (k: string) => baseKeys.find((b) => b.key === k)?.label ?? k;

  const patch = (id: string, field: string, change: Partial<PnlLine>) =>
    mutate(`pnl.${id}.${field}`, (p) => ({ ...p, pnlLines: p.pnlLines.map((l) => (l.id === id ? { ...l, ...change } : l)) }));
  const setYear = (l: PnlLine, i: number, v: number) => {
    const valores = [...l.valores];
    while (valores.length < 6) valores.push(0);
    valores[i] = v;
    patch(l.id, `v${i}`, { valores });
  };
  const add = (parentId: string | null) =>
    mutate(`pnl.add.${Date.now()}`, (p) => ({ ...p, pnlLines: [...p.pnlLines, newPnlLine(bloque, parentId)] }));
  const remove = (id: string) => mutate(`pnl.rm.${id}`, (p) => ({ ...p, pnlLines: removeLineCascade(p.pnlLines, id) }));

  return (
    <Card title={`${BLOCK_LABEL[bloque]} — líneas adicionales`}
      sub={bloque === "directos"
        ? "Costos directos extra, por ejemplo mano de obra directa o insumos. Cuelgan de una línea existente o van como línea propia."
        : "Gastos extra, por ejemplo seguros o comisiones. Cuelgan de una línea existente o van como línea propia."}>
      {ordered.length === 0 && <p className="text-xs text-muted-foreground">Sin líneas adicionales.</p>}
      <div className="space-y-2">
        {ordered.map(({ line: l, depth }) => {
          const blocked = descendantIds(lines, l.id);
          const isGroup = lines.some((c) => c.parentId === l.id);
          return (
            <div key={l.id} className="rounded-md border p-2 space-y-2" style={{ marginLeft: Math.max(0, depth - 1) * 20 }}>
              <div className="flex flex-wrap items-center gap-2">
                {depth > 0 && <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground" />}
                <Input value={l.nombre} disabled={ro} onChange={(e) => patch(l.id, "nombre", { nombre: e.target.value })} className="h-7 w-44 text-xs" />
                <Select value={l.parentId && (ids.has(l.parentId) || baseKeySet.has(l.parentId)) ? l.parentId : ROOT} disabled={ro}
                  onValueChange={(v) => patch(l.id, "parent", { parentId: v === ROOT ? null : v })}>
                  <SelectTrigger className="h-7 w-52 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ROOT}>Línea propia del bloque</SelectItem>
                    {baseKeys.map((b) => <SelectItem key={b.key} value={b.key}>Hija de: {labelOf(b.key)}</SelectItem>)}
                    {lines.filter((o) => !blocked.has(o.id)).map((o) => <SelectItem key={o.id} value={o.id}>Hija de: {o.nombre || "(sin nombre)"}</SelectItem>)}
                  </SelectContent>
                </Select>
                {!isGroup && (
                  <Select value={l.modo} disabled={ro} onValueChange={(v) => patch(l.id, "modo", { modo: v as PnlLine["modo"] })}>
                    <SelectTrigger className="h-7 w-44 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monto">Monto (MM/año)</SelectItem>
                      <SelectItem value="pct">% de los Ingresos</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {!ro && (
                  <div className="ml-auto flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => add(l.id)}><Plus className="h-3 w-3" /> Hija</Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Eliminar línea (y sus hijas)" onClick={() => remove(l.id)}>
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
                      {[0, 1, 2, 3, 4, 5].map((y) => <th key={y} className="px-1 font-normal text-center">{y === 0 ? "Año 0" : `Año ${y}`}</th>)}
                    </tr></thead>
                    <tbody>
                      <tr>
                        <td className="pr-3 py-1 whitespace-nowrap text-muted-foreground">{l.modo === "pct" ? "% de Ingresos" : "MM CLP / año"}</td>
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                          <td key={i} className="px-1 text-center"><NumCell value={l.valores?.[i] ?? 0} disabled={ro} w="w-16" onChange={(v) => setYear(l, i, v)} /></td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
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
