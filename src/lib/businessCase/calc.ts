// Business Case financiero — motor de cálculo (réplica del modelo Excel "Tipo.xlsx")
// Todas las cifras monetarias del P&L están en MM CLP (millones de pesos).

export const BC_HORIZON = 5; // años proyectados (1..5)

export interface BusinessCaseInputs {
  // Ficha / Resumen comercial
  nombre: string;
  direccion: string;
  comuna: string;
  empresa: string;
  tipo: string; // Autoplanet / Agroplanet / etc.

  // Físico / contrato
  superficieM2: number;
  valorUfM2: number; // UF por m2 (canon = superficie * valorUfM2 si canonUf = 0)
  canonUf: number; // UF / mes
  gastoComunUf: number; // UF / mes
  plazoAnios: number;
  garantiaUf: number;
  fechaEntrega: string; // ISO date (entrega del local)
  graciaMeses: number; // periodo de gracia / habilitación

  // Económico
  ufActual: number; // valor UF CLP de referencia
  ufCrecimientoAnual: number; // ej 0.034
  tasaDescuento: number; // ej 0.12
  impuestoPct: number; // ej 0.27

  // Inversiones (CLP absolutos)
  invHabilitacion: number;
  invMobiliario: number;
  invInventario: number;
  invTecnologia: number;
  invMarketing: number;
  depreciacionAnualMM: number; // MM CLP / año

  // Operación (arrays por año, largo = BC_HORIZON)
  ventaMesMM: number[]; // venta/mes en MM CLP por año
  margenDirectoPct: number; // ej 0.53
  otrosCostosDirectosPct: number; // ej 0.003
  costosVariablesPct: number; // ej 0.05
  tecnologiaPctVentas: number; // ej 0.018
  ocupacionPctVentas: number; // ej 0.0128

  // GAVs en MM CLP por año (editables celda a celda)
  gastoPersonalMM: number[];
  publicidadMM: number[];
  gastosGeneralesMM: number[];

  // Capital de trabajo (MM CLP) — típicamente el inventario
  capitalTrabajoMM: number;

  // Filas adicionales definidas por el admin (gastos extra, MM CLP por año)
  customRows: { label: string; valuesMM: number[] }[];
}

export interface BusinessCaseYear {
  year: number; // año calendario
  mesesOperativos: number;
  ufAnio: number;
  ingresos: number;
  costoVentas: number;
  otrosCostosDirectos: number;
  costosVariables: number;
  margenContribucion: number;
  margenContribucionPct: number;
  gastoPersonal: number;
  publicidad: number;
  gastosGenerales: number;
  tecnologia: number;
  ocupacion: number;
  canon: number;
  gastoComun: number;
  customTotal: number;
  gavs: number;
  ebitda: number;
  ebitdaPct: number;
  depreciacion: number;
  ebit: number;
  rosPct: number;
  impuesto: number;
  udi: number;
  flujoOperativo: number;
  flujoAcumulado: number;
}

export interface BusinessCaseResult {
  capexInicial: number; // MM CLP (negativo)
  inversionTotal: number; // MM CLP (positivo)
  canonUfMensual: number;
  garantiaUf: number;
  years: BusinessCaseYear[];
  flujos: number[]; // [capex, flujo1..N]
  tir: number | null; // fracción (0.47 = 47%)
  van: number; // MM CLP
  paybackAnio: number | null; // año calendario donde se recupera
  paybackAnios: number | null; // número de años (interpolado)
  rentabilidadEstable: number; // ROS último año
}

// ---------- helpers financieros ----------

export function npv(rate: number, flows: number[]): number {
  // flows[0] = año 0
  return flows.reduce((acc, f, i) => acc + f / Math.pow(1 + rate, i), 0);
}

export function irr(flows: number[]): number | null {
  // Requiere al menos un cambio de signo
  const hasPos = flows.some((f) => f > 0);
  const hasNeg = flows.some((f) => f < 0);
  if (!hasPos || !hasNeg) return null;

  let low = -0.9;
  let high = 10;
  let fLow = npv(low, flows);
  let fHigh = npv(high, flows);
  if (fLow * fHigh > 0) return null;

  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    const fMid = npv(mid, flows);
    if (Math.abs(fMid) < 1e-7) return mid;
    if (fLow * fMid < 0) {
      high = mid;
      fHigh = fMid;
    } else {
      low = mid;
      fLow = fMid;
    }
  }
  return (low + high) / 2;
}

