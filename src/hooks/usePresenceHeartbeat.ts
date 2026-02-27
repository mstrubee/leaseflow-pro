import { useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const SECTION_MAP: Record<string, string> = {
  "/": "Inicio",
  "/contracts": "Contratos",
  "/admin": "Administración",
  "/alerts": "Alertas",
  "/purchase-orders": "Órdenes de Compra",
  "/opex": "OPEX",
  "/capex": "CAPEX",
  "/reports": "Reportes",
  "/kpi": "KPI",
  "/suppliers": "Proveedores",
  "/maintenance": "Mantenciones",
  "/deleted": "Eliminados",
  "/dashboard": "Dashboard",
};

function resolveSection(pathname: string): string {
  // Exact match first
  if (SECTION_MAP[pathname]) return SECTION_MAP[pathname];
  // /contracts/:id pattern
  if (/^\/contracts\/[^/]+/.test(pathname)) return "Detalle Contrato";
  // Fallback to first segment
  const base = "/" + pathname.split("/").filter(Boolean)[0];
  return SECTION_MAP[base] || "Inicio";
}

const IDLE_TIMEOUT = 2 * 60 * 1000; // 2 minutes
const HEARTBEAT_INTERVAL = 30_000; // 30 seconds

export function usePresenceHeartbeat() {
  const location = useLocation();
  const lastActivityRef = useRef(Date.now());
  const isActiveRef = useRef(true);

  const markActive = useCallback(() => {
    lastActivityRef.current = Date.now();
    isActiveRef.current = true;
  }, []);

  // Listen for user interaction events
  useEffect(() => {
    const events = ["mousemove", "keydown", "scroll"] as const;
    events.forEach((e) => document.addEventListener(e, markActive, { passive: true }));
    return () => {
      events.forEach((e) => document.removeEventListener(e, markActive));
    };
  }, [markActive]);

  // Check idle timeout periodically
  useEffect(() => {
    const check = setInterval(() => {
      if (Date.now() - lastActivityRef.current > IDLE_TIMEOUT) {
        isActiveRef.current = false;
      }
    }, 10_000);
    return () => clearInterval(check);
  }, []);

  // Heartbeat every 30s
  useEffect(() => {
    const currentSection = resolveSection(location.pathname);

    const updatePresence = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from("profiles")
        .update({
          last_seen_at: new Date().toISOString(),
          activity_status: isActiveRef.current ? "active" : "idle",
          current_section: currentSection,
        } as any)
        .eq("id", user.id);
    };

    updatePresence();
    const interval = setInterval(updatePresence, HEARTBEAT_INTERVAL);
    return () => clearInterval(interval);
  }, [location.pathname]);
}
