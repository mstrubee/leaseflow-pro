import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function usePresenceHeartbeat() {
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    const updatePresence = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from("profiles")
        .update({ last_seen_at: new Date().toISOString() } as any)
        .eq("id", user.id);
    };

    // Initial heartbeat
    updatePresence();

    // Then every 60 seconds
    interval = setInterval(updatePresence, 60_000);

    return () => clearInterval(interval);
  }, []);
}
