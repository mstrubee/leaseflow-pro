import type { BCSeed } from "./model";

// Mismos shapes mínimos que usa ContractDetail.tsx — se aceptan sueltos para
// poder reusar esta función desde cualquier pantalla que ya tenga cargados
// contract/version/address (evita duplicar la lógica de canon UF/m² vs total).
export interface BCSeedContract {
  name: string;
  superficie_edificada_local?: number | null;
  contract_companies?: { companies?: { name?: string | null } | null }[] | null;
}

export interface BCSeedVersion {
  id?: string;
  initial_rent?: number | null;
  regime_rent?: number | null;
  initial_rent_is_uf_m2?: boolean | null;
  regime_rent_is_uf_m2?: boolean | null;
  gastos_comunes_fixed_admin_uf?: number | null;
  gastos_comunes_methodology?: string | null;
  duration_months?: number | null;
  effective_date?: string | null;
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
  const canonIsUfM2 = rentField === "initial_rent" ? !!version?.initial_rent_is_uf_m2 : !!version?.regime_rent_is_uf_m2;
  const canonUf = version?.initial_rent || version?.regime_rent || null;
  const ufM2 = canonUf == null ? null : canonIsUfM2 ? canonUf : (superficie ? +(canonUf / superficie).toFixed(4) : null);

  return {
    nombre: contract.name,
    direccion: address ? `${address.street ?? ""} ${address.number ?? ""}`.trim() : "",
    comuna: address?.commune ?? "",
    tipo,
    superficie,
    ufM2,
    gastoComunUf: version?.gastos_comunes_fixed_admin_uf ?? null,
    durContratoAnios: version?.duration_months ? Math.round(version.duration_months / 12) : null,
    inicio: version?.effective_date ?? null,
    ufBase: ufValue && ufValue > 0 ? ufValue : undefined,
    contractVersionId: version?.id,
    rentField,
    rentIsUfM2: canonIsUfM2,
    gastoComunSyncable: version?.gastos_comunes_methodology === "uf_m2",
  };
}
