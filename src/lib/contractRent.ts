import { parseISO } from "date-fns";

export interface RentEscalationLike {
  month_number: number;
  amount: number;
  is_uf_m2?: boolean;
}

export interface ContractVersionLike {
  // Rent
  regime_rent: number;
  regime_rent_is_uf_m2?: boolean | null;
  initial_rent?: number | null;
  initial_rent_is_uf_m2?: boolean | null;
  effective_date?: string | null;
  grace_months?: number | null;

  // Escalations
  rent_escalations?: RentEscalationLike[];

  // Periodic adjustments
  has_periodic_adjustments?: boolean | null;
  first_adjustment_month?: number | null;
  adjustment_periodicity_months?: number | null;
  adjustment_type?: string | null;
  adjustment_value?: number | null;

  // GGCC
  gastos_comunes_methodology?: string | null;
  gastos_comunes_percentage?: number | null;
  gastos_comunes_total_centro?: number | null;
  gastos_comunes_tope?: number | null;
  gastos_comunes_tope_type?: string | null;
  gastos_comunes_uf_m2?: number | null;
  gastos_comunes_uf_ml_frente?: number | null;
  gastos_comunes_prorrata_kwh_clima?: number | null;
  gastos_comunes_fixed_admin_uf?: number | null;
  adicional_administracion_percentage?: number | null;
  has_extended_gastos_comunes?: boolean | null;

  // Fondo promoción
  fondo_promocion_percentage?: number | null;

  // Otros
  otros_egresos_amount?: number | null;
}

export interface CurrentRentResult {
  currentRent: number;
  hasEscalations: boolean;
  hasAdjustments: boolean;
  isContractNotStarted: boolean;
}

const safeParseDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  try {
    const d = parseISO(value);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};

export const calculateCurrentRentUF = (params: {
  version: ContractVersionLike;
  signedDate: string | null;
  superficie: number;
}): CurrentRentResult => {
  const { version, signedDate, superficie } = params;

  const escalations = version.rent_escalations || [];
  const hasEscalations = escalations.length > 0;
  const hasAdjustments =
    version.has_periodic_adjustments === true &&
    (version.adjustment_value || 0) > 0 &&
    (version.first_adjustment_month || 0) > 0;

  const isRentUfM2 = version.regime_rent_is_uf_m2 === true;
  // initial_rent inherits UF/m² from regime if its own flag is not explicitly set
  const isInitialRentUfM2 = version.initial_rent_is_uf_m2 === true || isRentUfM2;

  const baseRegimeRent = isRentUfM2 ? version.regime_rent * superficie : version.regime_rent;
  // initial_rent tiene prioridad sobre regime_rent cuando está cargado (mismo
  // criterio que rentField en buildSeed.ts): en la práctica el analista tipea
  // el canon real en initial_rent y deja regime_rent en su default (0), tenga
  // o no escalonamiento el contrato. Antes cada return de acá abajo caía a
  // baseRegimeRent solo, así que un contrato sin escalaciones (o que aún no
  // arrancaba) mostraba canon $0 aunque initial_rent tuviera el valor real.
  const baseInitialRent = version.initial_rent != null
    ? (isInitialRentUfM2 ? version.initial_rent * superficie : version.initial_rent)
    : 0;
  const baseRent = baseInitialRent || baseRegimeRent;

  const startDate = safeParseDate(version.effective_date) || safeParseDate(signedDate);
  if (!startDate) {
    return {
      currentRent: baseRent,
      hasEscalations,
      hasAdjustments,
      isContractNotStarted: true,
    };
  }

  const today = new Date();
  const diffTime = today.getTime() - startDate.getTime();
  const currentMonth = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30.44)) + 1;

  // Future start
  if (currentMonth < 1) {
    return {
      currentRent: baseRent,
      hasEscalations,
      hasAdjustments,
      isContractNotStarted: true,
    };
  }

  // Grace period (only applies once contract started)
  const graceMonths = version.grace_months || 0;
  if (currentMonth <= graceMonths) {
    return {
      currentRent: 0,
      hasEscalations,
      hasAdjustments,
      isContractNotStarted: false,
    };
  }

  // No escalations/adjustments: rent stays flat at initial_rent (or
  // regime_rent if there's no initial_rent loaded)
  if (!hasEscalations && !hasAdjustments) {
    return {
      currentRent: baseRent,
      hasEscalations: false,
      hasAdjustments: false,
      isContractNotStarted: false,
    };
  }

  let currentRent = baseRent;

  // Escalations (absolute values; if UF/m², multiply by superficie)
  if (hasEscalations) {
    const sortedEscalations = [...escalations].sort((a, b) => a.month_number - b.month_number);

    currentRent = baseInitialRent || baseRegimeRent;

    for (const esc of sortedEscalations) {
      if (esc.month_number <= currentMonth) {
        // Per-escalation UF/m² handling
        if (esc.is_uf_m2) {
          currentRent = esc.amount * superficie;
        } else if (isRentUfM2) {
          // Legacy: if regime is UF/m² and escalation doesn't have its own flag, multiply
          currentRent = esc.amount * superficie;
        } else {
          currentRent = esc.amount;
        }
      } else {
        break;
      }
    }
  }

  // Periodic adjustments - compound from the last paid rent
  if (hasAdjustments) {
    const firstAdjMonth = version.first_adjustment_month || 0;
    const periodicity = version.adjustment_periodicity_months || 12;
    const adjValue = version.adjustment_value || 0;
    const adjType = version.adjustment_type || "percentage";

    if (currentMonth >= firstAdjMonth) {
      // Apply adjustments sequentially, checking if escalations reset the base between them
      const sortedEscalations = hasEscalations
        ? [...escalations].sort((a, b) => a.month_number - b.month_number)
        : [];

      let adjMonth = firstAdjMonth;
      while (adjMonth <= currentMonth) {
        // Check if an escalation happened between last adjustment and this one,
        // resetting the base rent
        if (sortedEscalations.length > 0) {
          const prevAdjMonth = adjMonth === firstAdjMonth ? 0 : adjMonth - periodicity;
          const escalationBetween = sortedEscalations
            .filter(e => e.month_number > prevAdjMonth && e.month_number <= adjMonth);
          if (escalationBetween.length > 0) {
            const lastEsc = escalationBetween[escalationBetween.length - 1];
            if (lastEsc.is_uf_m2) {
              currentRent = lastEsc.amount * superficie;
            } else if (isRentUfM2) {
              currentRent = lastEsc.amount * superficie;
            } else {
              currentRent = lastEsc.amount;
            }
          }
        }

        if (adjType === "percentage") {
          currentRent = currentRent * (1 + adjValue / 100);
        } else {
          currentRent = currentRent + adjValue;
        }

        adjMonth += periodicity;
      }
    }
  }

  return {
    currentRent,
    hasEscalations,
    hasAdjustments,
    isContractNotStarted: false,
  };
};

