// Proyección de la UF mes a mes por inflación -- FUENTE ÚNICA para la pestaña
// Operativo de "Planificar Presupuesto" (pantalla) y para el Excel que se
// descarga desde ahí: ambos importan estas constantes y esta fórmula, así los
// montos de pantalla y Excel no pueden divergir.
//
//   UF del mes = UF inicial × (1 + inflación anual) ^ (meses desde el mes base / 12)
//
// - Mes base: enero del año a planificar (por ahora fijo, no editable en pantalla).
// - Meses ANTERIORES al mes base (ej. todo el año en curso): no se proyectan,
//   usan la UF actual (la del día, traída de los indicadores).
// - Solo cambia cuánto vale la UF de cada mes. Los montos que se guardan en
//   pesos (capex_new_location_budget.monthly_amount_clp) NO pasan por acá.

/** Inflación anual por defecto (3,4 %). En el Excel es editable (Resumen!B4). */
export const DEFAULT_ANNUAL_INFLATION = 0.034;

/** UF inicial por defecto ($) del mes base. En el Excel es editable (Resumen!B3). */
export const DEFAULT_INITIAL_UF = 42000;

export interface UFProjection {
  /** UF ($) del mes base. */
  initialUF: number;
  /** Inflación anual (0,034 = 3,4 %). */
  annualInflation: number;
  baseYear: number;
  /** 1-12 */
  baseMonth: number;
  /** UF actual ($): se usa en los meses anteriores al mes base. */
  currentUF: number;
}

/** Parámetros por defecto: base en enero del año a planificar. */
export function defaultUFProjection(targetYear: number, currentUF: number): UFProjection {
  return {
    initialUF: DEFAULT_INITIAL_UF,
    annualInflation: DEFAULT_ANNUAL_INFLATION,
    baseYear: targetYear,
    baseMonth: 1,
    currentUF,
  };
}

/** Meses transcurridos desde el mes base (negativo si el mes es anterior). */
export function monthsFromBase(p: UFProjection, year: number, month: number): number {
  return (year - p.baseYear) * 12 + (month - p.baseMonth);
}

/** UF estimada ($) de un mes calendario (month: 1-12). */
export function projectedUF(p: UFProjection, year: number, month: number): number {
  const n = monthsFromBase(p, year, month);
  if (n < 0) return p.currentUF;
  return p.initialUF * Math.pow(1 + p.annualInflation, n / 12);
}

/** UF estimada de los 12 meses de un año (índice 0 = enero). */
export function projectedUFSeries(p: UFProjection, year: number): number[] {
  return Array.from({ length: 12 }, (_, i) => projectedUF(p, year, i + 1));
}
