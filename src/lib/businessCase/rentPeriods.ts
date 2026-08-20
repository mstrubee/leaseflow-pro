// Desglose de arriendo por periodo (tramos de escalonamiento + ajustes
// periódicos). Port fiel de la lógica de "Arriendo por periodo" en
// CommercialConditionsSummary.tsx — única fuente de verdad para que la ficha
// del contrato y el Business Case Financiero muestren siempre el mismo
// desglose, sin recalcular con criterios distintos.

export interface RentPeriodEscalation {
  month_number: number;
  amount: number;
  is_uf_m2?: boolean;
}

export interface RentPeriodsVersionInput {
  initial_rent: number | null;
  regime_rent: number;
  initial_rent_is_uf_m2?: boolean | null;
  regime_rent_is_uf_m2?: boolean | null;
  duration_months: number;
  grace_months?: number | null;
  gastos_comunes_methodology?: string | null;
  gastos_comunes_uf_m2?: number | null;
  gastos_comunes_uf_ml_frente?: number | null;
  gastos_comunes_prorrata_kwh_clima?: number | null;
  gastos_comunes_percentage?: number | null;
  gastos_comunes_total_centro?: number | null;
  gastos_comunes_tope?: number | null;
  gastos_comunes_tope_type?: string | null;
  adicional_administracion_percentage?: number | null;
  gastos_comunes_fixed_admin_uf?: number | null;
  has_extended_gastos_comunes?: boolean | null;
  fondo_promocion_percentage?: number | null;
  otros_egresos_amount?: number | null;
  has_periodic_adjustments?: boolean | null;
  first_adjustment_month?: number | null;
  adjustment_periodicity_months?: number | null;
  adjustment_type?: string | null;
  adjustment_value?: number | null;
  rent_escalations?: RentPeriodEscalation[] | null;
}

export interface RentPeriodRow {
  label: string;
  canon: number;
  ggcc: number;
  fProm: number;
  otros: number;
  total: number;
  ufM2: number | null;
}

