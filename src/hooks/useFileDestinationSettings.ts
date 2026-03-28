import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { parseDestinations, type FolderDestinationEntry } from "@/components/budget/FolderDestinationPicker";

export interface FileDestinationSettings {
  oc_folder: string;
  invoice_folder: string;
}

const DEFAULTS: FileDestinationSettings = {
  oc_folder: "repo::OC",
  invoice_folder: "repo::Facturas",
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
 * Returns the first configured folder name (primary destination).
 * Strips the source prefix for backward compatibility.
 */
export async function getConfiguredFolderName(key: "oc_folder" | "invoice_folder"): Promise<string> {
  const entries = await getConfiguredDestinations(key);
  return entries[0]?.name || (key === "oc_folder" ? "OC" : "Facturas");
}

/**
 * Fetch all configured folder names for a given setting key.
 * Returns an array of folder names only (no source info).
 */
export async function getConfiguredFolderNames(key: "oc_folder" | "invoice_folder"): Promise<string[]> {
  const entries = await getConfiguredDestinations(key);
  return entries.map((e) => e.name);
}

/**
 * Fetch all configured destination entries (with source info) for a given setting key.
 */
export async function getConfiguredDestinations(key: "oc_folder" | "invoice_folder"): Promise<FolderDestinationEntry[]> {
  const { data } = await supabase
    .from("file_destination_settings")
    .select("folder_name")
    .eq("setting_key", key)
    .single();

  const raw = data?.folder_name || DEFAULTS[key];
  const entries = parseDestinations(raw);

  // Legacy fallback: if no entries parsed (old plain-text format), treat as repo
  if (entries.length === 0 && raw.trim()) {
    return [{ source: "repo", name: raw.trim() }];
  }

  return entries;
}
