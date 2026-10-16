// ============================================================
// Business Case Financiero — sugerencia/ajuste de escalonamiento de renta
// para llevar el EBITDA de cada año (1..5) a un margen objetivo, respetando
// un tope máximo de Arriendo/Vta%. Ver BusinessCaseFinanciero.tsx (botón
// "Optimizar renta" en la sección Contrato) y model.ts (resolveCanonTiers,
// computeBC) para el motor de cálculo del que se derivan estas fórmulas.
// ============================================================
import { computeBC, type AdminConfig, type BCInputs, type BCResult, type BCEscalation } from "./model";

export const EBITDA_TARGET_PCT = 25;
export const ARRIENDO_CAP_PCT = 10;
export const ESCALATION_STEP = 0.05;

function roundToStep(v: number, step = ESCALATION_STEP): number {
  return Math.round(v / step) * step;
}

export interface EscalationYearTarget {
  year: number; // 1..5
  ingresos: number;
  ebitdaPctActual: number;
  arriendoPctActual: number;
  canonUfM2Actual: number; // promedio UF/m² del año, tal como está hoy
  canonUfM2Propuesto: number; // promedio UF/m² del año, redondeado a pasos de 0,05
  ebitdaPctPropuesto: number;
  arriendoPctPropuesto: number;
  limitadoPorTope: boolean; // el tope de Arriendo/Vta% 10% impidió llegar al 25%
  sinMargenPara25: boolean; // ni con arriendo en 0 se alcanza el 25% (costos fijos ya superan el objetivo)
}

// Todo lo que compone el EBITDA de un año EXCEPTO canon y fondo de promoción
// (que son la palanca que se está resolviendo). margenCtrib, personal,
// publicidad, gastosGral, tecnologia, ocupacion y gastoComun no dependen del
// canon — ver computeBC en model.ts.
function fixedPart(result: BCResult, i: number): number {
  return (
    result.margenCtrib[i] + result.personal[i] + result.publicidad[i] +
    result.gastosGral[i] + result.tecnologia[i] + result.ocupacion[i] + result.gastoComun[i]
  );
}

/**
 * Calcula, para cada año 1..5, el canon promedio (UF/m²) que llevaría el
 * EBITDA de ese año exactamente al EBITDA_TARGET_PCT, respetando que
 * Arriendo/Vta% (canon + fondo promoción + gasto común, sobre ingresos) no
 * supere ARRIENDO_CAP_PCT. Si el objetivo de EBITDA exige más arriendo del
 * que el tope permite, se aplica el tope (limitadoPorTope=true, el EBITDA
 * propuesto queda por debajo del objetivo). Si ni con arriendo en 0 se llega
 * al objetivo, se deja en 0 (sinMargenPara25=true).
 */
