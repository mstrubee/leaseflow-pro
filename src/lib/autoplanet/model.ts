// ============================================================
// Autoplanet Servicios — Business Case (negocio operativo B2C, NO arriendo de inmueble; independiente del Autoplanet de contratos)
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
 * Línea de costo directo o gasto operacional agregada por el usuario (se edita en Supuestos;
 * Proyecciones solo la muestra). Los montos se ingresan en positivo y siempre restan.
 *  - modo "monto": `valores` = MM CLP por año (índices 0..5).
 *  - modo "pct":   `valores` = % del total de Ingresos por año (índices 0..5).
 *  - En «Otros costos directos» solo se usa el año 1 (`valores[1]`); los años 2..5 crecen con `otrosCostosCrec`.
 * `parentId` = clave de una línea base (no "ingresos"), id de otra línea, o null (raíz del bloque).
 * Una línea con hijas es un subtotal: sus valores propios se ignoran.
 */
export interface PnlLine {
  id: string;
  nombre: string;
  bloque: PnlBlock;
  parentId: string | null;
  modo: "monto" | "pct";
  valores: number[];
}

/**
 * Línea de ingreso (Supuestos → Ingresos y Costos Directos). Es hija de la única línea «Ingresos»
 * y trae su propio «Costo de venta» mediante su margen.
 *  - `origen`: de dónde viene el ingreso (texto libre con sugerencias: Servicios, Repuestos…).
 *  - modo "directo": `ventaMes` = MM CLP por mes en el año 1.
 *  - modo "volumen": `unidades` (atenciones/mes) × `ticket` (CLP por atención) en el año 1.
 *  - Los años 2..5 salen de aplicar la tasa de crecimiento anual de «Ventas y Crecimiento UF anual».
 *  - `margen`: % de margen directo de la línea; null = usa el margen ponderado de las demás líneas.
 */
export interface IngresoLine {
  id: string;
  nombre: string;
  origen: string;
  modo: "directo" | "volumen";
  ventaMes: number;
  unidades: number;
  ticket: number;
  margen: number | null;
}

export interface PnlNode {
  id: string;
  label: string;
  base: boolean;
  sign: 1 | -1;
  origen?: string; // solo líneas de ingreso
  margen?: number | null; // % propio de la línea de ingreso (null = ponderado)
  own: number[];
  total: number[]; // propio + hijas
  children: PnlNode[];
}

export interface AutoplanetInputs extends BCInputs {
  invLines: AutoInvLine[];
  ingresoLines: IngresoLine[];
  pnlLines: PnlLine[];
  /** Crecimiento anual de las ventas en % para los años 2..5 (el año 1 sale de las líneas de ingreso). */
  ventaCrec: number[];
  /** Crecimiento anual en % de las líneas de «Otros costos directos» (modo monto) para los años 2..5. */
  otrosCostosCrec: number[];
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
  ventaMes: number[]; // venta mensual total (MM CLP/mes) de los años 1..5, derivada de las líneas de ingreso
  margenDirecto: number[]; // (Ingresos − costo de ventas) / Ingresos, ponderado por fuente
  margenDirectoProm: number; // fracción 0..1: margen ponderado de la venta (Márgenes y costos; default de fuentes sin margen propio)
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
const yearCols = () => [0, 1, 2, 3, 4, 5];

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

export function newIngresoLine(nombre = "Nueva línea de ingreso"): IngresoLine {
  return { id: newId("ing"), nombre, origen: "", modo: "directo", margen: null, ventaMes: 0, unidades: 0, ticket: 0 };
}

export function newInvLine(categoria: AutoInvCategory, nombre = "Nueva línea"): AutoInvLine {
  return { id: newId("inv"), categoria, nombre, metodo: "total", valor: 0 };
}

/** Elimina una línea y todas sus descendientes. */
export function removeLineCascade<T extends { id: string; parentId: string | null }>(lines: T[], id: string): T[] {
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

/** Ids de la línea y todas sus descendientes (para impedir ciclos al elegir "Depende de"). */
export function descendantIds<T extends { id: string; parentId: string | null }>(lines: T[], id: string): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const l of lines) {
      if (l.parentId && out.has(l.parentId) && !out.has(l.id)) { out.add(l.id); grew = true; }
    }
  }
  return out;
}

