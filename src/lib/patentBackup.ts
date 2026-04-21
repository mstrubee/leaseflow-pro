import { supabase } from "@/integrations/supabase/client";
import { getConfiguredDestinations } from "@/hooks/useFileDestinationSettings";
import { sanitizeFileName } from "@/lib/fileValidation";
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

  const exact = (existingList || []).filter(
    (f) => (f.name || "").trim().toLowerCase() === entry.name.trim().toLowerCase()
  );
  const existing = exact.find((f) => f.drive_folder_id) || exact[0] || existingList?.[0] || null;

  if (existing) return { id: existing.id, source: "repo", name: entry.name, driveFolderId: existing.drive_folder_id };

  console.warn(`Patent backup: folder '${entry.name}' not found for contract ${contractId}`);
  return null;
}

/**
 * Upload via temporary storage → edge function (avoids base64 memory limits).
 */
async function uploadViaStorage(
  file: File,
  fileName: string,
  contractId: string,
  folder: { id: string; source: string; driveFolderId: string | null },
): Promise<{ driveFileId: string; driveUrl: string } | null> {
  try {
    const sanitized = sanitizeFileName(fileName);
    const uploadPath =
      folder.source === "repo"
        ? `contracts/${contractId}/repo/${folder.id}/${Date.now()}_${sanitized}`
        : `tmp/direct/${Date.now()}_${sanitized}`;
    const storageUrl = `storage://repository-files/${uploadPath}`;

    const { error: storageError } = await supabase.storage
      .from("repository-files")
      .upload(uploadPath, file, { upsert: true });

    if (storageError) {
      console.error("Patent backup: error uploading to temporary storage:", storageError);
      return null;
    }

    const body =
      folder.source === "repo"
        ? {
            action: "uploadRepoFileFromStorage",
            fileName,
            storageUrl,
            mimeType: file.type || "application/octet-stream",
            repoFolderId: folder.id,
            contractId,
          }
        : {
            action: "uploadFileFromStorage",
            fileName,
            storageUrl,
            mimeType: file.type || "application/octet-stream",
            driveFolderId: folder.driveFolderId,
          };

    const { data, error } = await supabase.functions.invoke("google-drive", { body });

    if (error || !data) {
      console.error("Patent backup: error uploading to Google Drive:", error);
      await supabase.storage.from("repository-files").remove([uploadPath]).catch(() => {});
      return null;
    }

    return {
      driveFileId: data.id || data.driveFileId,
      driveUrl: data.webViewLink || data.driveUrl || data.webContentLink || `https://drive.google.com/file/d/${data.id || data.driveFileId}/view`,
    };
  } catch (err) {
    console.error("Patent backup: error uploading to Google Drive:", err);
    return null;
  }
}

/**
 * Backup a patent file to all configured patent destination folders.
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
      return { success: true };
    }

    const fileExt = fileName.split(".").pop() || null;

    for (const entry of destinations) {
      const folder = await resolveFolder(contractId, entry);
      if (!folder) continue;

      let driveFileId: string | null = null;
      let fileUrl = storageUrl;

      if (file && (folder.source === "repo" || folder.driveFolderId)) {
        const driveResult = await uploadViaStorage(file, fileName, contractId, folder);
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
