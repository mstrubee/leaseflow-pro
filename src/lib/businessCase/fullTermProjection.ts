// ============================================================
// Business Case Financiero — proyección a toda la duración del contrato,
// SOLO para visualización (botón "Ver negocio completo" en Ventas y
// Supuestos de Crecimiento). No se guarda ni se usa para TIR/VAN oficial
// del Business Case (esos siguen siendo a 5 años, ver computeBC en
// model.ts) — es una extensión de las mismas fórmulas a N años, en un
// archivo aparte para no arriesgar el motor de 5 años ya validado.
// ============================================================
import { calcIRR, calcNPV, resolveCanonTiers, type AdminConfig, type BCInputs } from "./model";

export const FULL_TERM_MAX_YEARS = 40;

function round(v: number, d = 2): number {
  const p = Math.pow(10, d);
  return Math.round((Number.isFinite(v) ? v : 0) * p) / p;
}

// Igual que calcUF en model.ts, pero a N años — más allá del año 5 repite
// la última tasa de UF cargada (no hay un input propio para años futuros).
function calcUFExtended(base: number, rates: number[], years: number): { starts: number[]; avgs: number[] } {
  const starts = [base];
  const avgs: number[] = [];
  for (let i = 0; i < years; i++) {
    const r = (rates[Math.min(i, rates.length - 1)] ?? 0) / 100;
    avgs.push(starts[i] * Math.sqrt(1 + r));
    starts.push(starts[i] * (1 + r));
  }
  return { starts: starts.slice(0, years), avgs };
}

export interface FullTermYear {
  year: number;
  ingresos: number;
  margenCtrib: number;
  personal: number;
  gastosGral: number;
  tecnologia: number;
  ocupacion: number;
  canonArr: number;
  fondoPromocion: number;
  gastoComun: number;
  canonUfM2: number;
  ebitda: number;
  ebitdaPct: number;
  arriendoPct: number;
  depreciacion: number;
  ebit: number;
  impuesto: number;
  udi: number;
  flujoOp: number;
  flujoAcumulado: number;
}

export interface FullTermProjection {
  totalYears: number;
  years: FullTermYear[]; // 1..totalYears (sin año 0)
  totalCapex: number;
  tir: number | null;
  van: number;
  paybackAnio: number;
}

/**
 * Extiende las mismas fórmulas de computeBC a toda la duración del contrato
 * (inputs.durContratoAnios), en vez de los 5 años fijos del Business Case.
 * Ventas: después del año 5 de vida del local se asume el régimen (tasa del
 * año 5) sin seguir madurando — mismo criterio que ya usa computeBC
 * (tasaVida clampea al índice 4). UF: después del año 5 repite la última
 * tasa de "Crec. UF anual %" cargada.
 */