// Motor base: solo se usa para Supuestos (UF, canon, gasto común, personal). La inversión
// la calcula este módulo, por eso se le pasa una config sin líneas de inversión.
const BASE_ADMIN: AdminConfig = { ...defaultAdminConfig, invLineas: { Nuevo: [] } };

// ---------- defaults ----------
export function buildDefaultAutoplanetInputs(seed: BCSeed = {}): AutoplanetInputs {
  const base = buildDefaultBCInputs(seed, defaultAdminConfig);
  // Autoplanet Servicios es un negocio distinto al Autoplanet de contratos (retail): no se heredan
  // sus cifras de negocio (margen, venta, dotación, inversión). Parte en cero para que el usuario las defina.
  // Se mantienen solo los parámetros financieros genéricos (UF, tasa, impuesto, % de gastos).
  base.margenDir = 0;
  base.ventaMes = [0, 0, 0, 0, 0];
  base.personalY1 = 0;
  const invLines: AutoInvLine[] = [
    { id: "hab", categoria: "habilitacion", nombre: "Habilitación", metodo: "total", valor: 0 },
    { id: "af_1", categoria: "activos_fijos", nombre: "Activos fijos", metodo: "total", valor: 0 },
    { id: "eq_1", categoria: "equipos", nombre: "Equipos de servicio", metodo: "total", valor: 0 },
    { id: "tec", categoria: "tecnologia", nombre: "Tecnología", metodo: "total", valor: 0 },
    { id: "mkt", categoria: "marketing", nombre: "Marketing", metodo: "total", valor: 0 },
    { id: "gar", categoria: "garantia", nombre: "Garantía", metodo: "total", valor: 0 },
    { id: "inv", categoria: "inventario", nombre: "Inventario", metodo: "total", valor: 0 },
  ];
  return { ...base, invLines, ingresoLines: [], pnlLines: [], ventaCrec: [0, 0, 0, 0], otrosCostosCrec: [0, 0, 0, 0] };
}

/** Mezcla lo guardado con los defaults (tolera casos guardados con una versión anterior). */
export function mergeAutoplanetInputs(stored: Partial<AutoplanetInputs> | null | undefined, seed: BCSeed = {}): AutoplanetInputs {
  const defaults = buildDefaultAutoplanetInputs(seed);
  if (!stored) return defaults;
  return {
    ...defaults,
    ...stored,
    invLines: Array.isArray(stored.invLines) ? stored.invLines : defaults.invLines,
    ingresoLines: normalizeIngresoLines(stored.ingresoLines),
    pnlLines: normalizePnlLines(stored.pnlLines),
    ventaCrec: Array.isArray(stored.ventaCrec) ? stored.ventaCrec : defaults.ventaCrec,
    otrosCostosCrec: Array.isArray(stored.otrosCostosCrec) ? stored.otrosCostosCrec : defaults.otrosCostosCrec,
  };
}

const firstOf = (v: unknown): number => (Array.isArray(v) ? Number(v[0]) || 0 : Number(v) || 0);

/**
 * Versiones anteriores guardaban las líneas de ingreso con valores por año y con jerarquía.
 * Ahora son planas y con valores del año 1: se toma el año 1 y se descartan las líneas que solo eran
 * subtotales de otras (sus hijas quedan como líneas de ingreso).
 */
function normalizeIngresoLines(raw: unknown): IngresoLine[] {
  if (!Array.isArray(raw)) return [];
  const parents = new Set<string>(raw.map((l: { parentId?: string | null }) => l.parentId).filter((x): x is string => !!x));
  return raw
    .filter((l: { id: string }) => !parents.has(l.id))
    .map((l: Partial<IngresoLine> & { id: string }) => ({
      id: l.id, nombre: l.nombre ?? "", origen: l.origen ?? "",
      modo: l.modo === "volumen" ? "volumen" : "directo",
      ventaMes: firstOf(l.ventaMes), unidades: firstOf(l.unidades), ticket: firstOf(l.ticket),
      margen: typeof l.margen === "number" ? l.margen : null,
    }));
}