export function computeEscalationYearTargets(inputs: BCInputs, result: BCResult): EscalationYearTarget[] {
  const superficie = inputs.superficie || 0;
  const fondoPromPct = (inputs.fondoPromocionPct || 0) / 100;
  const years: EscalationYearTarget[] = [];

  for (let i = 1; i <= 5; i++) {
    const ingresos = result.ingresos[i] || 0;
    const ebitdaPctActual = ingresos ? result.ebitda[i] / ingresos : 0;
    const arriendoActualTotal = Math.abs(result.canonArr[i]) + Math.abs(result.fondoPromocion[i]) + Math.abs(result.gastoComun[i]);
    const arriendoPctActual = ingresos ? arriendoActualTotal / ingresos : 0;
    const canonUfM2Actual = superficie > 0 ? (result.canonUfPromedio[i] || 0) / superficie : 0;

    if (ingresos <= 0 || superficie <= 0) {
      years.push({
        year: i, ingresos, ebitdaPctActual, arriendoPctActual, canonUfM2Actual,
        canonUfM2Propuesto: canonUfM2Actual, ebitdaPctPropuesto: ebitdaPctActual, arriendoPctPropuesto: arriendoPctActual,
        limitadoPorTope: false, sinMargenPara25: false,
      });
      continue;
    }

    const fp = fixedPart(result, i);
    // canon (MM CLP, negativo) que hace FixedPart + canon*(1+fondoPromPct) = target
    const targetCanonSigned = (EBITDA_TARGET_PCT / 100 * ingresos - fp) / (1 + fondoPromPct);
    const targetCanonAbs = Math.max(0, -targetCanonSigned);
    const gastoComunAbs = Math.abs(result.gastoComun[i]);
    const maxCanonAbs = Math.max(0, (ARRIENDO_CAP_PCT / 100 * ingresos - gastoComunAbs) / (1 + fondoPromPct));
    const finalCanonAbs = Math.min(targetCanonAbs, maxCanonAbs);
    const limitadoPorTope = targetCanonAbs > maxCanonAbs;
    const sinMargenPara25 = targetCanonSigned > 0; // ya se pasa del 25% con canon=0

    const canonUfPromedio = (finalCanonAbs * 1e6) / (result.mesesArr[i] * result.ufAvgs[i - 1]);
    let canonUfM2Propuesto = roundToStep(Math.max(0, canonUfPromedio / superficie));
    // Redondear a pasos de 0,05 puede empujar levemente sobre el tope de 10%; si pasa, bajar un paso.
    const arriendoConPropuesto = (uf: number) => {
      const canonMM = (uf * superficie * result.mesesArr[i] * result.ufAvgs[i - 1]) / 1e6;
      const fondoMM = canonMM * fondoPromPct;
      return ingresos ? (canonMM + fondoMM + gastoComunAbs) / ingresos : 0;
    };
    if (arriendoConPropuesto(canonUfM2Propuesto) > ARRIENDO_CAP_PCT / 100) {
      canonUfM2Propuesto = Math.max(0, canonUfM2Propuesto - ESCALATION_STEP);
    }

    const canonMMPropuesto = (canonUfM2Propuesto * superficie * result.mesesArr[i] * result.ufAvgs[i - 1]) / 1e6;
    const fondoMMPropuesto = canonMMPropuesto * fondoPromPct;
    const ebitdaPctPropuesto = ingresos ? (fp - canonMMPropuesto - fondoMMPropuesto) / ingresos : 0;
    const arriendoPctPropuesto = ingresos ? (canonMMPropuesto + fondoMMPropuesto + gastoComunAbs) / ingresos : 0;

    years.push({
      year: i, ingresos, ebitdaPctActual, arriendoPctActual, canonUfM2Actual,
      canonUfM2Propuesto, ebitdaPctPropuesto, arriendoPctPropuesto, limitadoPorTope, sinMargenPara25,
    });
  }
  return years;
}

// Mes ENTERO redondeado del año 1 (mismo criterio que mesesEnteros en
// computeBC), y los límites absolutos [desde, hasta] de cada año-modelo
// 1..5, en "mes absoluto desde effective_date" (mismo eje que
// rent_escalations.month_number / BCEscalation.monthNumber).
export function modelYearBounds(inputs: BCInputs, result: BCResult): { year: number; from: number; to: number }[] {
  const gracia = inputs.graciaMeses || 0;
  const mesesY1Enteros = Math.max(1, Math.round(result.mesesY1));
  const bounds: { year: number; from: number; to: number }[] = [];
  let cursor = gracia; // fin del "mes 0"; año 1 arranca en cursor+1
  const dur = [mesesY1Enteros, 12, 12, 12, 12];
  for (let i = 0; i < 5; i++) {
    const from = cursor + 1;
    const to = cursor + dur[i];
    bounds.push({ year: i + 1, from, to });
    cursor = to;
  }
  return bounds;
}

/** Año-modelo (1..5) al que pertenece un mes absoluto, o null si cae fuera de la ventana de 5 años. */
export function modelYearForMonth(monthAbs: number, bounds: { year: number; from: number; to: number }[]): number | null {
  for (const b of bounds) {
    if (monthAbs >= b.from && monthAbs <= b.to) return b.year;
  }
  return null;
}

/**
 * Modo "crear": arma tramos NUEVOS para los años 2..5 (el año 1 se deja
 * intacto — es la renta base "UF/m²" del contrato, no un escalonamiento).
 * Pensado para cuando no hay tramos de escalonamiento cargados todavía.
 */
export function buildSuggestedTiers(
  inputs: BCInputs, result: BCResult, targets: EscalationYearTarget[],
): BCEscalation[] {
  const bounds = modelYearBounds(inputs, result);
  const tiers: BCEscalation[] = [];
  for (const b of bounds) {
    if (b.year === 1) continue;
    const t = targets.find((x) => x.year === b.year);
    if (!t) continue;
    tiers.push({ monthNumber: b.from, amount: t.canonUfM2Propuesto, isUfM2: true });
  }
  return tiers;
}

