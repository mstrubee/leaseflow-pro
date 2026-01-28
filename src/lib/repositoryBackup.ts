import { supabase } from "@/integrations/supabase/client";
import { sanitizeFileName } from "./fileValidation";

/**
 * Get or create the standard "OC" folder for a contract's repository.
 * Returns the folder info including ID and drive_folder_id.
 */
export async function getOrCreateOCFolder(contractId: string): Promise<{ id: string; driveFolderId: string | null } | null> {
  try {
    // First, try to find an existing OC folder for this contract
    const { data: existingFolder, error: findError } = await supabase
      .from("repository_folders")
      .select("id, drive_folder_id")
      .eq("contract_id", contractId)
      .or("folder_type.eq.oc,name.ilike.OC")
      .is("parent_id", null)
      .limit(1)
      .single();

    if (existingFolder) {
      return { id: existingFolder.id, driveFolderId: existingFolder.drive_folder_id };
    }

    // Get contract's drive folder ID to create OC folder in Drive
    const { data: contract } = await supabase
      .from("contracts")
      .select("drive_folder_id")
      .eq("id", contractId)
      .single();

    let driveFolderId: string | null = null;

    // Create OC folder in Drive if contract has Drive linked
    if (contract?.drive_folder_id) {
      const { data: driveData, error: driveError } = await supabase.functions.invoke('google-drive', {
        body: { 
          action: 'ensureSubfolderExists',
          parentDriveFolderId: contract.drive_folder_id,
          folderName: 'OC'
        }
      });

      if (!driveError && driveData?.id) {
        driveFolderId = driveData.id;
      }
    }

    // If not found, create the OC folder
    const { data: newFolder, error: createError } = await supabase
      .from("repository_folders")
      .insert({
        contract_id: contractId,
        name: "OC",
        folder_type: "oc",
        parent_id: null,
        drive_folder_id: driveFolderId,
      })
      .select("id, drive_folder_id")
      .single();

    if (createError) {
      console.error("Error creating OC folder:", createError);
      return null;
    }

    return newFolder ? { id: newFolder.id, driveFolderId: newFolder.drive_folder_id } : null;
  } catch (error) {
    console.error("Error in getOrCreateOCFolder:", error);
    return null;
  }
}

/**
 * Backup an OC file to the contract's repository OC folder (Google Drive only).
 * This ensures all OC documents are centralized in the repository.
 */
export async function backupOCFileToRepository(
  contractId: string,
  file: File,
  orderNumber: string
): Promise<{ success: boolean; fileId?: string; error?: string }> {
  try {
    const folderInfo = await getOrCreateOCFolder(contractId);
    if (!folderInfo) {
      return { success: false, error: "No se pudo obtener o crear la carpeta OC" };
    }

    // REQUIRED: Drive must be configured for uploads
    if (!folderInfo.driveFolderId) {
      return { success: false, error: "El contrato debe estar sincronizado con Google Drive para guardar archivos OC" };
    }

    // Generate unique file name with order number prefix
    const fileExt = file.name.split(".").pop();
    const sanitizedName = sanitizeFileName(file.name);
    const fileName = `OC_${orderNumber}_${sanitizedName}`;

    // Convert file to base64 for Drive upload
    const arrayBuffer = await file.arrayBuffer();
    const base64Content = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    // Upload directly to Google Drive
    const { data: driveData, error: driveError } = await supabase.functions.invoke('google-drive', {
      body: { 
        action: 'uploadFile',
        fileName,
        fileContent: base64Content,
        mimeType: file.type || 'application/octet-stream',
        driveFolderId: folderInfo.driveFolderId
      }
    });

    if (driveError) {
      console.error("Error uploading to Drive:", driveError);
      return { success: false, error: driveError.message };
    }

    // Create record in repository_files with Drive URL
    const { data: fileRecord, error: dbError } = await supabase
      .from("repository_files")
      .insert({
        folder_id: folderInfo.id,
        name: fileName,
        url: driveData.webViewLink || driveData.webContentLink || '',
        file_type: fileExt || null,
        drive_file_id: driveData.id,
      })
      .select("id")
      .single();

    if (dbError) {
      console.error("Error creating file record:", dbError);
      return { success: false, error: dbError.message };
    }

    return { success: true, fileId: fileRecord?.id };
  } catch (error: any) {
    console.error("Error backing up OC file:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Backup an OC file from an existing URL to the contract's repository (Drive only).
 * Used when converting OC requests that already have files uploaded.
 * If the source is a Drive URL, creates a reference; otherwise needs re-upload.
 */
export async function backupOCFromStorageUrl(
  contractId: string,
  storageUrl: string,
  orderNumber: string,
  originalFileName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const folderInfo = await getOrCreateOCFolder(contractId);
    if (!folderInfo) {
      return { success: false, error: "No se pudo obtener o crear la carpeta OC" };
    }

    // Extract file extension
    const fileExt = originalFileName.split(".").pop() || "pdf";
    const fileName = `OC_${orderNumber}_${originalFileName}`;

    // If the URL is already a Drive URL, just create the DB reference
    const isDriveUrl = storageUrl.includes('drive.google.com') || storageUrl.includes('docs.google.com');
    
    if (isDriveUrl) {
      // Create a reference record in repository_files pointing to the Drive URL
      const { error: dbError } = await supabase
        .from("repository_files")
        .insert({
          folder_id: folderInfo.id,
          name: fileName,
          url: storageUrl,
          file_type: fileExt,
        });

      if (dbError) {
        console.error("Error creating file record:", dbError);
        return { success: false, error: dbError.message };
      }

      return { success: true };
    }

    // For non-Drive URLs, we can't copy the file to Drive without downloading it first
    // Just create a reference with the existing URL (legacy support)
    const { error: dbError } = await supabase
      .from("repository_files")
      .insert({
        folder_id: folderInfo.id,
        name: fileName,
        url: storageUrl,
        file_type: fileExt,
      });

    if (dbError) {
      console.error("Error creating file record:", dbError);
      return { success: false, error: dbError.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error backing up OC from URL:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Backup OC file to multiple contract repositories (for multi-contract OCs).
 */
export async function backupOCToMultipleContracts(
  contractIds: string[],
  storageUrl: string,
  orderNumber: string,
  originalFileName: string
): Promise<{ successful: string[]; failed: string[] }> {
  const successful: string[] = [];
  const failed: string[] = [];

  for (const contractId of contractIds) {
    const result = await backupOCFromStorageUrl(
      contractId,
      storageUrl,
      orderNumber,
      originalFileName
    );

    if (result.success) {
      successful.push(contractId);
    } else {
      failed.push(contractId);
    }
  }

  return { successful, failed };
}
