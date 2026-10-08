// ============================================================
// Autoplanet Servicios — Business Case (negocio operativo B2C, NO arriendo de inmueble)
//
// Decisión de arquitectura: este modelo es una CAPA sobre el motor del Business Case
// de contratos (src/lib/businessCase/model.ts), que NO se modifica. Los Supuestos son
// exactamente los mismos (BCInputs) y se calculan con `computeBC` (UF, canon, gasto
// común, personal, escenario). Lo nuevo:
//   1. Inversión editable por categoría (con Inventario separado).
//   2. Líneas (y líneas hijas) agregables en "Ingresos y Costos Directos" y en
//      "Gastos Operacionales".
// Cifras en MM CLP. Horizonte: año 0 (pre-apertura) + 5 años (índices 0..5).
// ============================================================
import {
  BCInputs, BCSeed, buildDefaultBCInputs, calcIRR, calcNPV, computeBC, defaultAdminConfig,
} from "@/lib/businessCase/model";
import type { AdminConfig } from "@/lib/businessCase/model";

// ---------- Inversión ----------
export type AutoInvCategory =
  | "habilitacion" | "activos_fijos" | "equipos" | "tecnologia" | "marketing" | "garantia" | "inventario";

export const INV_CATEGORIES: { id: AutoInvCategory; label: string; hint: string }[] = [
  { id: "habilitacion", label: "Habilitación", hint: "Obras y adecuación del local" },
  { id: "activos_fijos", label: "Activos Fijos", hint: "Mobiliario, instalaciones, vehículos" },
  { id: "equipos", label: "Equipos", hint: "Maquinaria y herramientas de servicio" },
  { id: "tecnologia", label: "Tecnología", hint: "Software, hardware, sistemas" },
  { id: "marketing", label: "Marketing", hint: "Lanzamiento y apertura" },
  { id: "garantia", label: "Garantía", hint: "Garantías y depósitos" },
  { id: "inventario", label: "Inventario", hint: "Capital de trabajo — se mantiene separado, no se deprecia" },
];

// total → MM CLP | uf_m2 → UF/m² (sobre superficie) | auto → 1 mes de canon (solo Garantía)
export type AutoInvMethod = "total" | "uf_m2" | "auto";

export interface AutoInvLine {
  id: string;
  categoria: AutoInvCategory;
  nombre: string;
  metodo: AutoInvMethod;
  valor: number;
}

export interface AutoInvRow extends AutoInvLine { monto: number; pct: number }
export interface AutoInvGroup { categoria: AutoInvCategory; label: string; hint: string; rows: AutoInvRow[]; subtotal: number }

// ---------- Proyecciones: líneas agregadas por el usuario ----------
export type PnlBlock = "directos" | "operacionales";

export type PnlBaseKey =
  | "ingresos" | "costoVentas" | "otrosCostos" | "costosVar"
  | "personal" | "publicidad" | "gastosGral" | "tecnologia" | "ocupacion" | "canonArr" | "gastoComun";

export const PNL_BASE: { key: PnlBaseKey; label: string; bloque: PnlBlock; sign: 1 | -1 }[] = [
  { key: "ingresos", label: "Ingresos", bloque: "directos", sign: 1 },
  { key: "costoVentas", label: "Costo de Ventas", bloque: "directos", sign: -1 },
  { key: "otrosCostos", label: "Otros costos dir.", bloque: "directos", sign: -1 },
  { key: "costosVar", label: "Costos variables", bloque: "directos", sign: -1 },
  { key: "personal", label: "Personal", bloque: "operacionales", sign: -1 },
  { key: "publicidad", label: "Publicidad", bloque: "operacionales", sign: -1 },
  { key: "gastosGral", label: "Gastos Generales", bloque: "operacionales", sign: -1 },
  { key: "tecnologia", label: "Tecnología", bloque: "operacionales", sign: -1 },
  { key: "ocupacion", label: "Ocupación", bloque: "operacionales", sign: -1 },
  { key: "canonArr", label: "Canon Arriendo", bloque: "operacionales", sign: -1 },
  { key: "gastoComun", label: "Gasto Común", bloque: "operacionales", sign: -1 },
];

export const BLOCK_LABEL: Record<PnlBlock, string> = {
  directos: "Ingresos y Costos Directos",
  operacionales: "Gastos Operacionales",
};

