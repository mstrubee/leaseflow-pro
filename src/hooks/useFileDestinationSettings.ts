import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface FileDestinationSettings {
  oc_folder: string;
  invoice_folder: string;
}

const DEFAULTS: FileDestinationSettings = {
  oc_folder: "OC",
  invoice_folder: "Facturas",
};

export function useFileDestinationSettings() {
  const [settings, setSettings] = useState<FileDestinationSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("file_destination_settings")
        .select("setting_key, folder_name");

      if (error) {
        console.error("Error loading file destination settings:", error);
        return;
      }

      const mapped: FileDestinationSettings = { ...DEFAULTS };
      for (const row of data || []) {
        if (row.setting_key === "oc_folder") mapped.oc_folder = row.folder_name;
        if (row.setting_key === "invoice_folder") mapped.invoice_folder = row.folder_name;
      }
      setSettings(mapped);
    } catch (err) {
      console.error("Error loading file destination settings:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const updateSetting = async (key: keyof FileDestinationSettings, folderName: string) => {
    const { error } = await supabase
      .from("file_destination_settings")
      .update({ folder_name: folderName, updated_at: new Date().toISOString() })
      .eq("setting_key", key);

    if (error) throw error;

    setSettings((prev) => ({ ...prev, [key]: folderName }));
  };

  return { settings, loading, updateSetting, refetch: loadSettings };
}

/**
 * Fetch the configured folder name for a given setting key.
 * Standalone function for use in utility modules (non-hook context).
 * Returns the first configured folder name (primary destination).
 */
export async function getConfiguredFolderName(key: "oc_folder" | "invoice_folder"): Promise<string> {
  const names = await getConfiguredFolderNames(key);
  return names[0];
}

/**
 * Fetch all configured folder names for a given setting key.
 * Returns an array of folder names (supports multi-folder destinations).
 */
export async function getConfiguredFolderNames(key: "oc_folder" | "invoice_folder"): Promise<string[]> {
  const { data } = await supabase
    .from("file_destination_settings")
    .select("folder_name")
    .eq("setting_key", key)
    .single();

  const raw = data?.folder_name || DEFAULTS[key];
  return raw
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);
}
