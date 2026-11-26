/**
 * Distribución del gasto de una OC entre los CEBE de un local "mixto".
 *
 * Un local es mixto cuando tiene 2 o más CEBE (contract_cebes). Esta lógica es
 * genérica: no depende de nombres de locales ni de cuántos CEBE hay.
 *
 * Decisiones de diseño
 * --------------------
 *  - La VERDAD son los montos en pesos enteros (CLP), que siempre suman el total del
 *    documento. El % se deriva del monto (amount / total). Así no hay deriva por redondeo.
 *  - Cascada: al editar un CEBE, otro CEBE "absorbe" la diferencia para que el total se
 *    mantenga siempre. El absorbente es el ÚLTIMO CEBE; si se edita el último, absorbe el
 *    penúltimo. Es determinista (solo depende del orden) y no tiene estado oculto.
 *  - Al editar nunca se permite pasar el total: el valor se limita para que el absorbente
 *    quede en 0 como mínimo.
 *  - Redondeo: todo en pesos enteros; el último CEBE (o el absorbente) toma la diferencia.
 *  - Plan de pagos: cada pago se reparte con las proporciones de la distribución de la OC
 *    (monto_i / total); el último CEBE absorbe el redondeo, así las sublíneas suman
 *    exactamente el monto del pago.
 */

export type RowSource = "pending" | "manual" | "auto";

export interface DistRow {
  cebeId: string;
  /** Pesos enteros. */
  amount: number;
  /** pending = aún sin tocar; manual = lo ingresó el usuario; auto = lo calculó el sistema. */
  source: RowSource;
}

export interface PercentRow {
  cebeId: string;
  amount: number;
  /** % del total, ya cuadrado para que la suma sea exactamente 100. */
  percent: number;
}

/** Un local es mixto si tiene 2 o más CEBE. Con 0 o 1 CEBE no hay nada que distribuir. */
export const isMixedLocal = (cebeCount: number): boolean => cebeCount >= 2;

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);
const toInt = (n: number): number => (Number.isFinite(n) ? Math.round(n) : 0);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const roundTo = (n: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
};

export const emptyRows = (cebeIds: string[]): DistRow[] =>
  cebeIds.map((cebeId) => ({ cebeId, amount: 0, source: "pending" as RowSource }));

/** Índice del CEBE que absorbe la diferencia cuando se edita `editedIdx`. */
export const absorberIndex = (editedIdx: number, n: number): number => (editedIdx < n - 1 ? n - 1 : n - 2);

/**
 * Reparte `total` (entero) en proporción a `weights`. Los primeros se redondean y el
 * último toma la diferencia, de modo que la suma es EXACTAMENTE `total`. Si la
 * diferencia dejara al último negativo (caso extremo con totales muy chicos) se usa el
 * método del mayor resto, que siempre es exacto y no negativo.
 */
export function splitAmount(total: number, weights: number[]): number[] {
  const t = Math.max(0, toInt(total));
  const n = weights.length;
  if (n === 0) return [];
  const w = weights.map((x) => (x > 0 ? x : 0));
  const wSum = sum(w);
  if (t === 0 || wSum === 0) return w.map(() => 0);

  const rounded = w.map((x) => Math.round((t * x) / wSum));
  const lastAmount = t - sum(rounded.slice(0, n - 1));
  if (lastAmount >= 0) return [...rounded.slice(0, n - 1), lastAmount];

  // Mayor resto
  const exact = w.map((x) => (t * x) / wSum);
  const floors = exact.map(Math.floor);
  let remainder = t - sum(floors);
  const order = exact.map((e, i) => ({ i, frac: e - Math.floor(e) })).sort((a, b) => b.frac - a.frac || b.i - a.i);
  const out = [...floors];
  for (const { i } of order) {
    if (remainder <= 0) break;
    out[i] += 1;
    remainder -= 1;
  }
  return out;
}

/** Edita el monto del CEBE `idx`; el absorbente se recalcula y el valor se limita al disponible. */
export function applyAmountEdit(rows: DistRow[], idx: number, rawAmount: number, total: number): DistRow[] {
  const n = rows.length;
  const t = Math.max(0, toInt(total));
  if (n === 0 || idx < 0 || idx >= n) return rows;
  if (n === 1) return [{ ...rows[0], amount: t, source: "auto" }];

  const abs = absorberIndex(idx, n);
  const fixedSum = sum(rows.map((r, i) => (i === idx || i === abs ? 0 : r.amount)));
  const maxForEdited = Math.max(0, t - fixedSum);
  const amount = clamp(toInt(rawAmount), 0, maxForEdited);

  return rows.map((r, i) => {
    if (i === idx) return { ...r, amount, source: "manual" as RowSource };
    if (i === abs) return { ...r, amount: t - fixedSum - amount, source: "auto" as RowSource };
    return r;
  });
}

