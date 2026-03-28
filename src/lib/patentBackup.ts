import { supabase } from "@/integrations/supabase/client";
import { getConfiguredDestinations } from "@/hooks/useFileDestinationSettings";
import type { FolderDestinationEntry } from "@/components/budget/FolderDestinationPicker";

/**
 * Resolve a destination folder for patent files.
 * For "repo" → find/create in contract's repository_folders (includes drive_folder_id).
 * For "general" → find in general_folders (includes drive_folder_id).
 */
async function resolveFolder(
  contractId: string,
  entry: FolderDestinationEntry
): Promise<{ id: string; source: string; name: string; driveFolderId: string | null } | null> {
  if (entry.source === "general") {
    const { data } = await supabase
      .from("general_folders")
      .select("id, drive_folder_id")
      .ilike("name", entry.name)
      .limit(1)
      .single();
    return data ? { id: data.id, source: "general", name: entry.name, driveFolderId: data.drive_folder_id } : null;
  }

  // Repo: find existing folder anywhere in the contract's hierarchy (not just root)
  const { data: existingList } = await supabase
    .from("repository_folders")
    .select("id, drive_folder_id, parent_id")
    .eq("contract_id", contractId)
    .ilike("name", entry.name);

  // Prefer the folder that already has a drive_folder_id, otherwise pick first match
  const existing = existingList?.find(f => f.drive_folder_id) || existingList?.[0] || null;

  if (existing) return { id: existing.id, source: "repo", name: entry.name, driveFolderId: existing.drive_folder_id };

  // Do NOT auto-create folders — the folder must already exist in the contract's repository
  console.warn(`Patent backup: folder '${entry.name}' not found for contract ${contractId}`);
  return null;
}

/**
 * Upload a file to Google Drive and return the drive file info.
 */
async function uploadFileToDrive(
  file: File,
  fileName: string,
  driveFolderId: string
): Promise<{ driveFileId: string; driveUrl: string } | null> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const base64Content = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    const { data, error } = await supabase.functions.invoke('google-drive', {
      body: {
        action: 'uploadFile',
        fileName,
        fileContent: base64Content,
        mimeType: file.type || 'application/octet-stream',
        driveFolderId,
      }
    });

    if (error || !data) {
      console.error("Error uploading to Google Drive:", error);
      return null;
    }

    return {
      driveFileId: data.id,
      driveUrl: data.webViewLink || data.webContentLink || `https://drive.google.com/file/d/${data.id}/view`,
    };
  } catch (err) {
    console.error("Error uploading to Google Drive:", err);
    return null;
  }
}

/**
 * Backup a patent file to all configured patent destination folders.
 * If a destination folder has a drive_folder_id, the file is also uploaded to Google Drive.
 * @param file - The original File object (needed for Drive upload). If not provided, only DB record is created.
 */
export async function backupPatentFileToDestinations(
  contractId: string,
  storageUrl: string,
  fileName: string,
  file?: File
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

      let driveFileId: string | null = null;
      let fileUrl = storageUrl;

      // If the folder has a Drive folder, upload the file to Drive
      if (folder.driveFolderId && file) {
        const driveResult = await uploadFileToDrive(file, fileName, folder.driveFolderId);
        if (driveResult) {
          driveFileId = driveResult.driveFileId;
          fileUrl = driveResult.driveUrl;
        }
      }

      const table = folder.source === "general" ? "general_folder_files" : "repository_files";
      const { error } = await supabase
        .from(table)
        .insert({
          folder_id: folder.id,
          name: fileName,
          url: fileUrl,
          file_type: fileExt,
          drive_file_id: driveFileId,
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