export function computeFullTermProjection(inputs: BCInputs, admin: AdminConfig): FullTermProjection {
  const totalYears = Math.min(FULL_TERM_MAX_YEARS, Math.max(1, Math.round(inputs.durContratoAnios || 5)));
  const superficie = inputs.superficie || 0;
  const ufBase = inputs.ufBase || 39485.65;
  const { starts, avgs } = calcUFExtended(ufBase, inputs.ufRates, totalYears);
  const gracia = inputs.graciaMeses || 0;

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

  const mesesHastaFinDeAno = (iso: string): number => {
    const d = new Date(iso + "T00:00:00");
    if (Number.isNaN(d.getTime())) return 12;
    return Math.min(12, Math.max(0, 12 - d.getMonth()));
  };
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

  let dtCanonIso = inputs.inicio || "";
  if (inputs.inicio) {
    const dtCanon = new Date(inputs.inicio + "T00:00:00");
    dtCanon.setMonth(dtCanon.getMonth() + gracia);
    dtCanonIso = dtCanon.toISOString().slice(0, 10);
  }
  const mesesY1 = dtCanonIso ? mesesProporcionalesHastaFinDeAno(dtCanonIso) : 3;
  const mesesArr = [0, mesesY1, ...Array(Math.max(0, totalYears - 1)).fill(12)];

  const aperturaIso = inputs.apertura || dtCanonIso;
  const anoRenta = dtCanonIso ? new Date(dtCanonIso + "T00:00:00").getFullYear() : 0;
  const dApertura = new Date(aperturaIso + "T00:00:00");
  const anoApertura = Number.isNaN(dApertura.getTime()) ? anoRenta : dApertura.getFullYear();
  const mesesOperArr = [0];
  for (let i = 1; i <= totalYears; i++) {
    const anoCalendario = anoRenta + i - 1;
    mesesOperArr.push(anoCalendario < anoApertura ? 0 : anoCalendario > anoApertura ? 12 : mesesHastaFinDeAno(aperturaIso));
  }
  const mesesPersonal = Math.min(12, mesesOperArr[1] + 1);

  const lineas = (admin.invLineas[inputs.categoria] || admin.invLineas["Nuevo"]).filter((l) => l.activo);
  const ov = inputs.invOverrides || {};
  const garantiaUF = canonUfForLeaseMonth(1);
  let totalCapex = 0;
  let fisica = 0;
  for (const l of lineas) {
    let monto = 0;
    if (l.metodo === "uf_m2") monto = round((superficie * l.valor * ufBase) / 1e6, 2);
    else if (l.metodo === "auto") monto = round((garantiaUF * ufBase) / 1e6, 2);
    else monto = l.valor;
    if (ov[l.id] !== undefined) monto = ov[l.id];
    totalCapex += monto;
    if (l.id !== "inv" && l.id !== "gar") fisica += monto;
  }

  const gcomUF = inputs.gastoComunUf || 0;
  const fondoPromPct = (inputs.fondoPromocionPct || 0) / 100;

  let mesRentaCursor = 0;
  const canonUfPromedioArr = mesesArr.map((m, i) => {
    if (i === 0 || m <= 0) return 0;
    const mesesEnteros = Math.max(1, Math.round(m));
    let sumaUf = 0;
    for (let k = 1; k <= mesesEnteros; k++) sumaUf += canonUfForLeaseMonth(mesRentaCursor + k);
    mesRentaCursor += mesesEnteros;
    return sumaUf / mesesEnteros;
  });
  const canonArr = canonUfPromedioArr.map((c, i) => (i === 0 ? 0 : round((-c * mesesArr[i] * avgs[i - 1]) / 1e6, 4)));
  const fondoPromocion = canonUfPromedioArr.map((c, i) => (i === 0 ? 0 : round((-c * fondoPromPct * mesesArr[i] * avgs[i - 1]) / 1e6, 4)));
  const gastoComun = mesesArr.map((m, i) => (i === 0 ? 0 : round((-gcomUF * superficie * m * avgs[i - 1]) / 1e6, 4)));

  const sf = inputs.scenario === "opt" ? 1.1 : inputs.scenario === "cons" ? 0.85 : 1.0;
  const v = inputs.ventaMes || [];
  const ventaVida = [v[0] ?? 60, v[1] ?? 80, v[2] ?? 90, v[3] ?? 95, v[4] ?? 99.75];
  const tasaVida = (idx: number) => ventaVida[Math.min(Math.max(idx, 0), 4)];
  // Más allá del año 5, el local ya está en régimen y computeBC no modela
  // nada más lejos — pero eso no significa que la venta se congele para
  // siempre: se sigue creciendo a la última tasa de maduración cargada
  // ("Crec. Ventas %" del año 5, 3% por defecto), igual que ya venía
  // desacelerando en los años 3-5. Años 1-5 quedan intactos (idéntico a
  // computeBC, ya verificado) — el cambio de método aplica solo desde el
  // año 6 en adelante.
  const lastGrowthRate = (inputs.ventaGrowthPct?.[inputs.ventaGrowthPct.length - 1] ?? 0) / 100;
  let vidaAcumulada = 0;
  const ingresos = [0];
  for (let i = 1; i <= totalYears; i++) {
    const meses = mesesOperArr[i];
    if (meses <= 0) { ingresos.push(0); continue; }
    if (i <= 5) {
      const anoVidaInicio = Math.floor(vidaAcumulada / 12);
      const mesesRestantesAnoVida = (anoVidaInicio + 1) * 12 - vidaAcumulada;
      const ing = meses <= mesesRestantesAnoVida
        ? tasaVida(anoVidaInicio) * meses
        : tasaVida(anoVidaInicio) * mesesRestantesAnoVida + tasaVida(anoVidaInicio + 1) * (meses - mesesRestantesAnoVida);
      ingresos.push(round(ing * sf, 2));
      vidaAcumulada += meses;
    } else {
      ingresos.push(round(ingresos[i - 1] * (1 + lastGrowthRate), 2));
    }
  }

  const mDir = (inputs.margenDir || 0) / 100;
  const oDir = (inputs.otrosCostosDir || 0) / 100;
  const cVar = (inputs.costosVar || 0) / 100;
  const costoVentas = ingresos.map((x) => round(-x * (1 - mDir), 2));
  const otrosCostos = ingresos.map((x) => round(-x * oDir, 2));
  const costosVarArr = ingresos.map((x) => round(-x * cVar, 2));
  const margenCtrib = ingresos.map((x, i) => round(x + costoVentas[i] + otrosCostos[i] + costosVarArr[i], 2));

  const personalMensual = ((inputs.personalY1 || 0) * (inputs.costoPersonaMM || 0)) / 12;
  const personal = [0, -round(personalMensual * mesesPersonal, 2)];
  for (let i = 2; i <= totalYears; i++) {
    const ufPrev = starts[i - 2] || 0;
    const ufCur = starts[i - 1] || 0;
    const varUf = ufCur ? (ufCur - ufPrev) / ufCur : 0;
    personal.push(-round(personalMensual * 12 * (1 + varUf), 2));
  }
  const gralPct = (inputs.gralPct || 0) / 100;
  const tecPct = (inputs.tecPct || 0) / 100;
  const ocupPct = (inputs.ocupPct || 0) / 100;
  const publicidad = ingresos.map(() => 0);
  const gastosGral = ingresos.map((x) => round(-Math.abs(x) * gralPct, 2));
  const tecnologia = ingresos.map((x) => round(-Math.abs(x) * tecPct, 2));
  const ocupacion = ingresos.map((x) => round(-Math.abs(x) * ocupPct, 2));

  const depr = round(fisica / (inputs.deprAnos || 1), 2);
  const depreciacion = [0, ...Array(totalYears).fill(-depr)];

  const gavs = ingresos.map((_, i) =>
    round(personal[i] + publicidad[i] + gastosGral[i] + tecnologia[i] + ocupacion[i] + canonArr[i] + fondoPromocion[i] + gastoComun[i], 2),
  );
  const ebitda = ingresos.map((_, i) => round(margenCtrib[i] + gavs[i], 2));
  const ebit = ebitda.map((x, i) => round(x + depreciacion[i], 2));
  const taxRate = (inputs.taxRate || 0) / 100;
  const impuesto = ebit.map((x) => round(-x * taxRate, 2));
  const udi = ebit.map((x) => round(x * (1 - taxRate), 2));

  const flujoOp = udi.map((x, i) => (i === 0 ? -totalCapex : round(x + depr, 2)));
  const payback = [flujoOp[0]];
  for (let i = 1; i <= totalYears; i++) payback.push(round(payback[i - 1] + flujoOp[i], 2));

  const tir = calcIRR(flujoOp);
  const van = round(calcNPV(flujoOp, (inputs.waccRate || 0) / 100), 1);
  const paybackAnio = payback.findIndex((x) => x >= 0);

  const years: FullTermYear[] = [];
  for (let i = 1; i <= totalYears; i++) {
    const arriendoTotal = Math.abs(canonArr[i]) + Math.abs(fondoPromocion[i]) + Math.abs(gastoComun[i]);
    years.push({
      year: i,
      ingresos: ingresos[i],
      margenCtrib: margenCtrib[i],
      personal: personal[i],
      gastosGral: gastosGral[i],
      tecnologia: tecnologia[i],
      ocupacion: ocupacion[i],
      canonArr: canonArr[i],
      fondoPromocion: fondoPromocion[i],
      gastoComun: gastoComun[i],
      canonUfM2: superficie > 0 ? canonUfPromedioArr[i] / superficie : 0,
      ebitda: ebitda[i],
      ebitdaPct: ingresos[i] ? ebitda[i] / ingresos[i] : 0,
      arriendoPct: ingresos[i] ? arriendoTotal / ingresos[i] : 0,
      depreciacion: depreciacion[i],
      ebit: ebit[i],
      impuesto: impuesto[i],
      udi: udi[i],
      flujoOp: flujoOp[i],
      flujoAcumulado: payback[i],
    });
  }

  return { totalYears, years, totalCapex, tir, van, paybackAnio };
}
