import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { withRetry } from "@/lib/supabaseRetry";

// Fallback logos (static imports)
import logoAgroplanetFallback from "@/assets/logo-agroplanet.png";
import logoAutoplanetFallback from "@/assets/logo-autoplanet.png";
import logosHeaderFallback from "@/assets/logos-header.png";

interface AppLogo {
  id: string;
  logo_key: string;
  display_name: string;
  storage_path: string | null;
  is_active: boolean;
}

export interface LogoUrls {
  agroplanet: string;
  autoplanet: string;
  dashboard_header: string;
  grupoPlanet: string;
}

// ¿Es la fila del logo "Grupo Planet"? (por clave o por nombre, robusto al slug)
function isGrupoPlanet(logoKey: string, displayName?: string | null): boolean {
  const norm = (s: string) => (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const k = norm(logoKey);
  const n = norm(displayName ?? "");
  return k.includes("grupo") && (k.includes("planet") || k.includes("plant"))
    || /grupo\s*planet/.test(n);
}

// Fallback NEUTRO para Grupo Planet: NO usar el logo de Agroplanet (mostraría una
// marca equivocada en Garage/Egakat mientras carga o si la carga falla). Un PNG
// transparente 1x1 evita el "flash" del logo incorrecto.
const NEUTRAL_FALLBACK =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const DEFAULT_LOGOS: LogoUrls = {
  agroplanet: logoAgroplanetFallback,
  autoplanet: logoAutoplanetFallback,
  dashboard_header: logosHeaderFallback,
  grupoPlanet: NEUTRAL_FALLBACK,
};

// Cache for logo URLs to avoid refetching
let cachedLogos: LogoUrls | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
let pendingPromise: Promise<LogoUrls> | null = null;

// Invalida la caché global de logos (llamar tras crear/cambiar/eliminar un logo).
export function clearLogoCache() {
  cachedLogos = null;
  cacheTimestamp = 0;
}

export function useAppLogos() {
  // Inicializar desde la caché tibia si existe: evita un render inicial con los
  // logos por defecto (que mostraba Agroplanet en Garage/Egakat).
  const [logos, setLogos] = useState<LogoUrls>(() => cachedLogos ?? DEFAULT_LOGOS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLogos();
  }, []);

  const loadLogos = async () => {
    // Check cache first
    if (cachedLogos && Date.now() - cacheTimestamp < CACHE_DURATION) {
      setLogos(cachedLogos);
      setLoading(false);
      return;
    }

    // Deduplicate concurrent requests
    if (!pendingPromise) {
      pendingPromise = (async (): Promise<LogoUrls> => {
        const { data, error } = await withRetry(() =>
          supabase
            .from("app_logos")
            .select("logo_key, storage_path, display_name")
            .eq("is_active", true)
        );

        if (error) throw error;

        const newLogos: LogoUrls = {
          agroplanet: logoAgroplanetFallback,
          autoplanet: logoAutoplanetFallback,
          dashboard_header: logosHeaderFallback,
          grupoPlanet: NEUTRAL_FALLBACK,
        };

        for (const logo of data || []) {
          if (logo.storage_path) {
            const { data: urlData } = supabase.storage
              .from("logos")
              .getPublicUrl(logo.storage_path);
            
            if (urlData?.publicUrl) {
              if (logo.logo_key === "agroplanet") {
                newLogos.agroplanet = urlData.publicUrl;
              } else if (logo.logo_key === "autoplanet") {
                newLogos.autoplanet = urlData.publicUrl;
              } else if (logo.logo_key === "dashboard_header") {
                newLogos.dashboard_header = urlData.publicUrl;
              } else if (isGrupoPlanet(logo.logo_key, (logo as any).display_name)) {
                newLogos.grupoPlanet = urlData.publicUrl;
              }
            }
          }
        }

        cachedLogos = newLogos;
        cacheTimestamp = Date.now();
        return newLogos;
      })();
    }

    try {
      const result = await pendingPromise;
      if (result) setLogos(result);
    } catch (error) {
      console.error("Error loading logos:", error);
      // Keep fallback logos
    } finally {
      pendingPromise = null;
      setLoading(false);
    }
  };

  const refreshLogos = () => {
    clearLogoCache();
    loadLogos();
  };

  return { logos, loading, refreshLogos };
}

// Singleton for getting logo URLs without hook
export async function getLogoUrls(): Promise<LogoUrls> {
  if (cachedLogos && Date.now() - cacheTimestamp < CACHE_DURATION) {
    return cachedLogos;
  }

  const { data } = await withRetry(() =>
    supabase
      .from("app_logos")
      .select("logo_key, storage_path, display_name")
      .eq("is_active", true)
  ).catch(() => ({ data: null as any }));

  const logos: LogoUrls = {
    agroplanet: logoAgroplanetFallback,
    autoplanet: logoAutoplanetFallback,
    dashboard_header: logosHeaderFallback,
    grupoPlanet: NEUTRAL_FALLBACK,
  };

  for (const logo of data || []) {
    if (logo.storage_path) {
      const { data: urlData } = supabase.storage
        .from("logos")
        .getPublicUrl(logo.storage_path);
      
      if (urlData?.publicUrl) {
        if (logo.logo_key === "agroplanet") {
          logos.agroplanet = urlData.publicUrl;
        } else if (logo.logo_key === "autoplanet") {
          logos.autoplanet = urlData.publicUrl;
        } else if (logo.logo_key === "dashboard_header") {
          logos.dashboard_header = urlData.publicUrl;
        } else if (isGrupoPlanet(logo.logo_key, (logo as any).display_name)) {
          logos.grupoPlanet = urlData.publicUrl;
        }
      }
    }
  }

  cachedLogos = logos;
  cacheTimestamp = Date.now();
  return logos;
}