/**
 * - Las líneas bajo «Ingresos» ya no existen en Proyecciones (los ingresos se definen en Supuestos): se descartan.
 * - En Ingresos y Costos Directos solo se agregan líneas bajo «Otros costos directos»: las líneas de ese bloque
 *   que colgaban de otra línea (o eran propias) pasan a colgar de «Otros costos directos».
 */
function normalizePnlLines(raw: unknown): PnlLine[] {
  if (!Array.isArray(raw)) return [];
  const doomed = new Set<string>(["ingresos"]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const l of raw as PnlLine[]) {
      if (l.parentId && doomed.has(l.parentId) && !doomed.has(l.id)) { doomed.add(l.id); grew = true; }
    }
  }
  const lines = (raw as PnlLine[]).filter((l) => !doomed.has(l.id));
  const ids = new Set(lines.map((l) => l.id));
  return lines.map((l) =>
    l.bloque === "directos" && (l.parentId === null || !(ids.has(l.parentId) || l.parentId === "otrosCostos"))
      ? { ...l, parentId: "otrosCostos" }
      : l);
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

  // ----- Proyecciones: árbol de líneas (todo se deriva de Supuestos) -----
  const sf = inputs.scenario === "opt" ? 1.1 : inputs.scenario === "cons" ? 0.85 : 1.0;

  // 1) Ingresos: una sola línea «Ingresos» con una hija por línea de ingreso. Cada una trae su costo de venta
  //    (por su margen). El año 1 sale de la línea; los años 2..5 crecen con la tasa anual de Supuestos.
  const growth = [0, 1];
  for (let i = 2; i <= 5; i++) growth.push(growth[i - 1] * (1 + (inputs.ventaCrec?.[i - 2] || 0) / 100));
  const monthly1 = (l: IngresoLine) => (l.modo === "volumen" ? ((l.unidades || 0) * (l.ticket || 0)) / 1e6 : l.ventaMes || 0);
  const revOf = (l: IngresoLine) => yearCols().map((i) => (i === 0 ? 0 : round(monthly1(l) * growth[i] * base.mesesArr[i] * sf, 2)));
  const sumY15 = (a: number[]) => a.slice(1).reduce((x, y) => x + y, 0);
  const ventaMes = [1, 2, 3, 4, 5].map((i) => inputs.ingresoLines.reduce((a, l) => a + monthly1(l), 0) * growth[i]);

  // Margen ponderado de la venta: promedio, ponderado por ingresos (años 1..5), de los márgenes ingresados en
  // cada línea. Una línea sin margen propio usa este valor (el promedio final coincide con él).
  // Sin ingresos todavía: promedio simple de los márgenes ingresados.
  const explicit = inputs.ingresoLines.filter((l) => l.margen !== null).map((l) => ({ rev: sumY15(revOf(l)), m: l.margen as number }));
  const explicitRev = explicit.reduce((a, e) => a + e.rev, 0);
  const margenPonderado = explicitRev > 0
    ? explicit.reduce((a, e) => a + e.m * e.rev, 0) / explicitRev
    : explicit.length ? explicit.reduce((a, e) => a + e.m, 0) / explicit.length : 0;

  const ingresoTrees = inputs.ingresoLines.map((l) => {
    const rev = revOf(l);
    const margen = l.margen ?? margenPonderado;
    const costOwn = rev.map((v) => round(-v * (1 - (margen || 0) / 100), 2));
    const revNode: PnlNode = { id: l.id, label: l.nombre, base: false, sign: 1, origen: l.origen, margen: l.margen, own: rev, children: [], total: rev };
    const costNode: PnlNode = { id: `cv_${l.id}`, label: l.nombre, base: false, sign: -1, own: costOwn, children: [], total: costOwn };
    return { rev: revNode, cost: costNode };
  });
  const ingresosNode: PnlNode = {
    id: "ingresos", label: "Ingresos", base: true, sign: 1, own: zeros(), children: ingresoTrees.map((t) => t.rev),
    total: sumArrays(zeros(), ingresoTrees.map((t) => t.rev.total)),
  };
  const ing = ingresosNode.total;

  // 2) Líneas de costos directos / gastos operacionales agregadas (siempre restan).
  const lineById = new Map(inputs.pnlLines.map((l) => [l.id, l]));
  const baseKeys = new Set<string>(PNL_BASE.map((b) => b.key));
  const validParent = (l: PnlLine) =>
    l.parentId !== null && l.parentId !== l.id && (baseKeys.has(l.parentId) || lineById.has(l.parentId));
  const childrenOf = new Map<string, PnlLine[]>();
  const rootsByBlock: Record<PnlBlock, PnlLine[]> = { directos: [], operacionales: [] };
  for (const l of inputs.pnlLines) {
    if (validParent(l)) {
      childrenOf.set(l.parentId as string, [...(childrenOf.get(l.parentId as string) ?? []), l]);
    } else {
      rootsByBlock[l.bloque].push(l);
    }
  }
  // Líneas de «Otros costos directos»: año 1 + crecimiento anual (como las ventas). Son un monto MM/año o un % de
  // los Ingresos (este último ya crece con las ventas, por eso no lleva crecimiento propio). Año 0 = 0.
  // Líneas de Gastos Operacionales: valor por año (años 0..5).
  const costGrowth = [0, 1];
  for (let i = 2; i <= 5; i++) costGrowth.push(costGrowth[i - 1] * (1 + (inputs.otrosCostosCrec?.[i - 2] || 0) / 100));
  const ownOfLine = (l: PnlLine, i: number): number => {
    if (l.bloque === "directos") {
      if (i === 0) return 0;
      const v = l.valores[1] || 0;
      return round(-(l.modo === "pct" ? (ing[i] * v) / 100 : v * costGrowth[i]), 2);
    }
    const v = l.valores[i] || 0;
    return round(-(l.modo === "pct" ? (ing[i] * v) / 100 : v), 2);
  };
  const visited = new Set<string>();
  const buildCustom = (l: PnlLine): PnlNode => {
    visited.add(l.id);
    const kids = (childrenOf.get(l.id) ?? []).filter((k) => !visited.has(k.id)).map(buildCustom);
    const own = kids.length > 0 ? zeros() : yearCols().map((i) => ownOfLine(l, i));
    return { id: l.id, label: l.nombre, base: false, sign: -1, own, children: kids, total: sumArrays(own, kids.map((k) => k.total)) };
  };

  // 3) Resto de líneas base: mismas fórmulas que contratos, sobre el ingreso total.
  //    Costo de ventas: solo las hijas (una por línea de ingreso). Otros costos directos: solo líneas hijas.
  const cVar = (inputs.costosVar || 0) / 100;
  const gralPct = (inputs.gralPct || 0) / 100;
  const tecPct = (inputs.tecPct || 0) / 100;
  const ocupPct = (inputs.ocupPct || 0) / 100;
  const baseOwn: Record<Exclude<PnlBaseKey, "ingresos">, number[]> = {
    costoVentas: zeros(), // se compone de las líneas de ingreso (cada una con su margen)
    otrosCostos: zeros(), // solo líneas hijas
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
    const kids = [
      ...(key === "costoVentas" ? ingresoTrees.map((t) => t.cost) : []),
      ...(childrenOf.get(key) ?? []).map(buildCustom),
    ];
    const own = baseOwn[key];
    return { id: key, label: def.label, base: true, sign: -1, own, children: kids, total: sumArrays(own, kids.map((k) => k.total)) };
  };

  const blockNodes = (bloque: PnlBlock): PnlNode[] => [
    ...PNL_BASE.filter((b) => b.bloque === bloque).map((b) => buildBase(b.key)),
    ...rootsByBlock[bloque].filter((l) => !visited.has(l.id)).map(buildCustom),
  ];
  const directos = blockNodes("directos");
  const operacionales = blockNodes("operacionales");
  const costoVentasTotal = directos.find((n) => n.id === "costoVentas")!.total;
  const margenDirecto = ing.map((x, i) => (x ? (x + costoVentasTotal[i]) / x : 0));
  const margenDirectoProm = margenPonderado / 100;

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
    ingresos: ing, costosDirectos, margenCtrib, ventaMes, margenDirecto, margenDirectoProm, gavs, ebitda, depreciacion, ebit, impuesto, udi, ros, flujoOp, payback,
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
