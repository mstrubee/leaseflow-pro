// ============================================================
// Business Case Financiero — MOTOR DE CÁLCULO (port fiel de business_case_editor.html)
// Cifras del P&L en MM CLP. Horizonte: año 0 (pre-apertura) + 5 años (índices 0..5).
// ============================================================

export type InvMethod = "uf_m2" | "total" | "auto";

export interface InvLine {
  id: string;
  nombre: string;
  metodo: InvMethod;
  valor: number; // uf_m2 → UF/m²; total → MM CLP; auto → ignora (=1 mes canon)
  activo: boolean;
  nota?: string;
}

export interface CostLine {
  id: string;
  nombre: string;
  activo: boolean;
  tipo: "fijo" | "variable" | "auto_uf";
  lock?: boolean;
}

export interface Aprobador {
  id: string;
  rol: string;
  requerido: boolean;
  orden: number;
}

export interface TipoDefaults {
  margenDir: number; // %
  personalY1: number; // MM CLP
  anosDepr: number;
}

export interface AdminConfig {
  org: { nombre: string; siglas: string; logoUrl: string };
  tiposProyecto: string[];
  categorias: string[];
  defaultsPorTipo: Record<string, TipoDefaults>;
  aprobadores: Aprobador[];
  invLineas: Record<string, InvLine[]>;
  costosLineas: CostLine[];
}

export const defaultAdminConfig: AdminConfig = {
  org: { nombre: "Grupo Planet", siglas: "GP", logoUrl: "" },
  tiposProyecto: ["Autoplanet", "Agroplanet"],
  categorias: ["Nuevo", "Ampliación", "Remodelación", "Relocación"],
  defaultsPorTipo: {
    Autoplanet: { margenDir: 53, personalY1: 26, anosDepr: 3 },
    Agroplanet: { margenDir: 45, personalY1: 20, anosDepr: 5 },
  },
  aprobadores: [
    { id: "sol", rol: "Solicitante", requerido: true, orden: 1 },
    { id: "cfd", rol: "Country FD", requerido: true, orden: 2 },
    { id: "cmd", rol: "Country MD", requerido: true, orden: 3 },
    { id: "afd", rol: "A&A FD", requerido: false, orden: 4 },
    { id: "ace", rol: "A&A CEO", requerido: false, orden: 5 },
    { id: "proc", rol: "Procurement", requerido: false, orden: 6 },
  ],
  invLineas: {
    Nuevo: [
      { id: "hab", nombre: "Habilitación", metodo: "uf_m2", valor: 6.33, activo: true, nota: "UF/m² construcción" },
      { id: "mob", nombre: "Mobiliario AF", metodo: "total", valor: 30, activo: true, nota: "MM CLP" },
      { id: "inv", nombre: "Inventario", metodo: "total", valor: 100, activo: true, nota: "MM CLP" },
      { id: "tec", nombre: "Tecnología", metodo: "total", valor: 10, activo: true, nota: "MM CLP" },
      { id: "mkt", nombre: "Marketing", metodo: "total", valor: 0, activo: true, nota: "MM CLP" },
      { id: "gar", nombre: "Garantía", metodo: "auto", valor: 0, activo: true, nota: "= 1 mes canon (UF)" },
    ],
    Ampliación: [
      { id: "obras", nombre: "Obras Ampliación", metodo: "uf_m2", valor: 4.5, activo: true, nota: "UF/m²" },
      { id: "mob", nombre: "Mobiliario Adicional", metodo: "total", valor: 15, activo: true, nota: "MM CLP" },
      { id: "inv", nombre: "Inventario Incremental", metodo: "total", valor: 50, activo: true, nota: "MM CLP" },
      { id: "tec", nombre: "Tecnología Adicional", metodo: "total", valor: 5, activo: true, nota: "MM CLP" },
    ],
    Remodelación: [
      { id: "obras", nombre: "Obras de Remodelación", metodo: "uf_m2", valor: 3.5, activo: true, nota: "UF/m²" },
      { id: "mob", nombre: "Mobiliario", metodo: "total", valor: 20, activo: true, nota: "MM CLP" },
      { id: "tec", nombre: "Tecnología", metodo: "total", valor: 8, activo: true, nota: "MM CLP" },
    ],
    Relocación: [
      { id: "hab", nombre: "Habilitación nuevo local", metodo: "uf_m2", valor: 6.33, activo: true, nota: "UF/m²" },
      { id: "tras", nombre: "Traslado / Mudanza", metodo: "total", valor: 10, activo: true, nota: "MM CLP" },
      { id: "adec", nombre: "Adecuaciones", metodo: "total", valor: 15, activo: true, nota: "MM CLP" },
      { id: "mkt", nombre: "Marketing apertura", metodo: "total", valor: 5, activo: true, nota: "MM CLP" },
      { id: "gar", nombre: "Garantía", metodo: "auto", valor: 0, activo: true, nota: "= 1 mes canon (UF)" },
    ],
  },
  costosLineas: [
    { id: "personal", nombre: "Personal", activo: true, tipo: "fijo", lock: false },
    { id: "publicidad", nombre: "Publicidad y Promoción", activo: true, tipo: "variable", lock: false },
    { id: "gral", nombre: "Gastos Generales", activo: true, tipo: "variable", lock: false },
    { id: "tec", nombre: "Tecnología", activo: true, tipo: "variable", lock: false },
    { id: "ocup", nombre: "Ocupación (sin Canon)", activo: true, tipo: "variable", lock: false },
    { id: "canon", nombre: "Canon de Arriendo", activo: true, tipo: "auto_uf", lock: true },
    { id: "gcom", nombre: "Gasto Común", activo: true, tipo: "auto_uf", lock: true },
  ],
};