/** Edita el % del CEBE `idx` (0–100). */
export function applyPercentEdit(rows: DistRow[], idx: number, rawPercent: number, total: number): DistRow[] {
  const p = clamp(Number.isFinite(rawPercent) ? rawPercent : 0, 0, 100);
  return applyAmountEdit(rows, idx, (Math.max(0, toInt(total)) * p) / 100, total);
}

/**
 * Ajusta las filas a un nuevo total del documento conservando las proporciones.
 * Si aún no hay nada distribuido (todo en 0) no hace nada.
 */
export function rescaleRows(rows: DistRow[], newTotal: number): DistRow[] {
  const t = Math.max(0, toInt(newTotal));
  const current = sum(rows.map((r) => r.amount));
  if (current === t || current === 0) return rows;
  const amounts = splitAmount(t, rows.map((r) => r.amount));
  return rows.map((r, i) => ({ ...r, amount: amounts[i] }));
}

/** Mantiene las filas existentes de los CEBE que siguen y agrega (en 0) los nuevos, en el orden dado. */
export function syncRowsWithCebes(rows: DistRow[], cebeIds: string[]): DistRow[] {
  const byId = new Map(rows.map((r) => [r.cebeId, r]));
  return cebeIds.map((id) => byId.get(id) ?? { cebeId: id, amount: 0, source: "pending" as RowSource });
}

/**
 * % de cada fila con `decimals` decimales, cuadrado a EXACTAMENTE 100: la diferencia de
 * redondeo la toma el último CEBE (o, si quedara negativo, el de mayor monto).
 */
export function percentsFor(rows: Pick<DistRow, "amount">[], total: number, decimals = 2): number[] {
  const t = Math.max(0, toInt(total));
  if (t === 0 || rows.length === 0) return rows.map(() => 0);
  const raw = rows.map((r) => roundTo((r.amount / t) * 100, decimals));
  const diff = roundTo(100 - sum(raw), decimals);
  if (diff === 0 || sum(rows.map((r) => r.amount)) !== t) return raw; // suma incompleta: no forzar a 100
  const lastIdx = rows.length - 1;
  const target = raw[lastIdx] + diff >= 0 ? lastIdx : raw.indexOf(Math.max(...raw));
  const out = [...raw];
  out[target] = roundTo(out[target] + diff, decimals);
  return out;
}

export const withPercents = (rows: DistRow[], total: number, decimals = 2): PercentRow[] => {
  const pcts = percentsFor(rows, total, decimals);
  return rows.map((r, i) => ({ cebeId: r.cebeId, amount: r.amount, percent: pcts[i] }));
};

export interface DistributionCheck {
  valid: boolean;
  errors: string[];
  /** total - suma distribuida (0 = completo). */
  remaining: number;
}

const clp = (n: number) => `$ ${Math.round(n).toLocaleString("es-CL")}`;

/** Validaciones obligatorias para un local mixto. */
export function validateDistribution(rows: DistRow[], total: number, expectedCebeIds: string[]): DistributionCheck {
  const errors: string[] = [];
  const t = toInt(total);
  const distributed = sum(rows.map((r) => r.amount));
  const remaining = t - distributed;

  if (t <= 0) errors.push("Ingresa el monto del documento para poder distribuirlo entre los CEBE.");

  const ids = new Set(rows.map((r) => r.cebeId));
  const missing = expectedCebeIds.filter((id) => !ids.has(id));
  if (missing.length > 0) errors.push("La distribución debe incluir todos los CEBE del local.");
  if (rows.some((r) => !expectedCebeIds.includes(r.cebeId))) errors.push("La distribución incluye un CEBE que no es del local.");
  if (rows.some((r) => !Number.isFinite(r.amount) || r.amount < 0)) errors.push("No se permiten montos negativos.");
  if (rows.some((r) => !Number.isInteger(r.amount))) errors.push("Los montos deben ser pesos enteros.");

  if (t > 0 && remaining !== 0) {
    errors.push(
      remaining > 0
        ? `Falta distribuir ${clp(remaining)} (la distribución suma ${clp(distributed)} de ${clp(t)}).`
        : `La distribución se pasa por ${clp(-remaining)} (suma ${clp(distributed)} de ${clp(t)}).`,
    );
  }
  return { valid: errors.length === 0, errors, remaining };
}

export interface PaymentSubline {
  cebeId: string;
  amount: number;
  /** % del pago, cuadrado a 100 con 4 decimales (para guardar). */
  percent: number;
}

/**
 * Sublíneas por CEBE de cada pago del plan, heredando las proporciones de la OC.
 * `paymentAmounts` en pesos enteros; devuelve un arreglo por pago.
 */
export function buildPaymentSublines(paymentAmounts: number[], distribution: Pick<DistRow, "cebeId" | "amount">[]): PaymentSubline[][] {
  const weights = distribution.map((d) => d.amount);
  return paymentAmounts.map((pay) => {
    const amounts = splitAmount(pay, weights);
    const pcts = percentsFor(amounts.map((amount) => ({ amount })), pay, 4);
    return distribution.map((d, i) => ({ cebeId: d.cebeId, amount: amounts[i], percent: pcts[i] }));
  });
}
