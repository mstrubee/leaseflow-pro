import { supabase } from "@/integrations/supabase/client";
import { getConfiguredDestinations } from "@/hooks/useFileDestinationSettings";
import type { FolderDestinationEntry } from "@/components/budget/FolderDestinationPicker";

/**
 * Resolve a destination folder for patent files.
 * For "repo" → find/create in contract's repository_folders.
 * For "general" → find in general_folders.
 */
async function resolveFolder(
  contractId: string,
  entry: FolderDestinationEntry
): Promise<{ id: string; source: string; name: string } | null> {
  if (entry.source === "general") {
    const { data } = await supabase
      .from("general_folders")
      .select("id")
      .ilike("name", entry.name)
      .limit(1)
      .single();
    return data ? { id: data.id, source: "general", name: entry.name } : null;
  }

  // Repo: find or create in contract's repository
  const { data: existing } = await supabase
    .from("repository_folders")
    .select("id")
    .eq("contract_id", contractId)
    .ilike("name", entry.name)
    .is("parent_id", null)
    .limit(1)
    .single();

  if (existing) return { id: existing.id, source: "repo", name: entry.name };

  const { data: created, error } = await supabase
    .from("repository_folders")
    .insert({
      contract_id: contractId,
      name: entry.name,
      folder_type: "patent",
      parent_id: null,
      drive_folder_id: null,
    })
    .select("id")
    .single();

  if (error) {
    console.error(`Error creating patent folder '${entry.name}':`, error);
    return null;
  }
  return created ? { id: created.id, source: "repo", name: entry.name } : null;
}

/**
 * Backup a patent file (by storage URL) to all configured patent destination folders.
 */
export async function backupPatentFileToDestinations(
  contractId: string,
  storageUrl: string,
  fileName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const destinations = await getConfiguredDestinations("patent_folder");
    if (destinations.length === 0) {
      return { success: true }; // No destinations configured, skip silently
    }

    const fileExt = fileName.split(".").pop() || null;

    for (const entry of destinations) {
      const folder = await resolveFolder(contractId, entry);
      if (!folder) continue;

      const table = folder.source === "general" ? "general_folder_files" : "repository_files";
      const { error } = await supabase
        .from(table)
        .insert({
          folder_id: folder.id,
          name: fileName,
          url: storageUrl,
          file_type: fileExt,
          drive_file_id: null,
        });

      if (error) {
        console.error(`Error backing up patent file to '${folder.name}' (${table}):`, error);
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error backing up patent file:", error);
    return { success: false, error: error.message };
  }
}