// ---------- Inputs editables del business case (por contrato) ----------
export interface BCInputs {
  // Proyecto
  nombre: string;
  direccion: string;
  comuna: string;
  tipo: string; // Autoplanet / Agroplanet
  categoria: string; // Nuevo / Ampliación / ...
  descripcion: string;

  // Contrato
  superficie: number; // m²
  ufM2: number; // UF/m² (canon = superficie × ufM2)
  graciaMeses: number;
  durContratoAnios: number;
  inicio: string; // ISO date (entrega/inicio)
  gastoComunUf: number; // UF/mes

  // UF
  ufBase: number;
  ufRates: number[]; // % por año [5]

  // Económico
  waccRate: number; // %
  taxRate: number; // %
  scenario: "base" | "opt" | "cons";

  // Ventas (MM CLP/mes por año, Y1..Y5)
  ventaMes: number[]; // [v1..v5]

  // Márgenes / costos (%)
  margenDir: number;
  otrosCostosDir: number;
  costosVar: number;
  personalY1: number; // MM CLP
  personalCrec: number; // %
  gralPct: number;
  tecPct: number;
  ocupPct: number;

  // Depreciación
  capexDepreciable: number; // MM CLP base depreciable
  deprAnos: number;

  // Inversión: overrides por línea (MM CLP) { lineaId: monto }
  invOverrides: Record<string, number>;
}

export interface BCInvRow { id: string; nombre: string; metodo: InvMethod; monto: number; pct: number; nota?: string }

export interface BCResult {
  canonUF: number;
  garantiaUF: number;
  mesesY1: number;
  mesesArr: number[]; // [0, mesesY1, 12,12,12,12]
  ufStarts: number[]; // 5
  ufAvgs: number[]; // 5 (promedio geométrico)
  inv: { rows: BCInvRow[]; total: number; fisica: number; kt: number };
  // P&L (arrays de 6 columnas: índice 0 = año 0 pre-apertura)
  ingresos: number[];
  costoVentas: number[];
  otrosCostos: number[];
  costosVar: number[];
  margenCtrib: number[];
  personal: number[];
  publicidad: number[];
  gastosGral: number[];
  tecnologia: number[];
  ocupacion: number[];
  canonArr: number[];
  gastoComun: number[];
  gavs: number[];
  ebitda: number[];
  depreciacion: number[];
  ebit: number[];
  impuesto: number[];
  udi: number[];
  ros: number[];
  capex: number[];
  flujoOp: number[];
  payback: number[];
  // KPIs
  totalCapex: number;
  tir: number | null;
  van: number;
  paybackAnio: number; // índice de columna donde acumulado ≥ 0 (>0)
  ebitdaMargin5: number;
}

// ---------- helpers financieros ----------
export function calcNPV(cfs: number[], rate: number): number {
  return cfs.reduce((a, cf, t) => a + cf / Math.pow(1 + rate, t), 0);
}

export function calcIRR(cfs: number[], guess = 0.3): number | null {
  const hasPos = cfs.some((f) => f > 0);
  const hasNeg = cfs.some((f) => f < 0);
  if (!hasPos || !hasNeg) return null;
  let r = guess;
  for (let iter = 0; iter < 300; iter++) {
    let npv = 0, d = 0;
    cfs.forEach((cf, t) => {
      const disc = Math.pow(1 + r, t);
      npv += cf / disc;
      d += (-t * cf) / (disc * (1 + r));
    });
    if (Math.abs(d) < 1e-12) break;
    const delta = npv / d;
    r -= delta;
    if (Math.abs(delta) < 1e-8) break;
  }
  return Number.isFinite(r) ? r : null;
}

