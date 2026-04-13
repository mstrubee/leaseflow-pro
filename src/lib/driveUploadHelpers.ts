import { supabase } from "@/integrations/supabase/client";
import { sanitizeFileName } from "@/lib/fileValidation";

/**
 * Upload a file to Google Drive via the edge function,
 * resolving the correct hierarchical Drive folder from a repository folder ID.
 * Uses two-step storage approach to avoid edge function memory limits.
 */
export async function uploadFileToDriveHierarchical(
  file: File,
  fileName: string,
  repoFolderId: string,
  contractId: string,
): Promise<{ driveFileId: string; driveUrl: string } | null> {
  try {
    const sanitized = sanitizeFileName(fileName);
    const uploadPath = `contracts/${contractId}/repo/${repoFolderId}/${Date.now()}_${sanitized}`;
    const storageUrl = `storage://repository-files/${uploadPath}`;

    // Step 1: upload to temporary storage
    const { error: storageError } = await supabase.storage
      .from('repository-files')
      .upload(uploadPath, file, { upsert: true });

    if (storageError) {
      console.error("Error uploading to temporary storage:", storageError);
      return null;
    }

    // Step 2: call edge function to transfer from storage to Drive
    const { data, error } = await supabase.functions.invoke('google-drive', {
      body: {
        action: 'uploadRepoFileFromStorage',
        fileName,
        storageUrl,
        mimeType: file.type || 'application/octet-stream',
        repoFolderId,
        contractId,
      }
    });

    if (error || !data) {
      console.error("Error uploading to Google Drive (hierarchical):", error);
      // Cleanup temp file
      await supabase.storage.from('repository-files').remove([uploadPath]).catch(() => {});
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
 * Uses two-step storage approach to avoid edge function memory limits.
 */
export async function uploadFileToDriveDirect(
  file: File,
  fileName: string,
  driveFolderId: string,
): Promise<{ driveFileId: string; driveUrl: string } | null> {
  try {
    const sanitized = sanitizeFileName(fileName);
    const uploadPath = `tmp/direct/${Date.now()}_${sanitized}`;
    const storageUrl = `storage://repository-files/${uploadPath}`;

    // Step 1: upload to temporary storage
    const { error: storageError } = await supabase.storage
      .from('repository-files')
      .upload(uploadPath, file, { upsert: true });

    if (storageError) {
      console.error("Error uploading to temporary storage:", storageError);
      // Fallback to base64 for small files
      return uploadFileToDriveDirectBase64(file, fileName, driveFolderId);
    }

    // Step 2: call edge function with storage reference
    const { data, error } = await supabase.functions.invoke('google-drive', {
      body: {
        action: 'uploadFileFromStorage',
        fileName,
        storageUrl,
        mimeType: file.type || 'application/octet-stream',
        driveFolderId,
      }
    });

    if (error || !data) {
      console.error("Error uploading to Google Drive (direct):", error);
      await supabase.storage.from('repository-files').remove([uploadPath]).catch(() => {});
      // Fallback to base64
      return uploadFileToDriveDirectBase64(file, fileName, driveFolderId);
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
 * Fallback: upload via base64 for backward compat (small files only).
 */
async function uploadFileToDriveDirectBase64(
  file: File,
  fileName: string,
  driveFolderId: string,
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
      console.error("Error uploading to Google Drive (base64 fallback):", error);
      return null;
    }

    return {
      driveFileId: data.id,
      driveUrl: data.webViewLink || data.webContentLink || `https://drive.google.com/file/d/${data.id}/view`,
    };
  } catch (err) {
    console.error("Error uploading to Google Drive (base64 fallback):", err);
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
