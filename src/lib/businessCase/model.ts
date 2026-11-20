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
  personalY1: number; // N° de personas del equipo en el año 1
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
    Autoplanet: { margenDir: 53, personalY1: 12, anosDepr: 3 },
    Agroplanet: { margenDir: 45, personalY1: 8, anosDepr: 5 },
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

// ---------- Formato de local ----------
// Tradicional y Express se diferencian sólo en la dotación y en el capital de
// trabajo (inventario). Elegir un formato precarga esos dos valores; después
// quedan editables a mano como cualquier otro input.
export const FORMATOS_LOCAL = ["Tradicional", "Express"] as const;
export type FormatoLocal = (typeof FORMATOS_LOCAL)[number];
export const FORMATO_PRESETS: Record<FormatoLocal, { personalY1: number; inventarioMM: number }> = {
  Tradicional: { personalY1: 8.5, inventarioMM: 100 },
  Express: { personalY1: 6.5, inventarioMM: 60 },
};

// ---------- Ocupación: monto FIJO en MM CLP/mes ----------
// El costo de ocupación (sin canon) es un monto fijo por mes de operación
// (BCInputs.ocupMesMM, objetivo por formato): NO crece con las ventas. Año 1 =
// ocupMesMM × meses de operación; desde el año 2 se reajusta cada año por la
// inflación (la misma UF promedio que ya usa el canon, relativa al año 1).
// El "%" que se ve en pantalla es solo informativo: monto ÷ Venta Año 1
// (MM/mes) — se recalcula solo cuando cambian ventas o formato; editarlo a mano
// cambia el monto (ver useBusinessCaseV2). Un formato nuevo precarga el objetivo.
export const OCUPACION_TARGET_MM: Record<FormatoLocal, number> = {
  Tradicional: 1.5,
  Express: 1.2,
};

// ---------- Inputs editables del business case (por contrato) ----------
export interface BCInputs {
  // Proyecto
  nombre: string;
  direccion: string;
  comuna: string;
  tipo: string; // Autoplanet / Agroplanet
  formato: FormatoLocal; // Tradicional / Express (dotación + capital de trabajo)
  categoria: string; // Nuevo / Ampliación / ...
  descripcion: string;

  // Contrato
  superficie: number; // m²
  ufM2: number; // UF/m² del tramo base, antes de cualquier escalación (canon base = superficie × ufM2)
  // Tramos de arriendo escalonado, sincronizados desde el contrato (rent_escalations).
  // Solo lectura: no editables desde el BC. Ver canonUfForLeaseMonth en computeBC.
  escalations: BCEscalation[];
  regimeRentIsUfM2: boolean;
  // Fondo de Promoción: % del canon (fondo_promocion_percentage del contrato).
  // Sincronizado desde el contrato, solo lectura (mismo trato que escalations).
  fondoPromocionPct: number;
  graciaMeses: number;
  durContratoAnios: number;
  inicio: string; // ISO date (entrega/inicio)
  /** ISO date del mes de apertura al público. Puede diferir del inicio de pago
   *  de renta (inicio + gracia). Define los meses de operación del año 1
   *  (ingresos) y, un mes antes, el inicio del pago de personal.
   *  Si viene vacío se asume el inicio de pago de renta. */
  apertura: string;
  gastoComunUf: number; // UF/mes

  // UF real (inflación/IPC, ~3-4% anual) — SOLO convierte a CLP los montos en
  // UF (canon, gasto común, fondo promoción, reajuste de personal). NO es la
  // tasa de crecimiento de ventas — ver ventaGrowthPct.
  ufBase: number;
  ufRates: number[]; // % por año [5]

  // Tasa de maduración de ventas: la usa updateVentaConCrecimiento (hook) para
  // proyectar los años de "Venta (MM/mes)" hacia adelante/atrás al editar uno.
  // Es una curva de ventas del local (puede ser 20-30%+ en los primeros años),
  // sin relación con el crecimiento real de la UF — antes compartía el campo
  // ufRates con la conversión UF→CLP, lo que inflaba canon/gasto común con
  // tasas de venta en vez de inflación real.
  ventaGrowthPct: number[]; // % por año [5]

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
  personalY1: number; // N° de personas del equipo en el año 1
  costoPersonaMM: number; // costo total por persona (MM CLP / año)
  personalCrec: number; // %
  gralPct: number;
  tecPct: number;
  ocupPct: number; // INFORMATIVO: ocupMesMM ÷ Venta Año 1 (%). Lo mantiene sincronizado el hook; el cálculo usa ocupMesMM.
  ocupMesMM: number; // Ocupación fija, MM CLP/mes de operación en el año 1 (se reajusta por UF desde el año 2)

