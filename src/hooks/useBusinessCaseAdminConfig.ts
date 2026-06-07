import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminConfig, defaultAdminConfig } from "@/lib/businessCase/model";

// Configuración GLOBAL del Business Case (una para toda la organización),
// almacenada en app_settings (key = business_case_admin_config).
const KEY = "business_case_admin_config";

export function useBusinessCaseAdminConfig() {
  const [config, setConfig] = useState<AdminConfig>(defaultAdminConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await (supabase as any)
        .from("app_settings")
        .select("value")
        .eq("key", KEY)
        .maybeSingle();
      if (data?.value && typeof data.value === "object") {
        setConfig({ ...defaultAdminConfig, ...(data.value as AdminConfig) });
      }
    } catch {
      /* usar defaults si no existe / falla */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(async (cfg: AdminConfig) => {
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("app_settings").upsert(
        { key: KEY, value: cfg as unknown as Record<string, unknown>, updated_at: new Date().toISOString(), updated_by: u?.user?.id ?? null },
        { onConflict: "key" },
      );
      if (error) throw error;
      setConfig(cfg);
      return true;
    } finally {
      setSaving(false);
    }
  }, []);

  return { config, setConfig, loading, saving, save, reload: load };
}