function arr(a: number[] | undefined, n: number, fill = 0): number[] {
  const out = (a ?? []).slice(0, n);
  while (out.length < n) out.push(fill);
  return out.map((v) => (Number.isFinite(v) ? v : 0));
}

// ---------- cálculo principal ----------

export function computeBusinessCase(inputs: BusinessCaseInputs): BusinessCaseResult {
  const n = BC_HORIZON;
  const entrega = inputs.fechaEntrega ? new Date(inputs.fechaEntrega) : new Date();
  const apertura = new Date(entrega);
  apertura.setMonth(apertura.getMonth() + (inputs.graciaMeses || 0));

  const firstYear = apertura.getFullYear();
  const aperturaMonthIdx = apertura.getMonth(); // 0-based

  const canonUf = inputs.canonUf && inputs.canonUf > 0
    ? inputs.canonUf
    : (inputs.superficieM2 || 0) * (inputs.valorUfM2 || 0);

  const ventaMes = arr(inputs.ventaMesMM, n);
  const personal = arr(inputs.gastoPersonalMM, n);
  const publicidad = arr(inputs.publicidadMM, n);
  const generales = arr(inputs.gastosGeneralesMM, n);
  const customRows = (inputs.customRows || []).map((r) => ({
    label: r.label,
    valuesMM: arr(r.valuesMM, n),
  }));

  const years: BusinessCaseYear[] = [];
  let acumulado = 0;

  for (let i = 0; i < n; i++) {
    const yearNum = firstYear + i;
    const meses = i === 0 ? Math.max(0, 12 - aperturaMonthIdx) : 12;
    const ufAnio = (inputs.ufActual || 0) * Math.pow(1 + (inputs.ufCrecimientoAnual || 0), i);

    const ingresos = ventaMes[i] * meses;
    const costoVentas = -ingresos * (1 - (inputs.margenDirectoPct || 0));
    const otrosCostosDirectos = -ingresos * (inputs.otrosCostosDirectosPct || 0);
    const costosVariables = -ingresos * (inputs.costosVariablesPct || 0);
    const margenContribucion = ingresos + costoVentas + otrosCostosDirectos + costosVariables;
    const margenContribucionPct = ingresos ? margenContribucion / ingresos : 0;

    const gastoPersonal = -Math.abs(personal[i]);
    const pub = -Math.abs(publicidad[i]);
    const gastosGenerales = -Math.abs(generales[i]);
    const tecnologia = -ingresos * (inputs.tecnologiaPctVentas || 0);
    const ocupacion = -ingresos * (inputs.ocupacionPctVentas || 0);
    const canon = -(canonUf * ufAnio * meses) / 1e6;
    const gastoComun = -((inputs.gastoComunUf || 0) * ufAnio * meses) / 1e6;
    const customTotal = customRows.reduce((s, r) => s - Math.abs(r.valuesMM[i]), 0);

    const gavs =
      gastoPersonal + pub + gastosGenerales + tecnologia + ocupacion + canon + gastoComun + customTotal;
    const ebitda = margenContribucion + gavs;
    const ebitdaPct = ingresos ? ebitda / ingresos : 0;
    const depreciacion = -Math.abs(inputs.depreciacionAnualMM || 0);
    const ebit = ebitda + depreciacion;
    const rosPct = ingresos ? ebit / ingresos : 0;
    const impuesto = ebit > 0 ? -ebit * (inputs.impuestoPct || 0) : 0;
    const udi = ebit + impuesto;
    const flujoOperativo = udi - depreciacion; // suma de vuelta la depreciación
    acumulado += flujoOperativo;

    years.push({
      year: yearNum,
      mesesOperativos: meses,
      ufAnio,
      ingresos,
      costoVentas,
      otrosCostosDirectos,
      costosVariables,
      margenContribucion,
      margenContribucionPct,
      gastoPersonal,
      publicidad: pub,
      gastosGenerales,
      tecnologia,
      ocupacion,
      canon,
      gastoComun,
      customTotal,
      gavs,
      ebitda,
      ebitdaPct,
      depreciacion,
      ebit,
      rosPct,
      impuesto,
      udi,
      flujoOperativo,
      flujoAcumulado: 0,
    });
  }

  const inversionTotalCLP =
    (inputs.invHabilitacion || 0) +
    (inputs.invMobiliario || 0) +
    (inputs.invInventario || 0) +
    (inputs.invTecnologia || 0) +
    (inputs.invMarketing || 0);
  const inversionTotalMM = inversionTotalCLP / 1e6;
  const capexInicial = -inversionTotalMM;

  const flujos = [capexInicial, ...years.map((y) => y.flujoOperativo)];

  // payback acumulado incluyendo año 0
  let cum = capexInicial;
  let paybackAnio: number | null = null;
  let paybackAnios: number | null = null;
  for (let i = 0; i < years.length; i++) {
    const prev = cum;
    cum += years[i].flujoOperativo;
    years[i].flujoAcumulado = cum;
    if (paybackAnio === null && cum >= 0) {
      paybackAnio = years[i].year;
      const fraction = years[i].flujoOperativo !== 0 ? -prev / years[i].flujoOperativo : 0;
      paybackAnios = i + Math.min(Math.max(fraction, 0), 1);
    }
  }

  const tir = irr(flujos);
  const van = npv(inputs.tasaDescuento || 0, flujos);
  const rentabilidadEstable = years.length ? years[years.length - 1].rosPct : 0;

  return {
    capexInicial,
    inversionTotal: inversionTotalMM,
    canonUfMensual: canonUf,
    garantiaUf: inputs.garantiaUf || 0,
    years,
    flujos,
    tir,
    van,
    paybackAnio,
    paybackAnios,
    rentabilidadEstable,
  };
}

