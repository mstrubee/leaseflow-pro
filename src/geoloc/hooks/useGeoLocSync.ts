import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface GeoLocSyncRequest {
  id: string;
  requested_by: string | null;
  requested_at: string;
  status: string;
  notes: string | null;
}

export interface GeoLocSyncLog {
  id: string;
  request_id: string | null;
  executed_at: string;
  files_updated: number;
  files_skipped_protected: number;
  conflicts: unknown;
  summary: string | null;
}

export const useGeoLocSync = () => {
  const { user, isAdmin } = useAuth();
  const [pending, setPending] = useState<GeoLocSyncRequest[]>([]);
  const [lastLog, setLastLog] = useState<GeoLocSyncLog | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    const [reqRes, logRes] = await Promise.all([
      supabase
        .from("geoloc_sync_requests")
        .select("*")
        .eq("status", "pending")
        .order("requested_at", { ascending: false }),
      supabase
        .from("geoloc_sync_log")
        .select("*")
        .order("executed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (!reqRes.error) setPending((reqRes.data ?? []) as GeoLocSyncRequest[]);
    if (!logRes.error) setLastLog((logRes.data ?? null) as GeoLocSyncLog | null);
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const requestSync = useCallback(
    async (notes?: string) => {
      if (!user) throw new Error("No autenticado");
      const { error } = await supabase.from("geoloc_sync_requests").insert({
        requested_by: user.id,
        notes: notes ?? null,
      });
      if (error) throw new Error(error.message);
      await refresh();
    },
    [user, refresh],
  );

  return { pending, lastLog, loading, refresh, requestSync };
};