  // Depreciación (la base depreciable se lee desde la Inversión física)
  capexDepreciable: number; // DEPRECADO: ya no se usa (se calcula desde inv.fisica)
  deprAnos: number;

  // Inversión: overrides por línea (MM CLP) { lineaId: monto }
  invOverrides: Record<string, number>;
}

export interface BCInvRow { id: string; nombre: string; metodo: InvMethod; monto: number; pct: number; nota?: string }

export interface BCCanonYearBreakdown { meses: number; ufMes: number }

export interface BCResult {
  canonUF: number;
  garantiaUF: number;
  mesesY1: number; // meses de RENTA del año 1 (desde inicio + gracia)
  mesesArr: number[]; // [0, mesesY1, 12,12,12,12]
  mesesOperacion: number; // meses de OPERACIÓN del año 1 (desde la apertura) → ingresos
  mesesPersonal: number; // meses de PERSONAL del año 1 (= operación + 1, se contrata antes)
  anoApertura: number; // año calendario de apertura al público = "Año 1" real (primer año que efectivamente se vende)
  // Año calendario de la columna "Año 1" del modelo (= año en que parte el pago
  // de canon: inicio + gracia). Es el calendario sobre el que computeBC indexa
  // los años 1..5, así que es el que corresponde para rotular columnas en
  // PDF / Excel / PPT. Puede diferir de anoApertura si el local abre en otro año.
  anoRenta: number;
  ufStarts: number[]; // 5
  ufAvgs: number[]; // 5 (promedio geométrico)
  inv: { rows: BCInvRow[]; total: number; fisica: number; kt: number };
  // P&L (arrays de 6 columnas: índice 0 = año 0 pre-apertura)
  ingresos: number[];
  // Tramos de "año de vida" que componen cada Ingresos[i] — para el detalle
  // de cálculo en la UI. Índice 0 vacío. Ver también BCResult.scenarioFactor.
  ingresosTramos: { anoVida: number; meses: number; tasa: number }[][];
  scenarioFactor: number;
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
  // UF/mes promedio de cada año-modelo (antes de convertir a CLP) y su
  // desglose por tramo — para el detalle de cálculo en la UI. Índice 0 vacío.
  canonUfPromedio: number[];
  canonTramos: BCCanonYearBreakdown[][];
  fondoPromocion: number[];
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

// Rango de TIR considerado razonable: > -99% y < 10.000%. Fuera de él (o si el método no converge)
// la TIR se considera no calculable y calcIRR devuelve null (la UI muestra "N/A").
const IRR_MIN = -0.99;
const IRR_MAX = 100;

export function calcIRR(cfs: number[], guess = 0.3): number | null {
  const hasPos = cfs.some((f) => f > 0);
  const hasNeg = cfs.some((f) => f < 0);
  if (!hasPos || !hasNeg) return null;

  // 1) Newton-Raphson (igual que antes): solo se acepta si converge y cae dentro del rango razonable.
  let r = guess;
  let converged = false;
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
    if (Math.abs(delta) < 1e-8) { converged = true; break; }
  }
  if (converged && Number.isFinite(r) && r > IRR_MIN && r < IRR_MAX) return r;

