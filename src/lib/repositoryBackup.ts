import { supabase } from "@/integrations/supabase/client";
import { sanitizeFileName } from "./fileValidation";
import { uploadFileToStorage } from "./storageUtils";
import { getConfiguredFolderName, getConfiguredFolderNames } from "@/hooks/useFileDestinationSettings";

/**
 * Get or create a single destination folder for a contract's repository.
 * Used internally; callers should prefer getOrCreateOCFolders for multi-folder support.
 */
async function getOrCreateSingleFolder(
  contractId: string,
  folderName: string,
  folderType: string = "oc"
): Promise<{ id: string; driveFolderId: string | null } | null> {
  try {
    const { data: existingFolder } = await supabase
      .from("repository_folders")
      .select("id, drive_folder_id")
      .eq("contract_id", contractId)
      .or(`folder_type.eq.${folderType},name.ilike.${folderName}`)
      .is("parent_id", null)
      .limit(1)
      .single();

    if (existingFolder) {
      return { id: existingFolder.id, driveFolderId: existingFolder.drive_folder_id };
    }

    const { data: newFolder, error: createError } = await supabase
      .from("repository_folders")
      .insert({
        contract_id: contractId,
        name: folderName,
        folder_type: folderType,
        parent_id: null,
        drive_folder_id: null,
      })
      .select("id, drive_folder_id")
      .single();

    if (createError) {
      console.error(`Error creating folder '${folderName}':`, createError);
      return null;
    }

    return newFolder ? { id: newFolder.id, driveFolderId: newFolder.drive_folder_id } : null;
  } catch (error) {
    console.error(`Error in getOrCreateSingleFolder('${folderName}'):`, error);
    return null;
  }
}

/**
 * Get or create the configured destination folder(s) for OC files.
 * Returns the primary (first) folder. For all folders, use getOrCreateOCFolders.
 */
export async function getOrCreateOCFolder(contractId: string): Promise<{ id: string; driveFolderId: string | null } | null> {
  const folderName = await getConfiguredFolderName("oc_folder");
  return getOrCreateSingleFolder(contractId, folderName, "oc");
}

/**
 * Get or create ALL configured destination folders for OC files.
 * Supports multiple folders (e.g., "OC, Facturas").
 */
export async function getOrCreateOCFolders(contractId: string): Promise<{ id: string; driveFolderId: string | null; name: string }[]> {
  const folderNames = await getConfiguredFolderNames("oc_folder");
  const results: { id: string; driveFolderId: string | null; name: string }[] = [];

  for (const name of folderNames) {
    const folder = await getOrCreateSingleFolder(contractId, name, "oc");
    if (folder) {
      results.push({ ...folder, name });
    }
  }

  return results;
}

/**
 * Backup an OC file to ALL configured destination folders in the contract's repository.
 * Uploads the file once to Storage, then creates a reference in each destination folder.
 */
export async function backupOCFileToRepository(
  contractId: string,
  file: File,
  orderNumber: string
): Promise<{ success: boolean; fileId?: string; error?: string }> {
  try {
    const folders = await getOrCreateOCFolders(contractId);
    if (folders.length === 0) {
      return { success: false, error: "No se pudo obtener o crear las carpetas de destino" };
    }

    const fileExt = file.name.split(".").pop();
    const sanitizedName = sanitizeFileName(file.name);
    const fileName = `OC_${orderNumber}_${sanitizedName}`;

    // Upload once to Storage
    const datePrefix = new Date().toISOString().split("T")[0].replace(/-/g, "");
    const unique = Date.now();
    const storagePath = `oc-files/${datePrefix}/${contractId}/OC_${orderNumber}_${unique}_${sanitizedName}`;

    const { path: storedUrl, error: uploadError } = await uploadFileToStorage(storagePath, file);
    if (uploadError) {
      return { success: false, error: uploadError.message };
    }

    // Create a reference in each destination folder
    let primaryFileId: string | undefined;
    for (const folder of folders) {
      const { data: fileRecord, error: dbError } = await supabase
        .from("repository_files")
        .insert({
          folder_id: folder.id,
          name: fileName,
          url: storedUrl,
          file_type: fileExt || null,
          drive_file_id: null,
        })
        .select("id")
        .single();

      if (dbError) {
        console.error(`Error creating file record in folder '${folder.name}':`, dbError);
      } else if (!primaryFileId && fileRecord) {
        primaryFileId = fileRecord.id;
      }
    }

    return { success: true, fileId: primaryFileId };
  } catch (error: any) {
    console.error("Error backing up OC file:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Backup an OC file from an existing URL to ALL configured destination folders.
 * Creates references in the DB pointing to the provided URL.
 */
export async function backupOCFromStorageUrl(
  contractId: string,
  storageUrl: string,
  orderNumber: string,
  originalFileName: string
): Promise<{ success: boolean; fileId?: string; error?: string }> {
  try {
    const folders = await getOrCreateOCFolders(contractId);
    if (folders.length === 0) {
      return { success: false, error: "No se pudo obtener o crear las carpetas de destino" };
    }

    const fileExt = originalFileName.split(".").pop() || "pdf";
    const fileName = `OC_${orderNumber}_${originalFileName}`;

    let primaryFileId: string | undefined;
    for (const folder of folders) {
      const { data: inserted, error: dbError } = await supabase
        .from("repository_files")
        .insert({
          folder_id: folder.id,
          name: fileName,
          url: storageUrl,
          file_type: fileExt,
          drive_file_id: null,
        })
        .select("id")
        .single();

      if (dbError) {
        console.error(`Error creating file record in folder '${folder.name}':`, dbError);
      } else if (!primaryFileId && inserted) {
        primaryFileId = inserted.id;
      }
    }

    return { success: true, fileId: primaryFileId };
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

  // Upload once to Storage, then create a reference in each contract's OC folder
  let storedUrl: string;
  try {
    const datePrefix = new Date().toISOString().split("T")[0].replace(/-/g, "");
    const unique = Date.now();
    const sanitizedOriginal = sanitizeFileName(file.name);
    const storagePath = `oc-files/${datePrefix}/shared/OC_${orderNumber}_${unique}_${sanitizedOriginal}`;
    const { path, error } = await uploadFileToStorage(storagePath, file);
    if (error) throw error;
    storedUrl = path;
  } catch (e: any) {
    const message = e?.message || "Error al subir archivo";
    for (const contractId of contractIds) {
      failed.push({ contractId, error: message });
    }
    return { successful, failed, primaryUrl: null };
  }

  const originalFileName = sanitizeFileName(file.name);

  for (const contractId of contractIds) {
    const result = await backupOCFromStorageUrl(contractId, storedUrl, orderNumber, originalFileName);
    if (result.success) {
      // fileId is optional here; if needed, change backupOCFromStorageUrl to select('id')
      successful.push({ contractId, url: storedUrl, fileId: result.fileId || "" });
    } else {
      failed.push({ contractId, error: result.error || "Error desconocido" });
    }
  }

  return { successful, failed, primaryUrl: storedUrl };
}