function calcUF(base: number, rates: number[]): { starts: number[]; avgs: number[] } {
  const starts = [base];
  const avgs: number[] = [];
  for (let i = 0; i < 5; i++) {
    const r = (rates[i] ?? 0) / 100;
    avgs.push(starts[i] * Math.sqrt(1 + r));
    starts.push(starts[i] * (1 + r));
  }
  return { starts: starts.slice(0, 5), avgs };
}

function round(v: number, d = 2): number {
  const p = Math.pow(10, d);
  return Math.round((Number.isFinite(v) ? v : 0) * p) / p;
}

// ---------- cálculo principal (réplica de recalcAll del HTML) ----------
export function computeBC(inputs: BCInputs, admin: AdminConfig = defaultAdminConfig): BCResult {
  const superficie = inputs.superficie || 0;
  const ufM2 = inputs.ufM2 || 0;
  const ufBase = inputs.ufBase || 39485.65;
  const { starts, avgs } = calcUF(ufBase, inputs.ufRates);

  // Contrato derivado
  const canonUF = round(superficie * ufM2, 2);
  const garantiaUF = canonUF;
  const gracia = inputs.graciaMeses || 0;
  let mesesY1 = 3;
  if (inputs.inicio) {
    const dtInicio = new Date(inputs.inicio + "T00:00:00");
    const dtCanon = new Date(dtInicio);
    dtCanon.setMonth(dtCanon.getMonth() + gracia);
    const anoInicio = dtCanon.getFullYear();
    const finAno = new Date(anoInicio, 11, 31);
    const diffMs = finAno.getTime() - dtCanon.getTime();
    mesesY1 = Math.min(12, Math.max(1, Math.round(diffMs / (30.44 * 24 * 3600 * 1000)) + 1));
  }
  const mesesArr = [0, mesesY1, 12, 12, 12, 12];

  // Inversión (por categoría)
  const lineas = (admin.invLineas[inputs.categoria] || admin.invLineas["Nuevo"]).filter((l) => l.activo);
  const ov = inputs.invOverrides || {};
  const invRows: BCInvRow[] = [];
  let total = 0;
  for (const l of lineas) {
    let monto = 0;
    if (l.metodo === "uf_m2") monto = round(superficie * l.valor * ufBase / 1e6, 2);
    else if (l.metodo === "auto") monto = round(garantiaUF * ufBase / 1e6, 2);
    else monto = l.valor;
    if (ov[l.id] !== undefined) monto = ov[l.id];
    invRows.push({ id: l.id, nombre: l.nombre, metodo: l.metodo, monto, pct: 0, nota: l.nota });
    total += monto;
  }
  invRows.forEach((r) => (r.pct = total > 0 ? (r.monto / total) * 100 : 0));
  let fisica = 0;
  for (const r of invRows) if (r.id !== "inv" && r.id !== "gar") fisica += r.monto;
  const ktRow = invRows.find((r) => r.id === "inv");
  const kt = ktRow ? ktRow.monto : 0;
  const totalCapex = total;

  // Canon y gasto común (MM CLP) — año 0 = 0; años 1..5 con UF promedio del año anterior
  const gcomUF = inputs.gastoComunUf || 0;
  const canonArr = mesesArr.map((m, i) => (i === 0 ? 0 : round(-canonUF * m * avgs[i - 1] / 1e6, 4)));
  const gastoComun = mesesArr.map((m, i) => (i === 0 ? 0 : round(-gcomUF * m * avgs[i - 1] / 1e6, 4)));

  // Ventas
  const sf = inputs.scenario === "opt" ? 1.1 : inputs.scenario === "cons" ? 0.85 : 1.0;
  const v = inputs.ventaMes || [];
  const ventaMes = [0, v[0] ?? 60, v[1] ?? 80, v[2] ?? 90, v[3] ?? 95, v[4] ?? 99.75];
  const ingresos = ventaMes.map((vv, i) => round(vv * mesesArr[i] * sf, 2));

  // Márgenes
  const mDir = (inputs.margenDir || 0) / 100;
  const oDir = (inputs.otrosCostosDir || 0) / 100;
  const cVar = (inputs.costosVar || 0) / 100;
  const costoVentas = ingresos.map((x) => round(-x * (1 - mDir), 2));
  const otrosCostos = ingresos.map((x) => round(-x * oDir, 2));
  const costosVar = ingresos.map((x) => round(-x * cVar, 2));
  const margenCtrib = ingresos.map((x, i) => round(x + costoVentas[i] + otrosCostos[i] + costosVar[i], 2));

  // Costos
  const perCr = (inputs.personalCrec || 0) / 100;
  const personal = [0];
  for (let i = 1; i < 6; i++) personal.push(i === 1 ? -(inputs.personalY1 || 0) : round(personal[i - 1] * (1 + perCr), 2));
  const gralPct = (inputs.gralPct || 0) / 100;
  const tecPct = (inputs.tecPct || 0) / 100;
  const ocupPct = (inputs.ocupPct || 0) / 100;
  const publicidad = [0, 0, 0, 0, 0, 0];
  const gastosGral = ingresos.map((x) => round(-Math.abs(x) * gralPct, 2));
  const tecnologia = ingresos.map((x) => round(-Math.abs(x) * tecPct, 2));
  const ocupacion = ingresos.map((x) => round(-Math.abs(x) * ocupPct, 2));

  const depr = round((inputs.capexDepreciable || 0) / (inputs.deprAnos || 1), 2);
  const depreciacion = [0, -depr, -depr, -depr, -depr, -depr];

  const gavs = [0, 1, 2, 3, 4, 5].map((i) =>
    round(personal[i] + publicidad[i] + gastosGral[i] + tecnologia[i] + ocupacion[i] + canonArr[i] + gastoComun[i], 2),
  );
  const ebitda = ingresos.map((_, i) => round(margenCtrib[i] + gavs[i], 2));
  const ebit = ebitda.map((x, i) => round(x + depreciacion[i], 2));
  const taxRate = (inputs.taxRate || 0) / 100;
  const impuesto = ebit.map((x) => round(-x * taxRate, 2));
  const udi = ebit.map((x) => round(x * (1 - taxRate), 2));
  const ros = ebit.map((x, i) => (ingresos[i] ? x / ingresos[i] : 0));

  const capex = [-totalCapex, 0, 0, 0, 0, 0];
  const flujoOp = udi.map((x, i) => (i === 0 ? -totalCapex : round(x + depr, 2)));
  const payback = [flujoOp[0]];
  for (let i = 1; i < 6; i++) payback.push(round(payback[i - 1] + flujoOp[i], 2));

  const tir = calcIRR(flujoOp);
  const van = round(calcNPV(flujoOp, (inputs.waccRate || 0) / 100), 1);
  const paybackAnio = payback.findIndex((x) => x >= 0);
  const ebitdaMargin5 = ingresos[5] ? ebitda[5] / ingresos[5] : 0;

  return {
    canonUF, garantiaUF, mesesY1, mesesArr, ufStarts: starts, ufAvgs: avgs,
    inv: { rows: invRows, total, fisica, kt },
    ingresos, costoVentas, otrosCostos, costosVar, margenCtrib,
    personal, publicidad, gastosGral, tecnologia, ocupacion, canonArr, gastoComun,
    gavs, ebitda, depreciacion, ebit, impuesto, udi, ros, capex, flujoOp, payback,
    totalCapex, tir, van, paybackAnio, ebitdaMargin5,
  };
}