// ---------- defaults / autollenado ----------

export interface ContractSeed {
  nombre?: string;
  direccion?: string;
  comuna?: string;
  empresa?: string;
  tipo?: string;
  superficieM2?: number | null;
  canonUf?: number | null;
  gastoComunUf?: number | null;
  plazoAnios?: number | null;
  garantiaUf?: number | null;
  fechaEntrega?: string | null;
  graciaMeses?: number | null;
  ufActual?: number;
}

export function buildDefaultInputs(seed: ContractSeed = {}): BusinessCaseInputs {
  const n = BC_HORIZON;
  return {
    nombre: seed.nombre ?? "",
    direccion: seed.direccion ?? "",
    comuna: seed.comuna ?? "",
    empresa: seed.empresa ?? "",
    tipo: seed.tipo ?? "Autoplanet",

    superficieM2: seed.superficieM2 ?? 0,
    valorUfM2: 0.375,
    canonUf: seed.canonUf ?? 0,
    gastoComunUf: seed.gastoComunUf ?? 0,
    plazoAnios: seed.plazoAnios ?? 10,
    garantiaUf: seed.garantiaUf ?? 0,
    fechaEntrega: seed.fechaEntrega ?? new Date().toISOString().slice(0, 10),
    graciaMeses: seed.graciaMeses ?? 2,

    ufActual: seed.ufActual ?? 39485,
    ufCrecimientoAnual: 0.034,
    tasaDescuento: 0.12,
    impuestoPct: 0.27,

    invHabilitacion: 125_000_000,
    invMobiliario: 30_000_000,
    invInventario: 100_000_000,
    invTecnologia: 10_000_000,
    invMarketing: 0,
    depreciacionAnualMM: 53,

    ventaMesMM: [60, 80, 90, 95, 99.75].slice(0, n),
    margenDirectoPct: 0.53,
    otrosCostosDirectosPct: 0.003,
    costosVariablesPct: 0.05,
    tecnologiaPctVentas: 0.018,
    ocupacionPctVentas: 0.0128,

    gastoPersonalMM: [26, 80.5, 83.1, 85.7, 88.5].slice(0, n),
    publicidadMM: [0, 0, 0, 0, 0].slice(0, n),
    gastosGeneralesMM: [0.8, 9.9, 10.2, 10.55, 10.89].slice(0, n),

    capitalTrabajoMM: 100,
    customRows: [],
  };
}

// Aplica overrides manuales del admin sobre el resultado calculado
export function applyOverrides(
  result: BusinessCaseResult,
  overrides: Record<string, number> = {},
): BusinessCaseResult {
  const keys = Object.keys(overrides);
  if (keys.length === 0) return result;
  const next: BusinessCaseResult = JSON.parse(JSON.stringify(result));
  for (const key of keys) {
    // formato: "tir" | "van" | "paybackAnios" | "years.<i>.<field>"
    const val = overrides[key];
    if (!Number.isFinite(val)) continue;
    const parts = key.split(".");
    if (parts.length === 1) {
      (next as any)[parts[0]] = val;
    } else if (parts[0] === "years") {
      const idx = Number(parts[1]);
      if (next.years[idx]) (next.years[idx] as any)[parts[2]] = val;
    }
  }
  return next;
}
