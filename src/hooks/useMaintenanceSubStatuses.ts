import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface MaintenanceSubStatus {
  id: string;
  name: string;
  label: string;
  description: string | null;
  responsible: string | null;
  color: string | null;
  display_order: number;
  is_active: boolean;
}

const CACHE_KEY = "maintenance_sub_statuses_cache";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function readCache(): MaintenanceSubStatus[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) return null;
    return data;
  } catch { return null; }
}

function writeCache(data: MaintenanceSubStatus[]) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

export function invalidateSubStatusCache() {
  sessionStorage.removeItem(CACHE_KEY);
}

export function useMaintenanceSubStatuses() {
  const [subStatuses, setSubStatuses] = useState<MaintenanceSubStatus[]>(() => readCache() || []);
  const [loading, setLoading] = useState(() => !readCache());

  const fetchSubStatuses = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("maintenance_sub_statuses")
      .select("*")
      .eq("is_active", true)
      .order("display_order");
    if (!error && data) {
      setSubStatuses(data);
      writeCache(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSubStatuses();
  }, [fetchSubStatuses]);

  const subStatusLabels = useMemo(() => {
    const map: Record<string, string> = {};
    subStatuses.forEach(s => { map[s.name.toLowerCase()] = s.label; });
    return map;
  }, [subStatuses]);

  const subStatusInfo = useMemo(() => {
    const map: Record<string, { description: string; responsible: string }> = {};
    subStatuses.forEach(s => {
      map[s.name.toLowerCase()] = { description: s.description || "", responsible: s.responsible || "" };
    });
    return map;
  }, [subStatuses]);

  const subStatusOrder = useMemo(() => subStatuses.map(s => s.name), [subStatuses]);

  const getNextSubStatus = useCallback((current: string): string | null => {
    const idx = subStatusOrder.indexOf(current);
    if (idx < 0 || idx >= subStatusOrder.length - 1) return null;
    return subStatusOrder[idx + 1];
  }, [subStatusOrder]);

  const getLabel = useCallback((name: string): string => {
    return subStatusLabels[name] || name;
  }, [subStatusLabels]);

  return {
    subStatuses,
    subStatusLabels,
    subStatusInfo,
    subStatusOrder,
    getNextSubStatus,
    getLabel,
    loading,
    refetch: fetchSubStatuses,
  };
}