// ---------- defaults / prefill desde el contrato ----------
export interface BCSeed {
  nombre?: string; direccion?: string; comuna?: string; tipo?: string;
  superficie?: number | null; ufM2?: number | null; gastoComunUf?: number | null;
  durContratoAnios?: number | null; inicio?: string | null; ufBase?: number;
}

export function buildDefaultBCInputs(seed: BCSeed = {}, admin: AdminConfig = defaultAdminConfig): BCInputs {
  const tipo = seed.tipo && admin.tiposProyecto.includes(seed.tipo) ? seed.tipo : admin.tiposProyecto[0];
  const d = admin.defaultsPorTipo[tipo] ?? { margenDir: 53, personalY1: 26, anosDepr: 3 };
  return {
    nombre: seed.nombre ?? "",
    direccion: seed.direccion ?? "",
    comuna: seed.comuna ?? "",
    tipo,
    categoria: admin.categorias[0],
    descripcion: "",
    superficie: seed.superficie ?? 0,
    ufM2: seed.ufM2 ?? 0.375,
    graciaMeses: 2,
    durContratoAnios: seed.durContratoAnios ?? 10,
    inicio: seed.inicio ?? new Date().toISOString().slice(0, 10),
    gastoComunUf: seed.gastoComunUf ?? 0,
    ufBase: seed.ufBase ?? 39485.65,
    ufRates: [3.8, 3.3, 3.0, 3.0, 3.0],
    waccRate: 12,
    taxRate: 27,
    scenario: "base",
    ventaMes: [60, 80, 90, 95, 99.75],
    margenDir: d.margenDir,
    otrosCostosDir: 0.3,
    costosVar: 5,
    personalY1: d.personalY1,
    personalCrec: 3.4,
    gralPct: 1.03,
    tecPct: 1.8,
    ocupPct: 1.28,
    capexDepreciable: 155,
    deprAnos: d.anosDepr,
    invOverrides: {},
  };
}
