import type { LogoUrls } from "@/hooks/useAppLogos";

export type CompanyLogoKey = "agroplanet" | "autoplanet" | "grupo_planet";

const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Locales que pertenecen a "Grupo Planet" (puntos de mantención sin marca propia)
const GRUPO_PLANET_NAMES = ["garage", "egakat"];

// Determina la empresa (para logo) de un local de mantención por su nombre/carpeta.
export function locationCompanyKey(loc: { name?: string | null; folder?: string | null; local_name?: string | null }): CompanyLogoKey {
  const t = norm(`${loc.folder ?? ""} ${loc.name ?? ""} ${loc.local_name ?? ""}`);
  if (/grupo\s*planet/.test(t) || GRUPO_PLANET_NAMES.some((n) => t.includes(n))) return "grupo_planet";
  if (t.includes("autoplanet")) return "autoplanet";
  return "agroplanet";
}

// Determina la empresa a partir de uno o varios nombres de empresa (contratos).
export function companyKeyFromNames(names: string[]): CompanyLogoKey | null {
  let agro = false, auto = false, grupo = false;
  for (const n of names) {
    const t = norm(n);
    if (/grupo\s*planet/.test(t)) grupo = true;
    if (t.includes("autoplanet")) auto = true;
    if (t.includes("agroplanet")) agro = true;
  }
  if (grupo && !agro && !auto) return "grupo_planet";
  if (auto && !agro) return "autoplanet";
  if (agro && !auto) return "agroplanet";
  return null; // ambiguo (agro+auto) o ninguno → que el consumidor decida
}

// URL del logo para una clave de empresa.
export function logoUrlForKey(logos: LogoUrls, key: CompanyLogoKey): string {
  if (key === "grupo_planet") return logos.grupoPlanet;
  if (key === "autoplanet") return logos.autoplanet;
  return logos.agroplanet;
}
