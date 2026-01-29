import { supabase } from "@/integrations/supabase/client";
import { sanitizeFileName } from "./fileValidation";

/**
 * Get or create the standard "OC" folder for a contract's repository.
 * Returns the folder info including ID and drive_folder_id.
 * NOTE: Drive folder creation is disabled due to service account quota limits.
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

    // NOTE: Drive folder creation is disabled.
    // Service accounts don't have storage quota; uploads would fail with 403.
    // Files are stored in DB only (repository_files table).

    // Create the OC folder in the database only
    const { data: newFolder, error: createError } = await supabase
      .from("repository_folders")
      .insert({
        contract_id: contractId,
        name: "OC",
        folder_type: "oc",
        parent_id: null,
        drive_folder_id: null,
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
 * Backup an OC file to the contract's repository OC folder.
 * NOTE: Drive uploads are disabled due to service account quota limits.
 * Files are registered in the DB only (no cloud upload).
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

    // Generate unique file name with order number prefix
    const fileExt = file.name.split(".").pop();
    const sanitizedName = sanitizeFileName(file.name);
    const fileName = `OC_${orderNumber}_${sanitizedName}`;

    // NOTE: Drive upload is disabled. Service accounts lack storage quota.
    // We create a DB record without uploading to Drive.

    // Create record in repository_files (no Drive URL)
    const { data: fileRecord, error: dbError } = await supabase
      .from("repository_files")
      .insert({
        folder_id: folderInfo.id,
        name: fileName,
        url: '', // No Drive URL
        file_type: fileExt || null,
        drive_file_id: null,
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
 * Backup an OC file from an existing URL to the contract's repository.
 * Creates a reference in the DB pointing to the provided URL.
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

    // Create a reference record in repository_files pointing to the URL
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
 * Uses URL-based backup which creates references in each contract's OC folder.
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

/**
 * Register a file in multiple contracts' OC folders.
 * NOTE: Drive uploads are disabled. Files are registered in the DB only.
 */
export async function uploadFileToMultipleContracts(
  file: File,
  contractIds: string[],
  orderNumber: string
): Promise<{ 
  successful: { contractId: string; url: string; fileId: string }[]; 
  failed: { contractId: string; error: string }[];
  primaryUrl: string | null;
}> {
  const successful: { contractId: string; url: string; fileId: string }[] = [];
  const failed: { contractId: string; error: string }[] = [];

  for (const contractId of contractIds) {
    const result = await backupOCFileToRepository(contractId, file, orderNumber);
    
    if (result.success && result.fileId) {
      // Get the file record (URL will be empty since Drive is disabled)
      const { data: fileRecord } = await supabase
        .from("repository_files")
        .select("url")
        .eq("id", result.fileId)
        .single();
      
      successful.push({ 
        contractId, 
        url: fileRecord?.url || '', 
        fileId: result.fileId 
      });
    } else {
      failed.push({ contractId, error: result.error || "Error desconocido" });
    }
  }

  return { 
    successful, 
    failed,
    primaryUrl: successful.length > 0 ? successful[0].url : null
  };
}
