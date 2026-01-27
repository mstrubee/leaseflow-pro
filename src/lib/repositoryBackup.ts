import { supabase } from "@/integrations/supabase/client";
import { uploadFileToStorage } from "./storageUtils";
import { sanitizeFileName } from "./fileValidation";

/**
 * Get or create the standard "OC" folder for a contract's repository.
 * Returns the folder ID for the OC folder.
 */
export async function getOrCreateOCFolder(contractId: string): Promise<string | null> {
  try {
    // First, try to find an existing OC folder for this contract
    const { data: existingFolder, error: findError } = await supabase
      .from("repository_folders")
      .select("id")
      .eq("contract_id", contractId)
      .or("folder_type.eq.oc,name.ilike.OC")
      .is("parent_id", null)
      .limit(1)
      .single();

    if (existingFolder) {
      return existingFolder.id;
    }

    // If not found, create the OC folder
    const { data: newFolder, error: createError } = await supabase
      .from("repository_folders")
      .insert({
        contract_id: contractId,
        name: "OC",
        folder_type: "oc",
        parent_id: null,
      })
      .select("id")
      .single();

    if (createError) {
      console.error("Error creating OC folder:", createError);
      return null;
    }

    return newFolder?.id || null;
  } catch (error) {
    console.error("Error in getOrCreateOCFolder:", error);
    return null;
  }
}

/**
 * Backup an OC file to the contract's repository OC folder.
 * This ensures all OC documents are centralized in the repository.
 */
export async function backupOCFileToRepository(
  contractId: string,
  file: File,
  orderNumber: string
): Promise<{ success: boolean; fileId?: string; error?: string }> {
  try {
    const folderId = await getOrCreateOCFolder(contractId);
    if (!folderId) {
      return { success: false, error: "No se pudo obtener o crear la carpeta OC" };
    }

    // Generate unique file name with order number prefix
    const fileExt = file.name.split(".").pop();
    const sanitizedName = sanitizeFileName(file.name);
    const timestamp = Date.now();
    const fileName = `${orderNumber}_${timestamp}_${sanitizedName}`;
    const filePath = `${contractId}/${folderId}/${fileName}`;

    // Upload to storage
    const { path, error: uploadError } = await uploadFileToStorage(filePath, file);

    if (uploadError) {
      return { success: false, error: uploadError.message };
    }

    // Create record in repository_files
    const { data: fileRecord, error: dbError } = await supabase
      .from("repository_files")
      .insert({
        folder_id: folderId,
        name: `OC_${orderNumber}_${file.name}`,
        url: path,
        file_type: fileExt || null,
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
 * Backup an OC file from an existing storage URL to the contract's repository.
 * Used when converting OC requests that already have files uploaded.
 */
export async function backupOCFromStorageUrl(
  contractId: string,
  storageUrl: string,
  orderNumber: string,
  originalFileName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const folderId = await getOrCreateOCFolder(contractId);
    if (!folderId) {
      return { success: false, error: "No se pudo obtener o crear la carpeta OC" };
    }

    // Extract file extension
    const fileExt = originalFileName.split(".").pop() || "pdf";

    // Create a reference record in repository_files pointing to the same storage URL
    const { error: dbError } = await supabase
      .from("repository_files")
      .insert({
        folder_id: folderId,
        name: `OC_${orderNumber}_${originalFileName}`,
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