/**
 * Línea agregada por el usuario. Los montos se ingresan SIEMPRE en positivo; el signo
 * lo define la posición: hija de "Ingresos" suma, cualquier otra resta.
 *  - modo "monto": `valores` = MM CLP por año (índices 0..5).
 *  - modo "pct":   `valores` = % de la venta base de Supuestos por año (índices 0..5).
 * `parentId` = clave de una línea base, id de otra línea agregada, o null (línea raíz del bloque).
 */
export interface PnlLine {
  id: string;
  nombre: string;
  bloque: PnlBlock;
  parentId: string | null;
  modo: "monto" | "pct";
  valores: number[];
}

export interface PnlNode {
  id: string;
  label: string;
  base: boolean;
  sign: 1 | -1;
  modo?: "monto" | "pct";
  raw?: number[]; // valores tal como los ingresó el usuario (solo líneas agregadas)
  own: number[];
  total: number[]; // propio + hijas
  children: PnlNode[];
}

export interface AutoplanetInputs extends BCInputs {
  invLines: AutoInvLine[];
  pnlLines: PnlLine[];
}

export interface AutoplanetResult {
  canonUF: number;
  garantiaUF: number;
  mesesY1: number;
  inv: { groups: AutoInvGroup[]; total: number; fisica: number; inventario: number };
  directos: PnlNode[];
  operacionales: PnlNode[];
  ingresos: number[];
  costosDirectos: number[];
  margenCtrib: number[];
  gavs: number[];
  ebitda: number[];
  depreciacion: number[];
  ebit: number[];
  impuesto: number[];
  udi: number[];
  ros: number[];
  flujoOp: number[];
  payback: number[];
  totalCapex: number;
  tir: number | null;
  van: number;
  paybackAnio: number;
  ebitdaMargin5: number;
}

// ---------- helpers ----------
const YEARS = 6;
const zeros = () => new Array(YEARS).fill(0) as number[];

function round(v: number, d = 2): number {
  const p = Math.pow(10, d);
  return Math.round((Number.isFinite(v) ? v : 0) * p) / p;
}