  // 2) Respaldo: bisección sobre [IRR_MIN, IRR_MAX]. Solo hay raíz garantizada si el VAN cambia de signo
  // en los extremos; si no (p. ej. flujos que nunca recuperan la inversión), no hay TIR calculable.
  let lo = IRR_MIN, hi = IRR_MAX;
  let npvLo = calcNPV(cfs, lo);
  const npvHi = calcNPV(cfs, hi);
  if (!Number.isFinite(npvLo) || !Number.isFinite(npvHi) || npvLo * npvHi > 0) return null;
  for (let iter = 0; iter < 200 && hi - lo > 1e-12; iter++) {
    const mid = (lo + hi) / 2;
    const npvMid = calcNPV(cfs, mid);
    if (npvMid === 0) return mid;
    if (npvLo * npvMid < 0) hi = mid;
    else { lo = mid; npvLo = npvMid; }
  }
  const root = (lo + hi) / 2;
  return Number.isFinite(root) ? root : null;
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

export function ocupPctFromVenta(formato: FormatoLocal, ventaMesY1: number): number {
  if (!ventaMesY1 || ventaMesY1 <= 0) return 0;
  return round((OCUPACION_TARGET_MM[formato] / ventaMesY1) * 100, 2);
}

/** % informativo de ocupación: monto fijo (MM/mes) sobre la Venta Año 1 (MM/mes). */
export function ocupPctFromMonto(montoMesMM: number, ventaMesY1: number): number {
  if (!ventaMesY1 || ventaMesY1 <= 0) return 0;
  return round((montoMesMM / ventaMesY1) * 100, 2);
}

/**
 * Monto fijo de ocupación (MM CLP/mes, año 1) de un Business Case. Si el caso ya
 * lo trae (ocupMesMM), se usa tal cual. Los casos guardados ANTES de este modelo
 * no lo tienen y solo traen el %: si ese % es el que se calibraba solo (igual a
 * objetivo ÷ Venta Año 1) se vuelve al objetivo exacto del formato (1,5 / 1,2);
 * si alguien lo editó a mano, se respeta (% × Venta Año 1). Única fuente de
 * verdad: la usan computeBC, fullTermProjection, los exports y el hook.
 */
export function resolveOcupMesMM(inputs: Pick<BCInputs, "ocupMesMM" | "ocupPct" | "formato" | "ventaMes">): number {
  const stored = inputs.ocupMesMM;
  if (typeof stored === "number" && Number.isFinite(stored) && stored >= 0) return stored;
  const formato: FormatoLocal = inputs.formato && inputs.formato in OCUPACION_TARGET_MM ? inputs.formato : "Tradicional";
  const venta0 = inputs.ventaMes?.[0] ?? 0;
  const pct = inputs.ocupPct ?? 0;
  if (Math.abs(pct - ocupPctFromVenta(formato, venta0)) < 0.0051) return OCUPACION_TARGET_MM[formato];
  return round((pct / 100) * venta0, 4);
}

/** Deja ocupMesMM resuelto y el % informativo consistente con la Venta Año 1 vigente. */
export function syncOcupFields<T extends Pick<BCInputs, "ocupMesMM" | "ocupPct" | "formato" | "ventaMes">>(inputs: T): T {
  const ocupMesMM = resolveOcupMesMM(inputs);
  return { ...inputs, ocupMesMM, ocupPct: ocupPctFromMonto(ocupMesMM, inputs.ventaMes?.[0] ?? 0) };
}

// ---------- tramos de canon (escalonamiento) ----------
export interface BCCanonTier {
  fromMonth: number; // mes ABSOLUTO desde effective_date (mismo criterio que rent_escalations.month_number)
  ufM2: number;
  totalUf: number;
}

/**
 * Tramos de canon del contrato: el tramo base (superficie × ufM2, vigente
 * desde que empieza a pagarse renta = graciaMeses+1) más cada escalación de
 * inputs.escalations, en el mismo orden en que se aplican. Única fuente de
 * verdad para el canon escalonado — la usan tanto computeBC (TIR/VAN/EBITDA)
 * como la UI (para mostrar el desglose). Mismo criterio de UF/m² vs. monto
 * fijo que "Canon Actual" en CommercialConditionsSummary.tsx.
 */
export function resolveCanonTiers(
  inputs: Pick<BCInputs, "superficie" | "ufM2" | "escalations" | "regimeRentIsUfM2" | "graciaMeses">,
): BCCanonTier[] {
  const superficie = inputs.superficie || 0;
  const baseTotal = round(superficie * (inputs.ufM2 || 0), 2);
  const tiers: BCCanonTier[] = [
    { fromMonth: (inputs.graciaMeses || 0) + 1, ufM2: inputs.ufM2 || 0, totalUf: baseTotal },
  ];
  const sortedEsc = (inputs.escalations || []).slice().sort((a, b) => a.monthNumber - b.monthNumber);
  for (const esc of sortedEsc) {
    const needsMultiply = esc.isUfM2 || (inputs.regimeRentIsUfM2 && !esc.isUfM2);
    const totalUf = needsMultiply && superficie > 0 ? round(esc.amount * superficie, 2) : round(esc.amount, 2);
    const ufM2 = superficie > 0 ? round(totalUf / superficie, 4) : 0;
    tiers.push({ fromMonth: esc.monthNumber, ufM2, totalUf });
  }
  return tiers.sort((a, b) => a.fromMonth - b.fromMonth);
}

/**
 * Canon UF/m² promedio a lo largo de TODA la duración del contrato,
 * ponderado por los meses que dura cada tramo (sin escalonamiento, da
 * exactamente ufM2 — un solo tramo cubre todo el contrato). Solo considera
 * el arriendo (los tramos de resolveCanonTiers): gasto común, fondo de
 * promoción y otros cobros no entran acá, tienen sus propios campos. Se usa
 * para mostrar en "Supuestos" un UF/m² representativo cuando hay
 * escalonamiento, en vez de solo el tramo inicial.
 */
export function averageCanonUfM2(
  inputs: Pick<BCInputs, "superficie" | "ufM2" | "escalations" | "regimeRentIsUfM2" | "graciaMeses" | "durContratoAnios">,
): number {
  const tiers = resolveCanonTiers(inputs);
  const totalMonths = Math.round((inputs.durContratoAnios || 0) * 12);
  if (tiers.length <= 1 || totalMonths <= 0) return inputs.ufM2 || 0;
  let weightedSum = 0;
  let coveredMonths = 0;
  for (let i = 0; i < tiers.length; i++) {
    const start = tiers[i].fromMonth;
    if (start > totalMonths) break;
    const end = i < tiers.length - 1 ? Math.min(tiers[i + 1].fromMonth - 1, totalMonths) : totalMonths;
    const months = end - start + 1;
    if (months <= 0) continue;
    weightedSum += tiers[i].ufM2 * months;
    coveredMonths += months;
  }
  return coveredMonths > 0 ? weightedSum / coveredMonths : inputs.ufM2 || 0;
}

/**
 * Depreciación lineal del CAPEX físico por año (montos positivos, índice 0 = año 0 = 0).
 * Se deprecia fisica / deprAnos por año DURANTE deprAnos años y 0 después (si
 * deprAnos no es entero, el último año es proporcional: 2,5 años → 1, 1 y 0,5).
 * Antes se depreciaba el mismo monto todos los años del horizonte aunque
 * deprAnos fuera menor (ej. 3 años en un horizonte de 5), lo que seguía
 * generando escudo tributario y sobrestimaba EBIT/flujo/TIR/VAN de los años
 * posteriores. Única fuente de verdad: la usan computeBC y fullTermProjection.
 */
export function depreciationSchedule(fisica: number, deprAnos: number, years: number): number[] {
  const n = deprAnos > 0 ? deprAnos : 1;
  const annual = fisica / n;
  const out = [0];
  for (let i = 1; i <= years; i++) {
    const frac = Math.max(0, Math.min(1, n - (i - 1)));
    out.push(round(annual * frac, 2));
  }
  return out;
}

// ---------- cálculo principal (réplica de recalcAll del HTML) ----------
export function computeBC(inputs: BCInputs, admin: AdminConfig = defaultAdminConfig): BCResult {
  const superficie = inputs.superficie || 0;
  const ufM2 = inputs.ufM2 || 0;
  const ufBase = inputs.ufBase || 39485.65;
  const { starts, avgs } = calcUF(ufBase, inputs.ufRates);

  // Contrato derivado
  const gracia = inputs.graciaMeses || 0;

  // Canon con escalonamiento: los tramos de resolveCanonTiers están en mes
  // ABSOLUTO desde effective_date (igual que rent_escalations.month_number),
  // por eso hay que sumarle la gracia para comparar con el "mes de renta" del
  // BC (que cuenta desde el inicio de pago de canon = inicio + gracia).
  const canonTiers = resolveCanonTiers(inputs);
  const canonUfForLeaseMonth = (leaseMonth: number): number => {
    const mesAbsoluto = leaseMonth + gracia;
    let v = canonTiers[0]?.totalUf ?? 0;
    for (const t of canonTiers) {
      if (t.fromMonth > mesAbsoluto) break;
      v = t.totalUf;
    }
    return v;
  };
  const canonUF = canonUfForLeaseMonth(1);
  const garantiaUF = canonUF;
  // Meses que quedan del año calendario contando el mes de la fecha dada:
  // diciembre → 1, agosto → 5, enero → 12.
  const mesesHastaFinDeAno = (iso: string): number => {
    const d = new Date(iso + "T00:00:00");
    if (Number.isNaN(d.getTime())) return 12;
    return Math.min(12, Math.max(0, 12 - d.getMonth()));
  };

  // Igual que mesesHastaFinDeAno, pero prorrateando el mes en que cae la fecha
  // según el día: si la renta empieza a mitad de mes, ese mes no se cobra
  // completo. Ej.: fin de gracia el 10 de noviembre → se cobra (30-10+1)/30 de
  // noviembre + diciembre completo = 1,7 meses (no 2, que es lo que daba
  // mesesHastaFinDeAno al mirar solo el mes e ignorar el día). El caso del
  // día 1 da exactamente el mismo resultado que la versión sin prorratear
  // ((30-1+1)/30 = 1), así que no cambia nada para el caso más común.
  const mesesProporcionalesHastaFinDeAno = (iso: string): number => {
    const d = new Date(iso + "T00:00:00");
    if (Number.isNaN(d.getTime())) return 12;
    const mes = d.getMonth();
    const dia = d.getDate();
    const diasDelMes = new Date(d.getFullYear(), mes + 1, 0).getDate();
    const fraccionPrimerMes = Math.max(0, Math.min(1, (diasDelMes - dia + 1) / diasDelMes));
    const mesesCompletosRestantes = Math.max(0, 11 - mes);
    return Math.min(12, fraccionPrimerMes + mesesCompletosRestantes);
  };

  // Meses de RENTA del año 1: desde el inicio de pago de canon (inicio + gracia).
  let dtCanonIso = inputs.inicio || "";
  if (inputs.inicio) {
    const dtCanon = new Date(inputs.inicio + "T00:00:00");
    dtCanon.setMonth(dtCanon.getMonth() + gracia);
    dtCanonIso = dtCanon.toISOString().slice(0, 10);
  }
  const mesesY1 = dtCanonIso ? mesesProporcionalesHastaFinDeAno(dtCanonIso) : 3;
  const mesesArr = [0, mesesY1, 12, 12, 12, 12];

  // Meses de OPERACIÓN de cada año calendario (desde la apertura al público) y
  // meses de PERSONAL del año 1 (empieza un mes antes de abrir). Son
  // calendarios distintos al de la renta: un local puede abrir antes o
  // después de empezar a pagar canon. Si no hay fecha de apertura cargada, se
  // asume el inicio de pago de renta.
  const aperturaIso = inputs.apertura || dtCanonIso;
  const anoRenta = dtCanonIso ? new Date(dtCanonIso + "T00:00:00").getFullYear() : 0;
  const dApertura = new Date(aperturaIso + "T00:00:00");
  const anoApertura = Number.isNaN(dApertura.getTime()) ? anoRenta : dApertura.getFullYear();
  // Meses de operación de CADA año calendario 1..5, no solo del año 1: si ese
  // año calendario es anterior al de apertura no opera, si es el de apertura
  // opera desde ese mes hasta fin de año, y si es posterior opera los 12
  // meses completos.
  const mesesOperArr = [0, 0, 0, 0, 0, 0];
  for (let i = 1; i <= 5; i++) {
    const anoCalendario = anoRenta + i - 1;
    mesesOperArr[i] =
      anoCalendario < anoApertura ? 0 : anoCalendario > anoApertura ? 12 : mesesHastaFinDeAno(aperturaIso);
  }
  const mesesOperacion = mesesOperArr[1];
  const mesesPersonal = Math.min(12, mesesOperacion + 1);

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

  // Canon y gasto común (MM CLP) — año 0 = 0; años 1..5 con UF promedio del año
  // anterior. gastoComunUf viene en UF/m² (mismo criterio que ufM2 para el
  // canon), así que hay que multiplicarlo por la superficie — antes no se
  // hacía y un gasto común de 0,05 UF/m² quedaba prácticamente en cero en vez
  // de multiplicarse por los m² del local.
  const gcomUF = inputs.gastoComunUf || 0;
  // canonArr por año: promedio del canon UF mes a mes (según los tramos de
  // escalonamiento) dentro de ese año-modelo, multiplicado por los meses del
  // año y la UF promedio del año anterior — mismo criterio de conversión a
  // CLP que antes. Solo el año 1 (mesesY1) puede ser fraccionario (proración
  // de día de inicio); para el lookup de tramo se redondea a meses enteros,
  // preservando el "m" exacto para la conversión a CLP. Sin escalaciones el
  // resultado es idéntico al cálculo anterior (canonUF constante).
  // Fondo de Promoción: % del canon (fondo_promocion_percentage del contrato,
  // mismo campo que alimenta la columna "F.Prom" de rentPeriods.ts) — sigue el
  // mismo canon escalonado que canonArr, así que se derivan del mismo
  // promedio mensual en vez de recorrer los tramos dos veces.
  const fondoPromPct = (inputs.fondoPromocionPct || 0) / 100;
  // canonTramos: por año, los tramos de canon que efectivamente cayeron
  // dentro de ese año-modelo (meses consecutivos al mismo UF/mes), agrupados
  // para poder mostrar "X meses a Y UF/mes" en el detalle de cálculo de la UI
  // (botón "ver cálculo" en Proyecciones) sin recorrer los tramos de nuevo ahí.
  let mesRentaCursor = 0;
  const canonTramos: BCCanonYearBreakdown[][] = [];
  const canonUfPromedioArr = mesesArr.map((m, i) => {
    if (i === 0 || m <= 0) { canonTramos.push([]); return 0; }
    const mesesEnteros = Math.max(1, Math.round(m));
    let sumaUf = 0;
    const segmentos: BCCanonYearBreakdown[] = [];
    for (let k = 1; k <= mesesEnteros; k++) {
      const v = canonUfForLeaseMonth(mesRentaCursor + k);
      sumaUf += v;
      const last = segmentos[segmentos.length - 1];
      if (last && last.ufMes === v) last.meses += 1;
      else segmentos.push({ meses: 1, ufMes: v });
    }
    mesRentaCursor += mesesEnteros;
    canonTramos.push(segmentos);
    return sumaUf / mesesEnteros;
  });
  const canonArr = canonUfPromedioArr.map((canonUfPromedio, i) =>
    i === 0 ? 0 : round(-canonUfPromedio * mesesArr[i] * avgs[i - 1] / 1e6, 4),
  );
  const fondoPromocion = canonUfPromedioArr.map((canonUfPromedio, i) =>
    i === 0 ? 0 : round(-canonUfPromedio * fondoPromPct * mesesArr[i] * avgs[i - 1] / 1e6, 4),
  );
  const gastoComun = mesesArr.map((m, i) => (i === 0 ? 0 : round(-gcomUF * superficie * m * avgs[i - 1] / 1e6, 4)));

  // Ventas
  const sf = inputs.scenario === "opt" ? 1.1 : inputs.scenario === "cons" ? 0.85 : 1.0;
  const v = inputs.ventaMes || [];
  // ventaMes[k] es la tasa mensual del AÑO DE VIDA k+1 del local (de
  // maduración: recién abierto → régimen), no del año calendario. Como el
  // local no necesariamente abre el 1 de enero, un año calendario de
  // operación puede mezclar el tramo final de un año de vida con el tramo
  // inicial del siguiente — si eso no se reparte mes a mes, un año calendario
  // completo queda valorizado de golpe a la tasa del año de vida más nuevo
  // (más alta), inflando ingresos y, en cascada, EBITDA/TIR/VAN.
  const ventaVida = [v[0] ?? 60, v[1] ?? 80, v[2] ?? 90, v[3] ?? 95, v[4] ?? 99.75];
  const tasaVida = (anoVidaIdx: number) => ventaVida[Math.min(Math.max(anoVidaIdx, 0), 4)];
  let vidaAcumulada = 0; // meses de vida transcurridos al cierre del último año calendario procesado
  const ingresos = [0];
  // ingresosTramos: por año, los 1-2 tramos de "año de vida" que lo componen
  // (mismo detalle que la fórmula de arriba) — para poder mostrar "X meses ×
  // Y MM/mes" en el detalle de cálculo de la UI (botón "ver cálculo" en
  // Proyecciones) sin recorrer la lógica de vidaAcumulada otra vez ahí.
  const ingresosTramos: { anoVida: number; meses: number; tasa: number }[][] = [[]];
  for (let i = 1; i <= 5; i++) {
    const meses = mesesOperArr[i];
    if (meses <= 0) { ingresos.push(0); ingresosTramos.push([]); continue; }
    const anoVidaInicio = Math.floor(vidaAcumulada / 12);
    const mesesRestantesAnoVida = (anoVidaInicio + 1) * 12 - vidaAcumulada;
    const tramos: { anoVida: number; meses: number; tasa: number }[] = [];
    let ing: number;
    if (meses <= mesesRestantesAnoVida) {
      ing = tasaVida(anoVidaInicio) * meses;
      tramos.push({ anoVida: anoVidaInicio + 1, meses, tasa: tasaVida(anoVidaInicio) });
    } else {
      ing = tasaVida(anoVidaInicio) * mesesRestantesAnoVida + tasaVida(anoVidaInicio + 1) * (meses - mesesRestantesAnoVida);
      tramos.push({ anoVida: anoVidaInicio + 1, meses: mesesRestantesAnoVida, tasa: tasaVida(anoVidaInicio) });
      tramos.push({ anoVida: anoVidaInicio + 2, meses: meses - mesesRestantesAnoVida, tasa: tasaVida(anoVidaInicio + 1) });
    }
    ingresos.push(round(ing * sf, 2));
    ingresosTramos.push(tramos);
    vidaAcumulada += meses;
  }

  // Márgenes
  const mDir = (inputs.margenDir || 0) / 100;
  const oDir = (inputs.otrosCostosDir || 0) / 100;
  const cVar = (inputs.costosVar || 0) / 100;
  const costoVentas = ingresos.map((x) => round(-x * (1 - mDir), 2));
  const otrosCostos = ingresos.map((x) => round(-x * oDir, 2));
  const costosVar = ingresos.map((x) => round(-x * cVar, 2));
  const margenCtrib = ingresos.map((x, i) => round(x + costoVentas[i] + otrosCostos[i] + costosVar[i], 2));

  // Costos
  // Personal — mismo modelo que la planilla oficial del business case:
  //   · Año 1: se prorratea por los meses de personal (= meses de operación + 1,
  //     porque se contrata un mes antes de abrir), no se cobra el año completo.
  //   · Años 2..5: costo base × 12 reajustado por la variación de UF del año
  //     anterior, SIN acumular año contra año.
  // costoPersonaMM viene en MM CLP/año → /12 para dejarlo mensual.
  const personalMensual = ((inputs.personalY1 || 0) * (inputs.costoPersonaMM || 0)) / 12;
  const personal = [0, -round(personalMensual * mesesPersonal, 2)];
  for (let i = 2; i < 6; i++) {
    const ufPrev = starts[i - 2] || 0;
    const ufCur = starts[i - 1] || 0;
    const varUf = ufCur ? (ufCur - ufPrev) / ufCur : 0; // = (Cn-Cn-1)/Cn de la planilla
    personal.push(-round(personalMensual * 12 * (1 + varUf), 2));
  }
  const gralPct = (inputs.gralPct || 0) / 100;
  const tecPct = (inputs.tecPct || 0) / 100;
  const publicidad = [0, 0, 0, 0, 0, 0];
  const gastosGral = ingresos.map((x) => round(-Math.abs(x) * gralPct, 2));
  const tecnologia = ingresos.map((x) => round(-Math.abs(x) * tecPct, 2));
  // Ocupación: monto FIJO por mes de operación (no depende de las ventas) y, desde
  // el año 2, reajustado por inflación = UF promedio del año / UF promedio del año 1
  // (misma UF que el canon). Año 1 = ocupMesMM × meses de operación.
  const ocupMesMM = resolveOcupMesMM(inputs);
  const ocupacion = [0, 1, 2, 3, 4, 5].map((i) =>
    i === 0 ? 0 : round(-ocupMesMM * mesesOperArr[i] * (avgs[0] ? avgs[i - 1] / avgs[0] : 1), 2),
  );

  // CAPEX depreciable = inversión física (excluye inventario y garantía), se lee desde Inversión
  // Depreciación por año: fisica/deprAnos durante deprAnos años, 0 después.
  const deprSched = depreciationSchedule(fisica, inputs.deprAnos || 1, 5);
  const depreciacion = deprSched.map((d) => (d === 0 ? 0 : -d));

  const gavs = [0, 1, 2, 3, 4, 5].map((i) =>
    round(
      personal[i] + publicidad[i] + gastosGral[i] + tecnologia[i] + ocupacion[i] + canonArr[i] + fondoPromocion[i] + gastoComun[i],
      2,
    ),
  );
  const ebitda = ingresos.map((_, i) => round(margenCtrib[i] + gavs[i], 2));
  const ebit = ebitda.map((x, i) => round(x + depreciacion[i], 2));
  const taxRate = (inputs.taxRate || 0) / 100;
  const impuesto = ebit.map((x) => round(-x * taxRate, 2));
  const udi = ebit.map((x) => round(x * (1 - taxRate), 2));
  const ros = ebit.map((x, i) => (ingresos[i] ? x / ingresos[i] : 0));

  const capex = [-totalCapex, 0, 0, 0, 0, 0];
  const flujoOp = udi.map((x, i) => (i === 0 ? -totalCapex : round(x + deprSched[i], 2)));
  const payback = [flujoOp[0]];
  for (let i = 1; i < 6; i++) payback.push(round(payback[i - 1] + flujoOp[i], 2));

  const tir = calcIRR(flujoOp);
  const van = round(calcNPV(flujoOp, (inputs.waccRate || 0) / 100), 1);
  const paybackAnio = payback.findIndex((x) => x >= 0);
  const ebitdaMargin5 = ingresos[5] ? ebitda[5] / ingresos[5] : 0;

  return {
    canonUF, garantiaUF, mesesY1, mesesArr, mesesOperacion, mesesPersonal, anoApertura, anoRenta,
    ufStarts: starts, ufAvgs: avgs,
    inv: { rows: invRows, total, fisica, kt },
    ingresos, ingresosTramos, scenarioFactor: sf, costoVentas, otrosCostos, costosVar, margenCtrib,
    personal, publicidad, gastosGral, tecnologia, ocupacion, canonArr,
    canonUfPromedio: canonUfPromedioArr, canonTramos,
    fondoPromocion, gastoComun,
    gavs, ebitda, depreciacion, ebit, impuesto, udi, ros, capex, flujoOp, payback,
    totalCapex, tir, van, paybackAnio, ebitdaMargin5,
  };
}

// ---------- defaults / prefill desde el contrato ----------
// id presente = tramo real de rent_escalations (permite sincronizar ediciones
// de monto de vuelta al contrato); ausente en escalations sin persistir aún.
export interface BCEscalation { id?: string; monthNumber: number; amount: number; isUfM2: boolean }

export interface BCSeed {
  nombre?: string; direccion?: string; comuna?: string; tipo?: string;
  superficie?: number | null; ufM2?: number | null; gastoComunUf?: number | null;
  durContratoAnios?: number | null; inicio?: string | null; ufBase?: number;
  graciaMeses?: number | null;
  // Metadatos para la sincronización bidireccional Business Case ↔ Contrato:
  // al abrir, estos campos siempre reflejan el contrato (no lo guardado en
  // el BC); al editarlos en el BC, se escriben de vuelta al contrato/versión.
  contractVersionId?: string;
  rentField?: "initial_rent" | "regime_rent";
  rentIsUfM2?: boolean;
  gastoComunSyncable?: boolean; // true solo si la metodología de gasto común es "uf_m2"
  // Tramos de arriendo escalonado (solo lectura: siempre reflejan el contrato,
  // no son editables desde el BC ni se sincronizan de vuelta). Ver computeBC.
  escalations?: BCEscalation[] | null;
  regimeRentIsUfM2?: boolean;
  fondoPromocionPct?: number | null;
  // Desglose "Arriendo por periodo" (Canon+GGCC+F.Prom+Otros=Total por tramo),
  // igual al que muestra la ficha del contrato. Solo para mostrar — no
  // participa del cálculo de TIR/VAN (que usa escalations vía resolveCanonTiers).
  contractPeriods?: import("./rentPeriods").RentPeriodRow[];
}

export function buildDefaultBCInputs(seed: BCSeed = {}, admin: AdminConfig = defaultAdminConfig): BCInputs {
  const tipo = seed.tipo && admin.tiposProyecto.includes(seed.tipo) ? seed.tipo : admin.tiposProyecto[0];
  const d = admin.defaultsPorTipo[tipo] ?? { margenDir: 53, personalY1: 26, anosDepr: 3 };
  return {
    nombre: seed.nombre ?? "",
    direccion: seed.direccion ?? "",
    comuna: seed.comuna ?? "",
    tipo,
    formato: "Tradicional",
    categoria: admin.categorias[0],
    descripcion: "",
    superficie: seed.superficie ?? 0,
    ufM2: seed.ufM2 ?? 0.375,
    escalations: seed.escalations ?? [],
    regimeRentIsUfM2: seed.regimeRentIsUfM2 ?? false,
    fondoPromocionPct: seed.fondoPromocionPct ?? 0,
    graciaMeses: 2,
    durContratoAnios: seed.durContratoAnios ?? 10,
    inicio: seed.inicio ?? new Date().toISOString().slice(0, 10),
    apertura: "", // vacío = se asume el inicio de pago de renta (inicio + gracia)
    gastoComunUf: seed.gastoComunUf ?? 0,
    ufBase: seed.ufBase ?? 39485.65,
    ufRates: [3.8, 3.3, 3.0, 3.0, 3.0],
    ventaGrowthPct: [3.8, 3.3, 3.0, 3.0, 3.0],
    waccRate: 12,
    taxRate: 27,
    scenario: "base",
    ventaMes: [60, 80, 90, 95, 99.75],
    margenDir: d.margenDir,
    otrosCostosDir: 0.3,
    costosVar: 5,
    // Dotación inicial: la del formato por defecto (Tradicional). El default por
    // tipo de proyecto sigue rigiendo margen y años de depreciación.
    personalY1: FORMATO_PRESETS.Tradicional.personalY1,
    costoPersonaMM: 9.6, // ~$800k CLP/mes por persona (costo empresa)
    personalCrec: 3.4,
    gralPct: 1.03,
    tecPct: 1.8,
    ocupPct: ocupPctFromMonto(OCUPACION_TARGET_MM.Tradicional, 60), // informativo; 60 = ventaMes[0] de abajo
    ocupMesMM: OCUPACION_TARGET_MM.Tradicional,
    capexDepreciable: 155,
    deprAnos: d.anosDepr,
    invOverrides: {},
  };
}
