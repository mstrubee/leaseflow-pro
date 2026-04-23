import { useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

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
  if (SECTION_MAP[pathname]) return SECTION_MAP[pathname];
  if (/^\/contracts\/[^/]+/.test(pathname)) return "Detalle Contrato";
  const base = "/" + pathname.split("/").filter(Boolean)[0];
  return SECTION_MAP[base] || "Inicio";
}

const IDLE_TIMEOUT = 2 * 60 * 1000; // 2 minutes
const HEARTBEAT_INTERVAL = 90_000; // 90s when active
const IDLE_HEARTBEAT_INTERVAL = 5 * 60_000; // 5min when idle/hidden

export function usePresenceHeartbeat() {
  const location = useLocation();
  const { user } = useAuth();
  const lastActivityRef = useRef(Date.now());
  const isActiveRef = useRef(true);
  const lastSentRef = useRef(0);
  const lastSectionRef = useRef<string>("");

  const markActive = useCallback(() => {
    lastActivityRef.current = Date.now();
    isActiveRef.current = true;
  }, []);

  // Listen for user interaction events (throttled — only update timestamp)
  useEffect(() => {
    const events = ["mousedown", "keydown", "touchstart"] as const;
    events.forEach((e) => document.addEventListener(e, markActive, { passive: true }));
    return () => {
      events.forEach((e) => document.removeEventListener(e, markActive));
    };
  }, [markActive]);

  // Idle check
  useEffect(() => {
    const check = setInterval(() => {
      if (Date.now() - lastActivityRef.current > IDLE_TIMEOUT) {
        isActiveRef.current = false;
      }
    }, 30_000);
    return () => clearInterval(check);
  }, []);

  // Smart heartbeat — only when authenticated, tab visible, and not over-firing
  useEffect(() => {
    if (!user?.id) return;

    const currentSection = resolveSection(location.pathname);
    const sectionChanged = currentSection !== lastSectionRef.current;
    lastSectionRef.current = currentSection;

    const updatePresence = async (force = false) => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden" && !force) {
        return;
      }
      const now = Date.now();
      const interval = isActiveRef.current ? HEARTBEAT_INTERVAL : IDLE_HEARTBEAT_INTERVAL;
      if (!force && now - lastSentRef.current < interval) return;
      lastSentRef.current = now;

      await supabase
        .from("profiles")
        .update({
          last_seen_at: new Date().toISOString(),
          activity_status: isActiveRef.current ? "active" : "idle",
          current_section: currentSection,
        } as any)
        .eq("id", user.id);
    };

    // Immediate update on mount or section change
    updatePresence(sectionChanged);

    const interval = setInterval(() => updatePresence(false), HEARTBEAT_INTERVAL);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        markActive();
        updatePresence(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [location.pathname, user?.id, markActive]);
}
