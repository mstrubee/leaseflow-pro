/**
 * Plan de pagos: cada pago se define por MONTO o por % DEL TOTAL, y el ÚLTIMO
 * pago es siempre el saldo -- se recalcula solo, en tiempo real, para que el
 * plan cuadre exacto con el total (monto y % del último = lo que falta de los
 * anteriores). Misma matemática para todos los diálogos de plan de pagos.
 *
 * Los montos se manejan en la moneda del plan (CLP o UF); `decimals` indica a
 * cuántos decimales se redondea (0 para CLP, 4 para UF).
 */

export type PaymentInputMode = "amount" | "percent";

/** Forma mínima que necesita el cálculo; los diálogos pueden tener más campos. */
export interface PaymentPlanRow {
  description: string;
  /** Monto tipeado (cuando `input_mode` es "amount" o no viene). */
  amount: string;
  /** % tipeado (cuando `input_mode` es "percent"). */
  percent?: string;
  due_date: string;
  input_mode?: PaymentInputMode;
}

export interface ResolvedPayment {
  /** Monto resuelto, en la moneda del plan. */
  amount: number;
  /** % del total que representa, con 2 decimales. */
  percent: number;
  /** true para el último pago: es el saldo, no se tipea. */
  isBalance: boolean;
}

export interface ResolvedPlan {
  payments: ResolvedPayment[];
  /** Suma de los pagos resueltos. */
  planned: number;
  /** Cuánto se pasan los pagos anteriores al último del total (0 si no se pasan). */
  overflow: number;
}

/** Decimales de montos según la moneda del plan. */
export const paymentDecimals = (currency: "CLP" | "UF"): number => (currency === "UF" ? 4 : 0);

export const formatPaymentAmount = (n: number, currency: "CLP" | "UF"): string =>
  currency === "UF"
    ? `UF ${n.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
    : `$ ${Math.round(n).toLocaleString("es-CL")}`;

const roundTo = (n: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
};

const parseNum = (s: string | undefined): number => {
  const n = parseFloat(s ?? "");
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Resuelve cada pago a monto y %. Todos los pagos menos el último salen de lo
 * tipeado (monto o %); el último es `total - suma(anteriores)`, sin bajar de 0
 * (si los anteriores ya se pasan del total, `overflow` dice por cuánto).
 */
export function resolvePaymentPlan(rows: PaymentPlanRow[], total: number, decimals: number): ResolvedPlan {
  const safeTotal = total > 0 ? total : 0;
  const pct = (amount: number) => (safeTotal > 0 ? roundTo((amount / safeTotal) * 100, 2) : 0);

  const payments: ResolvedPayment[] = [];
  let previousSum = 0;

  rows.forEach((row, idx) => {
    const isLast = idx === rows.length - 1;
    if (isLast) {
      const balance = roundTo(safeTotal - previousSum, decimals);
      const amount = balance > 0 ? balance : 0;
      payments.push({ amount, percent: pct(amount), isBalance: true });
      return;
    }
    const amount =
      row.input_mode === "percent"
        ? roundTo((safeTotal * parseNum(row.percent)) / 100, decimals)
        : roundTo(parseNum(row.amount), decimals);
    previousSum += amount;
    payments.push({ amount, percent: pct(amount), isBalance: false });
  });

  const planned = payments.reduce((s, p) => s + p.amount, 0);
  const overflow = Math.max(0, roundTo(previousSum - safeTotal, decimals));
  return { payments, planned, overflow };
}

/**
 * Al cambiar el tipo de un pago ($ <-> %) se convierte lo ya escrito para
 * conservar el mismo monto, en vez de dejar el campo en blanco.
 */
export function switchPaymentMode<T extends PaymentPlanRow>(
  row: T,
  next: PaymentInputMode,
  resolved: ResolvedPayment,
): T {
  if (next === "percent") {
    return { ...row, input_mode: "percent", percent: resolved.amount > 0 ? String(resolved.percent) : "" };
  }
  return { ...row, input_mode: "amount", amount: resolved.amount > 0 ? String(resolved.amount) : "" };
}

/**
 * Agrega un pago al final. El que era último (el saldo, derivado) pasa a ser
 * un pago normal con el monto que tenía, para no perderlo.
 */
export function appendPayment<T extends PaymentPlanRow>(
  rows: T[],
  resolved: ResolvedPlan,
  newRow: T,
): T[] {
  if (rows.length === 0) return [newRow];
  const lastIdx = rows.length - 1;
  const last = rows[lastIdx];
  const lastAmount = resolved.payments[lastIdx]?.amount ?? 0;
  const frozenLast = { ...last, input_mode: "amount" as const, amount: lastAmount > 0 ? String(lastAmount) : "" };
  return [...rows.slice(0, lastIdx), frozenLast, newRow];
}
