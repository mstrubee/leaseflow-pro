import { parseISO } from "date-fns";

export interface RentEscalationLike {
  month_number: number;
  amount: number;
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
  const isInitialRentUfM2 = version.initial_rent_is_uf_m2 === true;

  const baseRegimeRent = isRentUfM2 ? version.regime_rent * superficie : version.regime_rent;

  const startDate = safeParseDate(version.effective_date) || safeParseDate(signedDate);
  if (!startDate) {
    return {
      currentRent: baseRegimeRent,
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
      currentRent: baseRegimeRent,
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

  // No escalations/adjustments
  if (!hasEscalations && !hasAdjustments) {
    return {
      currentRent: baseRegimeRent,
      hasEscalations: false,
      hasAdjustments: false,
      isContractNotStarted: false,
    };
  }

  let currentRent = baseRegimeRent;

  // Escalations (absolute values; if UF/m², multiply by superficie)
  if (hasEscalations) {
    const sortedEscalations = [...escalations].sort((a, b) => a.month_number - b.month_number);

    const baseInitialRent = version.initial_rent != null
      ? (isInitialRentUfM2 ? version.initial_rent * superficie : version.initial_rent)
      : baseRegimeRent;

    currentRent = baseInitialRent;

    for (const esc of sortedEscalations) {
      if (esc.month_number <= currentMonth) {
        currentRent = isRentUfM2 ? esc.amount * superficie : esc.amount;
      } else {
        break;
      }
    }
  }

  // Periodic adjustments
  if (hasAdjustments) {
    const firstAdjMonth = version.first_adjustment_month || 0;
    const periodicity = version.adjustment_periodicity_months || 12;
    const adjValue = version.adjustment_value || 0;
    const adjType = version.adjustment_type || "percentage";

    if (currentMonth >= firstAdjMonth) {
      const monthsSinceFirst = currentMonth - firstAdjMonth;
      const numAdjustments = Math.floor(monthsSinceFirst / periodicity) + 1;

      for (let i = 0; i < numAdjustments; i++) {
        if (adjType === "percentage") {
          currentRent = currentRent * (1 + adjValue / 100);
        } else {
          currentRent = currentRent + adjValue;
        }
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
