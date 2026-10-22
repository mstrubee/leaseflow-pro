import { computeArriendoPeriods, type RentPeriodsVersionInput } from "@/lib/businessCase/rentPeriods";
import { projectedUF, type UFProjection } from "@/lib/budget/ufProjection";

// Cálculo mensual del Presupuesto Operativo de Nuevos Locales (pestaña
// Operativo de "Planificar Presupuesto"), sin React ni Supabase para poder
// probarlo y para que pantalla y Excel usen exactamente lo mismo.
//
// Regla: cada categoría automática se arma como monto en UF del mes × UF
// ESTIMADA de ese mes (ver ufProjection.ts). Los montos manuales (pesos
// guardados en capex_new_location_budget.monthly_amount_clp) no se proyectan.
//
// Cada mes entrega dos arreglos paralelos por categoría y año:
//  - clp:  pesos del mes (lo que se muestra y se suma).
//  - uf:   monto en UF del mes (null si el mes es un monto manual en pesos);
//          lo usa el Excel para armar la fórmula "UF × UF estimada del mes".

export type OpexCategory = "arriendo" | "ggcc" | "fondo_promocion" | "otros";
export const OPEX_CATEGORIES: { key: OpexCategory; label: string }[] = [
  { key: "arriendo", label: "Arriendo" },
  { key: "ggcc", label: "GGCC" },
  { key: "fondo_promocion", label: "Fondo Promoción" },
  { key: "otros", label: "Otros" },
];

// Los Ítems de Presupuesto informativos no tienen canon: no participan de Arriendo.
export type OpexItemCategory = Exclude<OpexCategory, "arriendo">;
export const OPEX_ITEM_CATEGORIES: { key: OpexItemCategory; label: string }[] = [
  { key: "ggcc", label: "GGCC" },
  { key: "fondo_promocion", label: "Fondo Promoción" },
  { key: "otros", label: "Otros" },
];

/** Mismo set de columnas que computeArriendoPeriods necesita, sobre la versión ACTUAL del contrato. */
export interface ContractVersionInput extends RentPeriodsVersionInput {
  effective_date: string | null;
}

export interface MonthlySeries {
  /** Pesos de cada mes (Ene..Dic). */
  clp: number[];
  /** Monto en UF de cada mes; null = monto manual en pesos (no se proyecta). */
  uf: (number | null)[];
}

export type MonthlyByCategory<C extends string> = Record<C, { [year: number]: MonthlySeries }>;

// Parsea el label "M{start}-M{end}" de un RentPeriodRow (ver rentPeriods.ts).
export const parsePeriodLabel = (label: string): { start: number; end: number } | null => {
  const m = label.match(/^M(\d+)-M(\d+)$/);
  if (!m) return null;
  return { start: parseInt(m[1], 10), end: parseInt(m[2], 10) };
};

// Offset de mes (1-indexado) de un mes calendario respecto a effective_date:
// offset 1 = el mes calendario que contiene effective_date.
// Ej: effective_date 2026-07-15 -> julio/2026 es offset 1, agosto/2026
// offset 2, junio/2026 offset 0 (antes de empezar), enero/2027 offset 7.
export const monthOffset = (effectiveDate: string, calYear: number, calMonth1Indexed: number): number => {
  const eff = new Date(effectiveDate + "T00:00:00");
  const effYear = eff.getFullYear();
  const effMonth = eff.getMonth() + 1; // 1-indexado
  return (calYear - effYear) * 12 + (calMonth1Indexed - effMonth) + 1;
};

const ZERO_UF: Record<OpexCategory, number> = { arriendo: 0, ggcc: 0, fondo_promocion: 0, otros: 0 };

/**
 * Monto automático EN UF de cada categoría de un contrato en un mes
 * calendario, a partir de los tramos de computeArriendoPeriods. Si
 * contract_versions.effective_date no está cargada se usa `fallbackDate` (la
 * fecha del ítem del contrato en la Línea de tiempo general de /reports); sin
 * ninguna de las dos, todo en 0 (la categoría cae a manual, ver isMissing en
 * el componente).
 */
