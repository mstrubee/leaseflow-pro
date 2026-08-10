// Config del KPI "Beatriz Valenzuela — Cobertura de Proveedores", persistida en
// kpi_team_config (key='beatriz'). Vive en un archivo aparte (no dentro de
// TeamKPIDashboard.tsx) porque tanto el propio KPI como la pestaña "Rubros"
// de Proveedores (CategoryManager.tsx) necesitan leer y escribir esta misma
// fila — importar el componente del KPI desde Proveedores metería sin
// necesidad todo ese bundle en una página no relacionada.
export const BEATRIZ_CFG_DB_KEY = "beatriz";

export type CatKey = "compras" | "mantenciones";

// Umbrales de proveedores por rubro×zona para cada nivel de la escala de bono.
export interface CatCfg {
  n70: number;
  n100: number;
  n130: number;
  rubroIds: string[];
}

export interface BeatrizCfg {
  compras: CatCfg;
  mantenciones: CatCfg;
}

export const BEATRIZ_DEFAULTS: BeatrizCfg = {
  compras: { n70: 1, n100: 2, n130: 4, rubroIds: [] },
  mantenciones: { n70: 2, n100: 3, n130: 5, rubroIds: [] },
};

// Migra el shape viejo ({min,sobre}) y rellena valores faltantes con los
// defaults — misma lógica usada por la carga de config en BeatrizCard.
export function mergeBeatrizCfg(
  raw: Partial<Record<CatKey, Partial<CatCfg> & { min?: number; sobre?: number }>> | null | undefined
): BeatrizCfg {
  const merge = (d: CatCfg, r?: Partial<CatCfg> & { min?: number; sobre?: number }): CatCfg => ({
    n70: r?.n70 ?? d.n70,
    n100: r?.n100 ?? r?.min ?? d.n100, // migra shape viejo {min,sobre}
    n130: r?.n130 ?? r?.sobre ?? d.n130,
    rubroIds: r?.rubroIds ?? d.rubroIds,
  });
  return {
    compras: merge(BEATRIZ_DEFAULTS.compras, raw?.compras),
    mantenciones: merge(BEATRIZ_DEFAULTS.mantenciones, raw?.mantenciones),
  };
}