export function newId(prefix: string): string {
  const rnd = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rnd}`;
}

export function newPnlLine(bloque: PnlBlock, parentId: string | null, nombre = "Nueva línea"): PnlLine {
  return { id: newId("ln"), nombre, bloque, parentId, modo: "monto", valores: zeros() };
}

export function newInvLine(categoria: AutoInvCategory, nombre = "Nueva línea"): AutoInvLine {
  return { id: newId("inv"), categoria, nombre, metodo: "total", valor: 0 };
}

/** Elimina una línea y todas sus descendientes. */
export function removePnlLineCascade(lines: PnlLine[], id: string): PnlLine[] {
  const doomed = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const l of lines) {
      if (l.parentId && doomed.has(l.parentId) && !doomed.has(l.id)) { doomed.add(l.id); grew = true; }
    }
  }
  return lines.filter((l) => !doomed.has(l.id));
}

// Motor base: solo se usa para Supuestos (UF, canon, gasto común, personal). La inversión
// la calcula este módulo, por eso se le pasa una config sin líneas de inversión.
const BASE_ADMIN: AdminConfig = { ...defaultAdminConfig, invLineas: { Nuevo: [] } };

// ---------- defaults ----------
export function buildDefaultAutoplanetInputs(seed: BCSeed = {}): AutoplanetInputs {
  const base = buildDefaultBCInputs({ ...seed, tipo: "Autoplanet" }, defaultAdminConfig);
  // Punto de partida: mismos montos que el caso "Nuevo" de contratos, repartidos por categoría.
  const invLines: AutoInvLine[] = [
    { id: "hab", categoria: "habilitacion", nombre: "Habilitación", metodo: "uf_m2", valor: 6.33 },
    { id: "af_mob", categoria: "activos_fijos", nombre: "Mobiliario", metodo: "total", valor: 30 },
    { id: "eq_1", categoria: "equipos", nombre: "Equipos de servicio", metodo: "total", valor: 0 },
    { id: "tec", categoria: "tecnologia", nombre: "Tecnología", metodo: "total", valor: 10 },
    { id: "mkt", categoria: "marketing", nombre: "Marketing", metodo: "total", valor: 0 },
    { id: "gar", categoria: "garantia", nombre: "Garantía", metodo: "auto", valor: 0 },
    { id: "inv", categoria: "inventario", nombre: "Inventario", metodo: "total", valor: 100 },
  ];
  return { ...base, invLines, pnlLines: [] };
}

/** Mezcla lo guardado con los defaults (tolera casos guardados con una versión anterior). */
export function mergeAutoplanetInputs(stored: Partial<AutoplanetInputs> | null | undefined, seed: BCSeed = {}): AutoplanetInputs {
  const defaults = buildDefaultAutoplanetInputs(seed);
  if (!stored) return defaults;
  return {
    ...defaults,
    ...stored,
    invLines: Array.isArray(stored.invLines) ? stored.invLines : defaults.invLines,
    pnlLines: Array.isArray(stored.pnlLines) ? stored.pnlLines : [],
  };
}

// ---------- cálculo ----------
export function computeAutoplanet(inputs: AutoplanetInputs): AutoplanetResult {
  const base = computeBC({ ...inputs, categoria: "Nuevo", invOverrides: {} }, BASE_ADMIN);
  const superficie = inputs.superficie || 0;
  const ufBase = inputs.ufBase || 39485.65;

  // ----- Inversión -----
  const invGroups: AutoInvGroup[] = INV_CATEGORIES.map((c) => ({ categoria: c.id, label: c.label, hint: c.hint, rows: [], subtotal: 0 }));
  let invTotal = 0;
  for (const l of inputs.invLines) {
    const group = invGroups.find((g) => g.categoria === l.categoria);
    if (!group) continue;
    let monto = l.valor;
    if (l.metodo === "uf_m2") monto = round(superficie * l.valor * ufBase / 1e6, 2);
    else if (l.metodo === "auto") monto = round(base.garantiaUF * ufBase / 1e6, 2);
    group.rows.push({ ...l, monto, pct: 0 });
    group.subtotal += monto;
    invTotal += monto;
  }
  invGroups.forEach((g) => g.rows.forEach((r) => (r.pct = invTotal > 0 ? (r.monto / invTotal) * 100 : 0)));
  const subtotalOf = (c: AutoInvCategory) => invGroups.find((g) => g.categoria === c)?.subtotal ?? 0;
  const inventario = subtotalOf("inventario");
  // Igual que en contratos: se deprecia todo salvo Inventario y Garantía.
  const fisica = invTotal - inventario - subtotalOf("garantia");

  // ----- Proyecciones: árbol de líneas -----
  const lineById = new Map(inputs.pnlLines.map((l) => [l.id, l]));
  const baseKeys = new Set<string>(PNL_BASE.map((b) => b.key));
  const validParent = (l: PnlLine) =>
    l.parentId !== null && l.parentId !== l.id && (baseKeys.has(l.parentId) || lineById.has(l.parentId));
  const childrenOf = new Map<string, PnlLine[]>();
  const rootsByBlock: Record<PnlBlock, PnlLine[]> = { directos: [], operacionales: [] };
  for (const l of inputs.pnlLines) {
    if (validParent(l)) {
      const arr = childrenOf.get(l.parentId as string) ?? [];
      arr.push(l);
      childrenOf.set(l.parentId as string, arr);
    } else {
      rootsByBlock[l.bloque].push(l);
    }
  }

  const sf = inputs.scenario === "opt" ? 1.1 : inputs.scenario === "cons" ? 0.85 : 1.0;
  const ventaBase = base.ingresos; // venta base de Supuestos (ya incluye escenario)

  // Valores propios de una línea agregada (con signo). El escenario afecta a las líneas de ingreso.
  const ownOfCustom = (l: PnlLine, sign: 1 | -1): number[] =>
    l.valores.slice(0, YEARS).concat(zeros()).slice(0, YEARS).map((v, i) => {
      const raw = l.modo === "pct" ? ventaBase[i] * (v || 0) / 100 : (v || 0) * (sign === 1 ? sf : 1);
      return round(sign * raw, 2);
    });

  const visited = new Set<string>();
  const buildCustom = (l: PnlLine, sign: 1 | -1): PnlNode => {
    visited.add(l.id);
    const kids = (childrenOf.get(l.id) ?? []).filter((k) => !visited.has(k.id)).map((k) => buildCustom(k, sign));
    const own = ownOfCustom(l, sign);
    return { id: l.id, label: l.nombre, base: false, sign, modo: l.modo, raw: l.valores, own, children: kids, total: sumArrays(own, kids.map((k) => k.total)) };
  };

  // 1) Ingresos (los % de costos se calculan sobre el total, incluidas las hijas)
  const ingresosKids = (childrenOf.get("ingresos") ?? []).map((k) => buildCustom(k, 1));
  const ingresosNode: PnlNode = {
    id: "ingresos", label: "Ingresos", base: true, sign: 1, own: ventaBase, children: ingresosKids,
    total: sumArrays(ventaBase, ingresosKids.map((k) => k.total)),
  };
  const ing = ingresosNode.total;

  // 2) Resto de líneas base: mismas fórmulas que contratos, sobre el ingreso total.
  const mDir = (inputs.margenDir || 0) / 100;
  const oDir = (inputs.otrosCostosDir || 0) / 100;
  const cVar = (inputs.costosVar || 0) / 100;
  const gralPct = (inputs.gralPct || 0) / 100;
  const tecPct = (inputs.tecPct || 0) / 100;
  const ocupPct = (inputs.ocupPct || 0) / 100;
  const baseOwn: Record<Exclude<PnlBaseKey, "ingresos">, number[]> = {
    costoVentas: ing.map((x) => round(-x * (1 - mDir), 2)),
    otrosCostos: ing.map((x) => round(-x * oDir, 2)),
    costosVar: ing.map((x) => round(-x * cVar, 2)),
    personal: base.personal,
    publicidad: base.publicidad,
    gastosGral: ing.map((x) => round(-Math.abs(x) * gralPct, 2)),
    tecnologia: ing.map((x) => round(-Math.abs(x) * tecPct, 2)),
    ocupacion: ing.map((x) => round(-Math.abs(x) * ocupPct, 2)),
    canonArr: base.canonArr,
    gastoComun: base.gastoComun,
  };

  const buildBase = (key: PnlBaseKey): PnlNode => {
    if (key === "ingresos") return ingresosNode;
    const def = PNL_BASE.find((b) => b.key === key)!;
    const kids = (childrenOf.get(key) ?? []).map((k) => buildCustom(k, -1));
    const own = baseOwn[key];
    return { id: key, label: def.label, base: true, sign: -1, own, children: kids, total: sumArrays(own, kids.map((k) => k.total)) };
  };

  const blockNodes = (bloque: PnlBlock): PnlNode[] => [
    ...PNL_BASE.filter((b) => b.bloque === bloque).map((b) => buildBase(b.key)),
    ...rootsByBlock[bloque].filter((l) => !visited.has(l.id)).map((l) => buildCustom(l, -1)),
  ];
  const directos = blockNodes("directos");
  const operacionales = blockNodes("operacionales");

  const costosDirectos = sumArrays(zeros(), directos.filter((n) => n.id !== "ingresos").map((n) => n.total));
  const margenCtrib = ing.map((x, i) => round(x + costosDirectos[i], 2));
  const gavs = sumArrays(zeros(), operacionales.map((n) => n.total));
  const ebitda = margenCtrib.map((x, i) => round(x + gavs[i], 2));

  const depr = round(fisica / (inputs.deprAnos || 1), 2);
  const depreciacion = [0, -depr, -depr, -depr, -depr, -depr];
  const ebit = ebitda.map((x, i) => round(x + depreciacion[i], 2));
  const taxRate = (inputs.taxRate || 0) / 100;
  const impuesto = ebit.map((x) => round(-x * taxRate, 2));
  const udi = ebit.map((x) => round(x * (1 - taxRate), 2));
  const ros = ebit.map((x, i) => (ing[i] ? x / ing[i] : 0));

  const flujoOp = udi.map((x, i) => (i === 0 ? -invTotal : round(x + depr, 2)));
  const payback = [flujoOp[0]];
  for (let i = 1; i < YEARS; i++) payback.push(round(payback[i - 1] + flujoOp[i], 2));

  return {
    canonUF: base.canonUF, garantiaUF: base.garantiaUF, mesesY1: base.mesesY1,
    inv: { groups: invGroups, total: invTotal, fisica, inventario },
    directos, operacionales,
    ingresos: ing, costosDirectos, margenCtrib, gavs, ebitda, depreciacion, ebit, impuesto, udi, ros, flujoOp, payback,
    totalCapex: invTotal,
    tir: calcIRR(flujoOp),
    van: round(calcNPV(flujoOp, (inputs.waccRate || 0) / 100), 1),
    paybackAnio: payback.findIndex((x) => x >= 0),
    ebitdaMargin5: ing[5] ? ebitda[5] / ing[5] : 0,
  };
}

function sumArrays(own: number[], others: number[][]): number[] {
  return own.map((v, i) => round(v + others.reduce((a, o) => a + (o[i] ?? 0), 0), 2));
}
