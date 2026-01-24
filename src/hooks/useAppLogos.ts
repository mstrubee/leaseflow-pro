import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

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

interface LogoUrls {
  agroplanet: string;
  autoplanet: string;
  dashboard_header: string;
}

// Cache for logo URLs to avoid refetching
let cachedLogos: LogoUrls | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function useAppLogos() {
  const [logos, setLogos] = useState<LogoUrls>({
    agroplanet: logoAgroplanetFallback,
    autoplanet: logoAutoplanetFallback,
    dashboard_header: logosHeaderFallback,
  });
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

    try {
      const { data, error } = await supabase
        .from("app_logos")
        .select("logo_key, storage_path")
        .eq("is_active", true);

      if (error) throw error;

      const newLogos: LogoUrls = {
        agroplanet: logoAgroplanetFallback,
        autoplanet: logoAutoplanetFallback,
        dashboard_header: logosHeaderFallback,
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
            }
          }
        }
      }

      cachedLogos = newLogos;
      cacheTimestamp = Date.now();
      setLogos(newLogos);
    } catch (error) {
      console.error("Error loading logos:", error);
      // Keep fallback logos
    } finally {
      setLoading(false);
    }
  };

  const refreshLogos = () => {
    cachedLogos = null;
    cacheTimestamp = 0;
    loadLogos();
  };

  return { logos, loading, refreshLogos };
}

// Singleton for getting logo URLs without hook
export async function getLogoUrls(): Promise<LogoUrls> {
  if (cachedLogos && Date.now() - cacheTimestamp < CACHE_DURATION) {
    return cachedLogos;
  }

  const { data } = await supabase
    .from("app_logos")
    .select("logo_key, storage_path")
    .eq("is_active", true);

  const logos: LogoUrls = {
    agroplanet: logoAgroplanetFallback,
    autoplanet: logoAutoplanetFallback,
    dashboard_header: logosHeaderFallback,
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
        }
      }
    }
  }

  cachedLogos = logos;
  cacheTimestamp = Date.now();
  return logos;
}