export function computeArriendoPeriods(
  version: RentPeriodsVersionInput,
  superficieEdificadaLocal: number | null | undefined,
  metrosLinealesFrente?: number | null,
): RentPeriodRow[] {
  const superficie = superficieEdificadaLocal || 0;
  const hasEscalations = !!(version.rent_escalations && version.rent_escalations.length > 0);
  const hasAdjustments = !!(
    version.has_periodic_adjustments &&
    (version.adjustment_value || 0) > 0 &&
    (version.first_adjustment_month || 0) > 0
  );

  const actualRegimeRent =
    version.regime_rent_is_uf_m2 && superficie
      ? parseFloat((version.regime_rent * superficie).toFixed(3))
      : version.regime_rent;
  // initial_rent hereda el flag UF/m² del régimen si el suyo propio no viene
  // explícito en true (mismo criterio en toda la app).
  const isInitialRentUfM2 = version.initial_rent_is_uf_m2 === true || version.regime_rent_is_uf_m2 === true;
  const actualInitialRent = version.initial_rent
    ? isInitialRentUfM2 && superficie
      ? parseFloat((version.initial_rent * superficie).toFixed(3))
      : version.initial_rent
    : null;

  const methodology = version.gastos_comunes_methodology || "uf_m2";
  let gastosComunesTotalUF: number | null;
  if (methodology === "percentage") {
    const totalCentro = version.gastos_comunes_total_centro || 0;
    const percentage = version.gastos_comunes_percentage || 0;
    const topeValue = version.gastos_comunes_tope;
    const topeType = version.gastos_comunes_tope_type || "fixed";
    const calculatedAmount = (totalCentro * percentage) / 100;
    if (topeValue && topeValue > 0 && superficie) {
      const effectiveTope = topeType === "uf_m2" ? topeValue * superficie : topeValue;
      gastosComunesTotalUF = Math.min(calculatedAmount, effectiveTope);
    } else {
      gastosComunesTotalUF = calculatedAmount > 0 ? calculatedAmount : null;
    }
  } else {
    const hasExtended = version.has_extended_gastos_comunes ?? false;
    const gastosM2 = version.gastos_comunes_uf_m2 && superficie ? version.gastos_comunes_uf_m2 * superficie : 0;
    const gastosMlFrente =
      hasExtended && version.gastos_comunes_uf_ml_frente && metrosLinealesFrente
        ? version.gastos_comunes_uf_ml_frente * metrosLinealesFrente
        : 0;
    const gastosKwhClima = hasExtended ? version.gastos_comunes_prorrata_kwh_clima || 0 : 0;
    const adicionalAdminAmount =
      hasExtended && version.adicional_administracion_percentage
        ? (version.adicional_administracion_percentage / 100) * actualRegimeRent
        : 0;
    const fixedAdminUf = hasExtended ? version.gastos_comunes_fixed_admin_uf || 0 : 0;
    const total = gastosM2 + gastosMlFrente + gastosKwhClima + adicionalAdminAmount + fixedAdminUf;
    gastosComunesTotalUF = total > 0 ? total : null;
  }

  const graceMonths = version.grace_months || 0;
  const fondoPct = version.fondo_promocion_percentage || 0;
  const otros = version.otros_egresos_amount || 0;
  const ggcc = gastosComunesTotalUF || 0;
  const durationMonths = version.duration_months;

  if (!hasEscalations && !hasAdjustments) {
    const periodCanon = actualRegimeRent;
    const periodFProm = periodCanon * (fondoPct / 100);
    const periodTotal = periodCanon + ggcc + periodFProm + otros;
    return [
      {
        label: `M1-M${durationMonths}`,
        canon: periodCanon,
        ggcc,
        fProm: periodFProm,
        otros,
        total: periodTotal,
        ufM2: superficie > 0 ? periodTotal / superficie : null,
      },
    ];
  }

  const escalations = version.rent_escalations || [];
  const sortedEsc = [...escalations].sort((a, b) => a.month_number - b.month_number);
  const isRentUfM2 = version.regime_rent_is_uf_m2 === true;

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
    while (m <= durationMonths) {
      milestones.add(m);
      m += period;
    }
  }
  const sortedMilestones = Array.from(milestones).sort((a, b) => a - b);

  const canonByMilestone = new Map<number, number>();
  let runningCanon = actualInitialRent || actualRegimeRent;

  const firstAdj = hasAdjustments ? version.first_adjustment_month || 0 : Infinity;
  const period = version.adjustment_periodicity_months || 12;
  const adjValue = version.adjustment_value || 0;
  const adjType = version.adjustment_type || "percentage";

  for (const ms of sortedMilestones) {
    const escAtMs = sortedEsc.filter((e) => e.month_number === ms);
    if (escAtMs.length > 0) {
      const esc = escAtMs[escAtMs.length - 1];
      const needsMultiply = esc.is_uf_m2 || (isRentUfM2 && !esc.is_uf_m2);
      runningCanon = needsMultiply && superficie > 0 ? esc.amount * superficie : esc.amount;
    }
    const isAdjMs = hasAdjustments && ms >= firstAdj && (ms - firstAdj) % period === 0;
    if (isAdjMs && escAtMs.length === 0) {
      const prevAdjMonth = ms - period;
      const escBetween = sortedEsc.filter((e) => e.month_number > prevAdjMonth && e.month_number <= ms);
      if (escBetween.length > 0) {
        const last = escBetween[escBetween.length - 1];
        const needsMultiply = last.is_uf_m2 || (isRentUfM2 && !last.is_uf_m2);
        runningCanon = needsMultiply && superficie > 0 ? last.amount * superficie : last.amount;
      }
      runningCanon = adjType === "percentage" ? runningCanon * (1 + adjValue / 100) : runningCanon + adjValue;
    }
    canonByMilestone.set(ms, runningCanon);
  }

  const periods: RentPeriodRow[] = [];
  for (let i = 0; i < sortedMilestones.length; i++) {
    const startMonth = sortedMilestones[i];
    const endMonth = i < sortedMilestones.length - 1 ? sortedMilestones[i + 1] - 1 : durationMonths;
    if (startMonth > durationMonths) break;
    const periodCanon = canonByMilestone.get(startMonth) || actualInitialRent || actualRegimeRent;
    const periodFProm = periodCanon * (fondoPct / 100);
    const periodTotal = periodCanon + ggcc + periodFProm + otros;
    periods.push({
      label: `M${startMonth}-M${endMonth}`,
      canon: periodCanon,
      ggcc,
      fProm: periodFProm,
      otros,
      total: periodTotal,
      ufM2: superficie > 0 ? periodTotal / superficie : null,
    });
  }
  return periods;
}
