// Proyección de la UF mes a mes por inflación -- FUENTE ÚNICA para la pestaña
// Operativo de "Planificar Presupuesto" (pantalla) y para el Excel que se
// descarga desde ahí: ambos importan estas constantes y esta fórmula, así los
// montos de pantalla y Excel no pueden divergir.
//
//   UF del mes = UF de hoy × (1 + inflación anual) ^ (meses desde el mes actual / 12)
//
// - NO hay una UF inicial fija ni ingresada por un administrador: toda UF
//   futura (2027 y años siguientes) sale únicamente de aplicar la inflación a
//   la UF de HOY (la de los indicadores) desde el mes actual.
// - Meses ANTERIORES al mes actual (ej. enero a septiembre del año en curso):
//   no se proyectan hacia atrás, usan la UF de hoy.
// - Solo cambia cuánto vale la UF de cada mes. Los montos que se guardan en
//   pesos (capex_new_location_budget.monthly_amount_clp) NO pasan por acá.

/** Inflación anual por defecto (3,4 %). En el Excel es editable (Resumen!B4). */
export const DEFAULT_ANNUAL_INFLATION = 0.034;

export interface UFProjection {
  /** UF de hoy ($): valor del mes base y de todos los meses anteriores a él. */
  baseUF: number;
  /** Inflación anual (0,034 = 3,4 %). */
  annualInflation: number;
  /** Mes base = mes actual (el de la UF de hoy). */
  baseYear: number;
  /** 1-12 */
  baseMonth: number;
}

/** Parámetros por defecto: base en el mes actual, con la UF de hoy. */
export function defaultUFProjection(todayUF: number, today: Date = new Date()): UFProjection {
  return {
    baseUF: todayUF,
    annualInflation: DEFAULT_ANNUAL_INFLATION,
    baseYear: today.getFullYear(),
    baseMonth: today.getMonth() + 1,
  };
}

/** Meses transcurridos desde el mes base (negativo si el mes es anterior). */
export function monthsFromBase(p: UFProjection, year: number, month: number): number {
  return (year - p.baseYear) * 12 + (month - p.baseMonth);
}

/** UF estimada ($) de un mes calendario (month: 1-12). */
export function projectedUF(p: UFProjection, year: number, month: number): number {
  const n = Math.max(0, monthsFromBase(p, year, month));
  return p.baseUF * Math.pow(1 + p.annualInflation, n / 12);
}

/** UF estimada de los 12 meses de un año (índice 0 = enero). */
export function projectedUFSeries(p: UFProjection, year: number): number[] {
  return Array.from({ length: 12 }, (_, i) => projectedUF(p, year, i + 1));
}