export const calculateGastosComunesUF = (params: {
  version: ContractVersionLike;
  superficie: number;
  metrosLinealesFrente: number;
  baseRegimeRent: number;
}): number => {
  const { version, superficie, metrosLinealesFrente, baseRegimeRent } = params;

  const methodology = version.gastos_comunes_methodology || "uf_m2";

  if (methodology === "percentage") {
    const totalCentro = version.gastos_comunes_total_centro || 0;
    const percentage = version.gastos_comunes_percentage || 0;
    const topeValue = version.gastos_comunes_tope || 0;
    const topeType = version.gastos_comunes_tope_type || "fixed";

    const calculatedAmount = (totalCentro * percentage) / 100;

    if (topeValue > 0 && superficie > 0) {
      const effectiveTope = topeType === "uf_m2" ? topeValue * superficie : topeValue;
      return Math.min(calculatedAmount, effectiveTope);
    }

    return calculatedAmount;
  }

  // UF/m2 methodology
  const hasExtended = version.has_extended_gastos_comunes ?? false;
  const gastosM2 = (version.gastos_comunes_uf_m2 || 0) * superficie;
  const gastosMlFrente = hasExtended ? (version.gastos_comunes_uf_ml_frente || 0) * metrosLinealesFrente : 0;
  const gastosKwhClima = hasExtended ? (version.gastos_comunes_prorrata_kwh_clima || 0) : 0;
  const adicionalAdminAmount = hasExtended
    ? baseRegimeRent * ((version.adicional_administracion_percentage || 0) / 100)
    : 0;
  const fixedAdminUf = hasExtended ? (version.gastos_comunes_fixed_admin_uf || 0) : 0;

  return gastosM2 + gastosMlFrente + gastosKwhClima + adicionalAdminAmount + fixedAdminUf;
};

export interface TotalArriendoBreakdown {
  canon: number;
  ggcc: number;
  fondoPromocion: number;
  otrosEgresos: number;
  total: number;
  regimeRentUfM2: number | null;
}

export const calculateTotalArriendoUF = (params: {
  version: ContractVersionLike;
  signedDate: string | null;
  superficie: number;
  metrosLinealesFrente?: number;
}): TotalArriendoBreakdown => {
  const { version, signedDate, superficie } = params;
  const metrosLinealesFrente = params.metrosLinealesFrente || 0;

  const isRentUfM2 = version.regime_rent_is_uf_m2 === true;
  const canon = isRentUfM2 ? version.regime_rent * superficie : version.regime_rent;

  const { currentRent } = calculateCurrentRentUF({ version, signedDate, superficie });

  const ggcc = calculateGastosComunesUF({
    version,
    superficie,
    metrosLinealesFrente,
    baseRegimeRent: canon,
  });

  const fondoPromocionPct = version.fondo_promocion_percentage || 0;
  const fondoPromocion = currentRent * (fondoPromocionPct / 100);

  const otrosEgresos = version.otros_egresos_amount || 0;

  const total = currentRent + ggcc + fondoPromocion + otrosEgresos;

  return {
    canon: currentRent,
    ggcc,
    fondoPromocion,
    otrosEgresos,
    total,
    regimeRentUfM2: isRentUfM2 ? version.regime_rent : null,
  };
};

/**
 * Calculate the weighted average Total Arriendo across escalation/adjustment periods.
 * Returns the simple total if no escalations exist.
 */
