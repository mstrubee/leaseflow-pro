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
  ufM2: number; // UF/m² (canon = superficie × ufM2)
  graciaMeses: number;
  durContratoAnios: number;
  inicio: string; // ISO date (entrega/inicio)
  /** ISO date del mes de apertura al público. Puede diferir del inicio de pago
   *  de renta (inicio + gracia). Define los meses de operación del año 1
   *  (ingresos) y, un mes antes, el inicio del pago de personal.
   *  Si viene vacío se asume el inicio de pago de renta. */
  apertura: string;
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
  personalY1: number; // N° de personas del equipo en el año 1
  costoPersonaMM: number; // costo total por persona (MM CLP / año)
  personalCrec: number; // %
  gralPct: number;
  tecPct: number;
  ocupPct: number;

  // Depreciación (la base depreciable se lee desde la Inversión física)
  capexDepreciable: number; // DEPRECADO: ya no se usa (se calcula desde inv.fisica)
  deprAnos: number;

  // Inversión: overrides por línea (MM CLP) { lineaId: monto }
  invOverrides: Record<string, number>;
}

export interface BCInvRow { id: string; nombre: string; metodo: InvMethod; monto: number; pct: number; nota?: string }

export interface BCResult {
  canonUF: number;
  garantiaUF: number;
  mesesY1: number; // meses de RENTA del año 1 (desde inicio + gracia)
  mesesArr: number[]; // [0, mesesY1, 12,12,12,12]
  mesesOperacion: number; // meses de OPERACIÓN del año 1 (desde la apertura) → ingresos
  mesesPersonal: number; // meses de PERSONAL del año 1 (= operación + 1, se contrata antes)
  anoApertura: number; // año calendario de apertura al público = "Año 1" real (primer año que efectivamente se vende)
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
  const canonArr = mesesArr.map((m, i) => (i === 0 ? 0 : round(-canonUF * m * avgs[i - 1] / 1e6, 4)));
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
  for (let i = 1; i <= 5; i++) {
    const meses = mesesOperArr[i];
    if (meses <= 0) { ingresos.push(0); continue; }
    const anoVidaInicio = Math.floor(vidaAcumulada / 12);
    const mesesRestantesAnoVida = (anoVidaInicio + 1) * 12 - vidaAcumulada;
    const ing =
      meses <= mesesRestantesAnoVida
        ? tasaVida(anoVidaInicio) * meses
        : tasaVida(anoVidaInicio) * mesesRestantesAnoVida + tasaVida(anoVidaInicio + 1) * (meses - mesesRestantesAnoVida);
    ingresos.push(round(ing * sf, 2));
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
  const ocupPct = (inputs.ocupPct || 0) / 100;
  const publicidad = [0, 0, 0, 0, 0, 0];
  const gastosGral = ingresos.map((x) => round(-Math.abs(x) * gralPct, 2));
  const tecnologia = ingresos.map((x) => round(-Math.abs(x) * tecPct, 2));
  const ocupacion = ingresos.map((x) => round(-Math.abs(x) * ocupPct, 2));

  // CAPEX depreciable = inversión física (excluye inventario y garantía), se lee desde Inversión
  const depr = round(fisica / (inputs.deprAnos || 1), 2);
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
    canonUF, garantiaUF, mesesY1, mesesArr, mesesOperacion, mesesPersonal, anoApertura,
    ufStarts: starts, ufAvgs: avgs,
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
  // Metadatos para la sincronización bidireccional Business Case ↔ Contrato:
  // al abrir, estos 5 campos siempre reflejan el contrato (no lo guardado en
  // el BC); al editarlos en el BC, se escriben de vuelta al contrato/versión.
  contractVersionId?: string;
  rentField?: "initial_rent" | "regime_rent";
  rentIsUfM2?: boolean;
  gastoComunSyncable?: boolean; // true solo si la metodología de gasto común es "uf_m2"
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
    graciaMeses: 2,
    durContratoAnios: seed.durContratoAnios ?? 10,
    inicio: seed.inicio ?? new Date().toISOString().slice(0, 10),
    apertura: "", // vacío = se asume el inicio de pago de renta (inicio + gracia)
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
    // Dotación inicial: la del formato por defecto (Tradicional). El default por
    // tipo de proyecto sigue rigiendo margen y años de depreciación.
    personalY1: FORMATO_PRESETS.Tradicional.personalY1,
    costoPersonaMM: 9.6, // ~$800k CLP/mes por persona (costo empresa)
    personalCrec: 3.4,
    gralPct: 1.03,
    tecPct: 1.8,
    ocupPct: 1.28,
    capexDepreciable: 155,
    deprAnos: d.anosDepr,
    invOverrides: {},
  };
}
