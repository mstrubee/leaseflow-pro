/**
 * Órdenes CO de un contrato/proyecto.
 *
 * Decisión de negocio (ver CLAUDE.md → decisiones):
 *  - Un contrato puede tener varias Órdenes CO (número + monto en PESOS).
 *  - La suma de los montos CO es el "Monto Congelado" del CAPEX y REEMPLAZA al
 *    monto congelado manual mientras exista al menos un monto CO > 0.
 *  - Si no hay CO, o ninguna tiene monto, rige el monto congelado que puso el admin.
 *  - El reemplazo se calcula al leer: el valor manual guardado no se borra.
 */

export interface CoOrder {
  id: string;
  co_number: string;
  amount_clp: number | null;
  /** CEBE (contract_cebes.id) al que está asignada la CO; null = sin asignar. */
  cebe_id: string | null;
}

/** Fila editable en el formulario (monto como texto para poder tipear). */
export interface CoOrderDraft {
  /** Clave estable de React; para filas existentes es el id de la DB. */
  key: string;
  /** Presente solo si la fila ya existe en la DB. */
  id?: string;
  co_number: string;
  amount: string;
  /** Clave del CEBE asignado (CebeDraft.key; = id si ya existe). "" = sin asignar. */
  cebeKey: string;
}

/** Acepta "1.234.567" (miles con punto) y "1234567.5". Devuelve null si está vacío o no es válido. */
export const parseCoAmount = (raw: string | number | null | undefined): number | null => {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = trimmed.includes(",") || /^\d{1,3}(\.\d{3})+$/.test(trimmed)
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
};

/** Suma de los montos CO válidos (> 0), en pesos. */
export const sumCoAmounts = (orders: Pick<CoOrder, "amount_clp">[]): number =>
  Math.round(orders.reduce((acc, o) => acc + (o.amount_clp && o.amount_clp > 0 ? o.amount_clp : 0), 0));

export type FrozenSource = "co" | "manual" | null;

/**
 * Monto congelado efectivo de un presupuesto CAPEX.
 * `isCapex = false` (OPEX) nunca usa las CO.
 */
export const getEffectiveFrozen = (
  orders: Pick<CoOrder, "amount_clp">[],
  manualFrozenClp: number | null | undefined,
  isCapex = true,
): { amountClp: number | null; source: FrozenSource } => {
  if (isCapex) {
    const coTotal = sumCoAmounts(orders);
    if (coTotal > 0) return { amountClp: coTotal, source: "co" };
  }
  if (manualFrozenClp !== null && manualFrozenClp !== undefined) {
    return { amountClp: manualFrozenClp, source: "manual" };
  }
  return { amountClp: null, source: null };
};

/** "CO-123, CO-456" o null si no hay números. Se guarda en oc_requests.co_order_numbers. */
export const formatCoNumbers = (orders: Pick<CoOrder, "co_number">[]): string | null => {
  const nums = orders.map((o) => o.co_number.trim()).filter(Boolean);
  return nums.length > 0 ? nums.join(", ") : null;
};

export const toDrafts = (orders: CoOrder[]): CoOrderDraft[] =>
  orders.map((o) => ({
    key: o.id,
    id: o.id,
    co_number: o.co_number,
    amount: o.amount_clp === null || o.amount_clp === undefined ? "" : String(o.amount_clp),
    cebeKey: o.cebe_id ?? "",
  }));

export const newDraft = (): CoOrderDraft => ({
  key: `new-${Math.random().toString(36).slice(2)}`,
  co_number: "",
  amount: "",
  cebeKey: "",
});

/** Devuelve un mensaje de error o null si los borradores son guardables. */
export const validateDrafts = (drafts: CoOrderDraft[]): string | null => {
  for (const d of drafts) {
    const hasNumber = d.co_number.trim().length > 0;
    const hasAmount = d.amount.trim().length > 0;
    if (!hasNumber && !hasAmount) continue; // fila vacía: se ignora
    if (!hasNumber) return "Cada Orden CO con monto debe tener un número de ORDEN CO.";
    if (hasAmount) {
      const n = parseCoAmount(d.amount);
      if (n === null || n < 0) return `El monto de la Orden CO "${d.co_number.trim()}" no es válido.`;
    }
  }
  return null;
};