export const calculateWeightedAverageTotalArriendo = (params: {
  version: ContractVersionLike & { duration_months: number };
  signedDate: string | null;
  superficie: number;
  metrosLinealesFrente?: number;
}): { promedio: number; hasMultiplePeriods: boolean } => {
  const { version, superficie } = params;
  const metrosLinealesFrente = params.metrosLinealesFrente || 0;

  const escalations = version.rent_escalations || [];
  const hasEscalations = escalations.length > 0;
  const hasAdjustments =
    version.has_periodic_adjustments === true &&
    (version.adjustment_value || 0) > 0 &&
    (version.first_adjustment_month || 0) > 0;

  // Fall back to simple total if no escalations/adjustments
  if (!hasEscalations && !hasAdjustments) {
    const breakdown = calculateTotalArriendoUF(params);
    return { promedio: breakdown.total, hasMultiplePeriods: false };
  }

  const isRentUfM2 = version.regime_rent_is_uf_m2 === true;
  const isInitialRentUfM2 = version.initial_rent_is_uf_m2 === true;
  const baseRegimeRent = isRentUfM2 ? version.regime_rent * superficie : version.regime_rent;
  const actualInitialRent = version.initial_rent != null
    ? (isInitialRentUfM2 ? version.initial_rent * superficie : version.initial_rent)
    : baseRegimeRent;

  const sortedEsc = [...escalations].sort((a, b) => a.month_number - b.month_number);
  const graceMonths = version.grace_months || 0;
  const durationMonths = version.duration_months;
  const fondoPct = version.fondo_promocion_percentage || 0;
  const otros = version.otros_egresos_amount || 0;

  const ggcc = calculateGastosComunesUF({
    version,
    superficie,
    metrosLinealesFrente,
    baseRegimeRent,
  });

  // Build milestones
  const milestones = new Set<number>();
  const initialStart = graceMonths > 0 ? graceMonths + 1 : 1;
  milestones.add(initialStart);
  for (const esc of sortedEsc) {
    if (esc.month_number <= durationMonths) milestones.add(esc.month_number);
  }
  if (hasAdjustments) {
    const firstAdj = version.first_adjustment_month || 0;
    const period = version.adjustment_periodicity_months || 12;
    let m = firstAdj;
    while (m <= durationMonths) { milestones.add(m); m += period; }
  }

  const sortedMilestones = Array.from(milestones).sort((a, b) => a - b);
  if (sortedMilestones.length <= 1) {
    const breakdown = calculateTotalArriendoUF(params);
    return { promedio: breakdown.total, hasMultiplePeriods: false };
  }

  // Walk milestones
  let runningCanon = actualInitialRent;
  const firstAdj = hasAdjustments ? (version.first_adjustment_month || 0) : Infinity;
  const period = version.adjustment_periodicity_months || 12;
  const adjValue = version.adjustment_value || 0;
  const adjType = version.adjustment_type || "percentage";

  let weightedSum = 0;
  for (let i = 0; i < sortedMilestones.length; i++) {
    const ms = sortedMilestones[i];
    const escAtMs = sortedEsc.filter(e => e.month_number === ms);
    if (escAtMs.length > 0) {
      const esc = escAtMs[escAtMs.length - 1];
      const needsMultiply = esc.is_uf_m2 || (isRentUfM2 && !esc.is_uf_m2);
      runningCanon = needsMultiply && superficie > 0 ? esc.amount * superficie : esc.amount;
    }
    const isAdjMs = hasAdjustments && ms >= firstAdj && (ms - firstAdj) % period === 0;
    if (isAdjMs && escAtMs.length === 0) {
      const prevAdjMonth = ms - period;
      const escBetween = sortedEsc.filter(e => e.month_number > prevAdjMonth && e.month_number <= ms);
      if (escBetween.length > 0) {
        const last = escBetween[escBetween.length - 1];
        const needsMultiply = last.is_uf_m2 || (isRentUfM2 && !last.is_uf_m2);
        runningCanon = needsMultiply && superficie > 0 ? last.amount * superficie : last.amount;
      }
      runningCanon = adjType === "percentage"
        ? runningCanon * (1 + adjValue / 100)
        : runningCanon + adjValue;
    }

    const endMonth = i < sortedMilestones.length - 1 ? sortedMilestones[i + 1] - 1 : durationMonths;
    const months = endMonth - ms + 1;
    const periodFProm = runningCanon * (fondoPct / 100);
    const periodTotal = runningCanon + ggcc + periodFProm + otros;
    weightedSum += periodTotal * months;
  }

  const totalMonths = durationMonths - (initialStart - 1);
  const promedio = totalMonths > 0 ? weightedSum / totalMonths : 0;

  return { promedio, hasMultiplePeriods: true };
};

/**
 * Format a contract amount using the contract's display currency.
 * Mirrors the formatter used in ContractsTable so PDF/Excel match the list.
 */
export const formatContractAmount = (amount: number, currency: string | null | undefined): string => {
  const displayCurrency = currency || "UF";
  if (displayCurrency === "CLP") {
    return `$${amount.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  return `${amount.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF`;
};

