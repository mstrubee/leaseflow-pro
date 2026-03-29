import { supabase } from "@/integrations/supabase/client";

/**
 * Convert a File to base64 string for Drive upload.
 */
async function fileToBase64(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  return btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
}

/**
 * Upload a file to Google Drive via the edge function,
 * resolving the correct hierarchical Drive folder from a repository folder ID.
 */
export async function uploadFileToDriveHierarchical(
  file: File,
  fileName: string,
  repoFolderId: string,
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
        repoFolderId,
        contractId,
      }
    });

    if (error || !data) {
      console.error("Error uploading to Google Drive (hierarchical):", error);
      return null;
    }

    return {
      driveFileId: data.id || data.driveFileId,
      driveUrl: data.webViewLink || data.driveUrl || `https://drive.google.com/file/d/${data.id}/view`,
    };
  } catch (err) {
    console.error("Error uploading to Google Drive (hierarchical):", err);
    return null;
  }
}

/**
 * Upload a file to Google Drive directly to a known Drive folder ID.
 * Used for general folders that already have a drive_folder_id.
 */
export async function uploadFileToDriveDirect(
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
      console.error("Error uploading to Google Drive (direct):", error);
      return null;
    }

    return {
      driveFileId: data.id,
      driveUrl: data.webViewLink || data.webContentLink || `https://drive.google.com/file/d/${data.id}/view`,
    };
  } catch (err) {
    console.error("Error uploading to Google Drive (direct):", err);
    return null;
  }
}

/**
 * Upload a file to Drive based on folder source type.
 * "repo" folders use hierarchical resolution; "general" folders use direct upload.
 */
export async function uploadFileToDriveForFolder(
  file: File,
  fileName: string,
  folder: { id: string; source: string; driveFolderId: string | null },
  contractId: string,
): Promise<{ driveFileId: string; driveUrl: string } | null> {
  if (folder.source === "repo") {
    return uploadFileToDriveHierarchical(file, fileName, folder.id, contractId);
  }
  
  if (folder.source === "general" && folder.driveFolderId) {
    return uploadFileToDriveDirect(file, fileName, folder.driveFolderId);
  }

  console.warn(`Cannot upload to Drive: folder source='${folder.source}', driveFolderId='${folder.driveFolderId}'`);
  return null;
}
