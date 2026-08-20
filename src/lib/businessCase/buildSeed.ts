import type { BCSeed } from "./model";
import { computeArriendoPeriods, type RentPeriodsVersionInput } from "./rentPeriods";

// Mismos shapes mínimos que usa ContractDetail.tsx — se aceptan sueltos para
// poder reusar esta función desde cualquier pantalla que ya tenga cargados
// contract/version/address (evita duplicar la lógica de canon UF/m² vs total).
export interface BCSeedContract {
  name: string;
  superficie_edificada_local?: number | null;
  metros_lineales_frente?: number | null;
  contract_companies?: { companies?: { name?: string | null } | null }[] | null;
}

// Superset de RentPeriodsVersionInput (para el desglose "Arriendo por
// periodo") más los campos propios del Business Case (canon UF/m², gracia,
// duración, etc). Todo opcional porque distintas pantallas cargan distintos
// subconjuntos de columnas de contract_versions.
export interface BCSeedVersion extends Partial<Omit<RentPeriodsVersionInput, "rent_escalations">> {
  id?: string;
  // Tramos de arriendo escalonado del contrato. month_number cuenta meses
  // desde effective_date (1-indexado) — NO desde el inicio de pago de canon
  // (que además resta grace_months). Ver CommercialConditionsSummary.tsx.
  rent_escalations?: { month_number: number; amount: number; is_uf_m2: boolean }[] | null;
}

export interface BCSeedAddress {
  street?: string | null;
  number?: string | null;
  commune?: string | null;
}

/**
 * Arma el BCSeed (contrato → Business Case) con la misma lógica que
 * ContractDetail.tsx: respeta si el canon ya viene en UF/m² (flags
 * initial_rent_is_uf_m2 / regime_rent_is_uf_m2) para no dividir dos veces por
 * superficie, y expone los metadatos de sincronización bidireccional.
 */
export function buildBCSeed(params: {
  contract: BCSeedContract;
  version: BCSeedVersion | null | undefined;
  address?: BCSeedAddress | null;
  ufValue?: number;
}): BCSeed {
  const { contract, version, address, ufValue } = params;
  const empresa = contract.contract_companies?.[0]?.companies?.name ?? "";
  const tipo = /agro/i.test(empresa) ? "Agroplanet" : /auto/i.test(empresa) ? "Autoplanet" : undefined;
  const superficie = contract.superficie_edificada_local ?? null;

  const rentField: "initial_rent" | "regime_rent" = version?.initial_rent ? "initial_rent" : "regime_rent";
  // initial_rent hereda el flag UF/m² del régimen si el suyo propio no viene
  // explícitamente en true (mismo criterio que isInitialRentUfM2 en
  // CommercialConditionsSummary.tsx — evita interpretar como monto fijo un
  // canon que en realidad está en UF/m² por herencia del régimen).
  const canonIsUfM2 = rentField === "initial_rent"
    ? (!!version?.initial_rent_is_uf_m2 || !!version?.regime_rent_is_uf_m2)
    : !!version?.regime_rent_is_uf_m2;
  const canonUf = version?.initial_rent || version?.regime_rent || null;
  const ufM2 = canonUf == null ? null : canonIsUfM2 ? canonUf : (superficie ? +(canonUf / superficie).toFixed(4) : null);

  const escalations = (version?.rent_escalations || [])
    .slice()
    .sort((a, b) => a.month_number - b.month_number)
    .map((e) => ({ monthNumber: e.month_number, amount: e.amount, isUfM2: e.is_uf_m2 }));

  // Desglose "Arriendo por periodo" (Canon + GGCC + F.Prom + Otros = Total,
  // por tramo), calculado con la misma lógica que la ficha del contrato —
  // para que el Business Case muestre exactamente el mismo detalle.
  const contractPeriods = version
    ? computeArriendoPeriods(
        {
          initial_rent: version.initial_rent ?? null,
          regime_rent: version.regime_rent ?? 0,
          initial_rent_is_uf_m2: version.initial_rent_is_uf_m2,
          regime_rent_is_uf_m2: version.regime_rent_is_uf_m2,
          duration_months: version.duration_months ?? 0,
          grace_months: version.grace_months,
          gastos_comunes_methodology: version.gastos_comunes_methodology,
          gastos_comunes_uf_m2: version.gastos_comunes_uf_m2,
          gastos_comunes_uf_ml_frente: version.gastos_comunes_uf_ml_frente,
          gastos_comunes_prorrata_kwh_clima: version.gastos_comunes_prorrata_kwh_clima,
          gastos_comunes_percentage: version.gastos_comunes_percentage,
          gastos_comunes_total_centro: version.gastos_comunes_total_centro,
          gastos_comunes_tope: version.gastos_comunes_tope,
          gastos_comunes_tope_type: version.gastos_comunes_tope_type,
          adicional_administracion_percentage: version.adicional_administracion_percentage,
          gastos_comunes_fixed_admin_uf: version.gastos_comunes_fixed_admin_uf,
          has_extended_gastos_comunes: version.has_extended_gastos_comunes,
          fondo_promocion_percentage: version.fondo_promocion_percentage,
          otros_egresos_amount: version.otros_egresos_amount,
          has_periodic_adjustments: version.has_periodic_adjustments,
          first_adjustment_month: version.first_adjustment_month,
          adjustment_periodicity_months: version.adjustment_periodicity_months,
          adjustment_type: version.adjustment_type,
          adjustment_value: version.adjustment_value,
          rent_escalations: version.rent_escalations,
        },
        superficie,
        contract.metros_lineales_frente,
      )
    : [];

  return {
    nombre: contract.name,
    direccion: address ? `${address.street ?? ""} ${address.number ?? ""}`.trim() : "",
    comuna: address?.commune ?? "",
    tipo,
    superficie,
    ufM2,
    gastoComunUf: version?.gastos_comunes_uf_m2 ?? null,
    durContratoAnios: version?.duration_months ? Math.round(version.duration_months / 12) : null,
    inicio: version?.effective_date ?? null,
    ufBase: ufValue && ufValue > 0 ? ufValue : undefined,
    graciaMeses: version?.grace_months ?? null,
    contractVersionId: version?.id,
    rentField,
    rentIsUfM2: canonIsUfM2,
    gastoComunSyncable: version?.gastos_comunes_methodology === "uf_m2",
    escalations,
    regimeRentIsUfM2: !!version?.regime_rent_is_uf_m2,
    fondoPromocionPct: version?.fondo_promocion_percentage ?? null,
    contractPeriods,
  };
}
