import { supabase } from "@/integrations/supabase/client";
import { getConfiguredDestinations } from "@/hooks/useFileDestinationSettings";
import { fileToBase64 } from "@/lib/fileBase64";
import type { FolderDestinationEntry } from "@/components/budget/FolderDestinationPicker";

/**
 * Resolve a destination folder for patent files.
 * For "repo" → find in contract's repository_folders.
 * For "general" → find in general_folders.
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

  // Repo: find existing folder anywhere in the contract's hierarchy
  const { data: existingList } = await supabase
    .from("repository_folders")
    .select("id, name, drive_folder_id, parent_id")
    .eq("contract_id", contractId)
    .ilike("name", entry.name);

  // Exact-match preferred (ilike can match loosely)
  const exact = (existingList || []).filter(
    (f) => (f.name || "").trim().toLowerCase() === entry.name.trim().toLowerCase()
  );
  const existing = exact.find((f) => f.drive_folder_id) || exact[0] || existingList?.[0] || null;

  if (existing) return { id: existing.id, source: "repo", name: entry.name, driveFolderId: existing.drive_folder_id };

  console.warn(`Patent backup: folder '${entry.name}' not found for contract ${contractId}`);
  return null;
}

/**
 * Upload a file to Google Drive via the edge function,
 * resolving the correct hierarchical Drive folder.
 * Uses FileReader-based base64 conversion to handle large files safely.
 */
async function uploadFileToDriveHierarchical(
  file: File,
  fileName: string,
  folderId: string,
  contractId: string,
): Promise<{ driveFileId: string; driveUrl: string } | null> {
  try {
    const base64Content = await fileToBase64(file);

    const { data, error } = await supabase.functions.invoke('google-drive', {
      body: {
        action: 'uploadFileToRepoFolder',
        fileName,
        fileContent: base64Content,
        mimeType: file.type || 'application/octet-stream',
        repoFolderId: folderId,
        contractId,
      }
    });

    if (error || !data) {
      console.error("Error uploading to Google Drive:", error);
      return null;
    }

    return {
      driveFileId: data.id || data.driveFileId,
      driveUrl: data.webViewLink || data.driveUrl || `https://drive.google.com/file/d/${data.id}/view`,
    };
  } catch (err) {
    console.error("Error uploading to Google Drive:", err);
    return null;
  }
}

/**
 * Legacy direct upload (used when folder already has a known drive_folder_id).
 * Uses FileReader-based base64 conversion to handle large files safely.
 */
async function uploadFileToDriveDirect(
  file: File,
  fileName: string,
  driveFolderId: string,
): Promise<{ driveFileId: string; driveUrl: string } | null> {
  try {
    const base64Content = await fileToBase64(file);

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

      // If file provided, try uploading to Drive
      if (file && folder.source === "repo") {
        // Use hierarchical resolution via edge function
        const driveResult = await uploadFileToDriveHierarchical(file, fileName, folder.id, contractId);
        if (driveResult) {
          driveFileId = driveResult.driveFileId;
          fileUrl = driveResult.driveUrl;
        }
      } else if (file && folder.driveFolderId) {
        // General folder with known drive ID — direct upload
        const driveResult = await uploadFileToDriveDirect(file, fileName, folder.driveFolderId);
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