export function autoMonthlyUF(
  version: ContractVersionInput,
  periods: ReturnType<typeof computeArriendoPeriods>,
  calYear: number,
  calMonth1Indexed: number,
  fallbackDate: string | null,
): Record<OpexCategory, number> {
  const effectiveDate = version.effective_date ?? fallbackDate;
  if (!effectiveDate) return ZERO_UF;
  const offset = monthOffset(effectiveDate, calYear, calMonth1Indexed);
  if (offset < 1 || offset > version.duration_months) return ZERO_UF;
  const period = periods.find((p) => {
    const parsed = parsePeriodLabel(p.label);
    return parsed && offset >= parsed.start && offset <= parsed.end;
  });
  if (!period) return ZERO_UF;
  return { arriendo: period.canon, ggcc: period.ggcc, fondo_promocion: period.fProm, otros: period.otros };
}

const emptyByCategory = <C extends string>(categories: { key: C }[], years: number[]): MonthlyByCategory<C> => {
  const out = {} as MonthlyByCategory<C>;
  categories.forEach(({ key }) => {
    out[key] = {};
    years.forEach((y) => {
      out[key][y] = { clp: [], uf: [] };
    });
  });
  return out;
};

/**
 * 4 categorías × 12 meses × años de un contrato. Categoría automática: UF del
 * mes × UF estimada del mes. Categoría "missing" (falta el dato fuente):
 * override manual en pesos, tal cual (no se proyecta).
 */
export function buildContractMonths(args: {
  version: ContractVersionInput | undefined;
  superficie: number | null;
  metrosLinealesFrente: number | null;
  fallbackDate: string | null;
  missing: Record<OpexCategory, boolean>;
  manualClp: (year: number, category: OpexCategory) => number;
  years: number[];
  projection: UFProjection;
}): MonthlyByCategory<OpexCategory> {
  const { version, superficie, metrosLinealesFrente, fallbackDate, missing, manualClp, years, projection } = args;
  const monthly = emptyByCategory(OPEX_CATEGORIES, years);
  const periods = version ? computeArriendoPeriods(version, superficie, metrosLinealesFrente) : [];
  years.forEach((year) => {
    for (let m = 1; m <= 12; m++) {
      const autoUf = version ? autoMonthlyUF(version, periods, year, m, fallbackDate) : ZERO_UF;
      const ufOfMonth = projectedUF(projection, year, m);
      OPEX_CATEGORIES.forEach(({ key }) => {
        if (missing[key]) {
          monthly[key][year].clp.push(manualClp(year, key));
          monthly[key][year].uf.push(null);
        } else {
          monthly[key][year].clp.push(autoUf[key] * ufOfMonth);
          monthly[key][year].uf.push(autoUf[key]);
        }
      });
    }
  });
  return monthly;
}

export interface OpexItemInput {
  /** YYYY-MM-DD: desde este mes (incluido) rigen los montos. */
  date: string;
  superficie_m2: number | null;
  ggcc_uf_m2: number | null;
  fondo_promocion_uf: number | null;
  otros_uf: number | null;
}

/**
 * 3 categorías × 12 meses × años de un ítem informativo de Gantt: sus montos
 * se ingresan en UF (GGCC en UF/m², Fondo Promoción y Otros en UF/mes), rigen
 * desde el mes de su fecha y se valorizan con la UF estimada de cada mes.
 */
export function buildItemMonths(item: OpexItemInput, years: number[], projection: UFProjection): MonthlyByCategory<OpexItemCategory> {
  const monthly = emptyByCategory(OPEX_ITEM_CATEGORIES, years);
  const itemDate = new Date(item.date + "T00:00:00");
  years.forEach((year) => {
    for (let m = 1; m <= 12; m++) {
      const started = year > itemDate.getFullYear() || (year === itemDate.getFullYear() && m >= itemDate.getMonth() + 1);
      const ufOfMonth = projectedUF(projection, year, m);
      const amounts: Record<OpexItemCategory, number> = {
        ggcc: started && item.ggcc_uf_m2 != null && item.superficie_m2 != null ? item.ggcc_uf_m2 * item.superficie_m2 : 0,
        fondo_promocion: started && item.fondo_promocion_uf != null ? item.fondo_promocion_uf : 0,
        otros: started && item.otros_uf != null ? item.otros_uf : 0,
      };
      OPEX_ITEM_CATEGORIES.forEach(({ key }) => {
        monthly[key][year].clp.push(amounts[key] * ufOfMonth);
        monthly[key][year].uf.push(amounts[key]);
      });
    }
  });
  return monthly;
}
