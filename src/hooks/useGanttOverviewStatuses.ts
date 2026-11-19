import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface GanttOverviewStatus {
  id: string;
  name: string;
  color: string;
  display_order: number;
  is_active: boolean;
  /** Único comportamiento especial: si es true, esta línea no aparece en la
   *  línea de tiempo general de "Cartas Gantt - Vista General" (sigue
   *  visible en el listado de tarjetas). Atado a un flag por estado, no al
   *  nombre, para que persista aunque el estado se renombre. */
  excludes_from_timeline: boolean;
}

export function useGanttOverviewStatuses() {
  const [statuses, setStatuses] = useState<GanttOverviewStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("gantt_overview_statuses")
      .select("*")
      .eq("is_active", true)
      .order("display_order");
    setStatuses((data as GanttOverviewStatus[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { statuses, loading, reload: load };
}