export interface AdjustedTierResult {
  tiers: BCEscalation[];
  aniosCubiertos: number[]; // años 1..5 que quedaron cubiertos por algún tramo existente
  aniosNoCubiertos: number[]; // años sin ningún tramo que los alcance (quedan con su renta actual)
}

/**
 * Modo "ajustar": recalcula el MONTO de cada tramo ya existente según a qué
 * año-modelo (1..5) llega su mes de inicio; los tramos cuyo mes cae fuera de
 * la ventana de 5 años (ver modelYearForMonth) quedan sin tocar, porque
 * cambiarles el monto no tiene ningún efecto en el EBITDA/VAN/TIR a 5 años.
 */
export function buildAdjustedTiers(
  inputs: BCInputs, result: BCResult, targets: EscalationYearTarget[],
): AdjustedTierResult {
  const bounds = modelYearBounds(inputs, result);
  const aniosCubiertos = new Set<number>();
  const tiers = inputs.escalations.map((esc) => {
    const year = modelYearForMonth(esc.monthNumber, bounds);
    if (year == null) return esc;
    aniosCubiertos.add(year);
    const t = targets.find((x) => x.year === year);
    if (!t) return esc;
    const superficie = inputs.superficie || 0;
    // Respeta la unidad del tramo (UF/m² o UF total) tal como ya está cargado.
    const amount = esc.isUfM2 ? t.canonUfM2Propuesto : roundToStep(t.canonUfM2Propuesto * superficie);
    return { ...esc, amount };
  });
  const aniosNoCubiertos = [1, 2, 3, 4, 5].filter((y) => !aniosCubiertos.has(y));
  return { tiers, aniosCubiertos: Array.from(aniosCubiertos).sort(), aniosNoCubiertos };
}

export interface EscalationPreviewYear {
  year: number;
  ingresos: number;
  canonUfM2Actual: number;
  canonUfM2Propuesto: number;
  ebitdaPctActual: number;
  ebitdaPctPropuesto: number;
  arriendoPctActual: number;
  arriendoPctPropuesto: number;
}

/**
 * Recalcula el modelo completo con los tramos propuestos y compara, año a
 * año, contra el estado actual. Un solo tramo existente puede quedar
 * vigente para varios años (si no hay otro tramo posterior dentro de la
 * ventana que lo reemplace) — por eso el antes/después se simula con
 * computeBC en vez de estimarlo por año de forma independiente: ajustar UN
 * tramo puede mover el EBITDA de varios años a la vez, no solo el de su
 * año de inicio.
 */
export function simulateEscalationProposal(
  inputs: BCInputs, result: BCResult, config: AdminConfig, proposedTiers: BCEscalation[],
): EscalationPreviewYear[] {
  const proposed = computeBC({ ...inputs, escalations: proposedTiers }, config);
  const years: EscalationPreviewYear[] = [];
  for (let i = 1; i <= 5; i++) {
    const superficie = inputs.superficie || 0;
    const ingresos = result.ingresos[i] || 0;
    const arriendoActual = Math.abs(result.canonArr[i]) + Math.abs(result.fondoPromocion[i]) + Math.abs(result.gastoComun[i]);
    const arriendoPropuesto = Math.abs(proposed.canonArr[i]) + Math.abs(proposed.fondoPromocion[i]) + Math.abs(proposed.gastoComun[i]);
    years.push({
      year: i,
      ingresos,
      canonUfM2Actual: superficie > 0 ? (result.canonUfPromedio[i] || 0) / superficie : 0,
      canonUfM2Propuesto: superficie > 0 ? (proposed.canonUfPromedio[i] || 0) / superficie : 0,
      ebitdaPctActual: ingresos ? result.ebitda[i] / ingresos : 0,
      ebitdaPctPropuesto: ingresos ? proposed.ebitda[i] / ingresos : 0,
      arriendoPctActual: ingresos ? arriendoActual / ingresos : 0,
      arriendoPctPropuesto: ingresos ? arriendoPropuesto / ingresos : 0,
    });
  }
  return years;
}
