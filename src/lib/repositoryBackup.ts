import { supabase } from "@/integrations/supabase/client";
import { sanitizeFileName } from "./fileValidation";
import { uploadFileToStorage } from "./storageUtils";
import { getConfiguredFolderName, getConfiguredDestinations } from "@/hooks/useFileDestinationSettings";
import type { FolderDestinationEntry } from "@/components/budget/FolderDestinationPicker";
import { uploadFileToDriveForFolder } from "./driveUploadHelpers";

const LEGACY_OC_FACTURAS_NAME = "OC y FACTURAS";

function normalizeFolderToken(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

function getCanonicalRepoFolderName(folderName: string, folderType: string): string {
  const normalizedType = normalizeFolderToken(folderType);
  if (normalizedType === "oocc") return "OOCC";
  if (normalizedType === "facturas") return "Facturas";
  if (normalizedType === "oc_y_facturas") return LEGACY_OC_FACTURAS_NAME;
  return folderName.trim();
}

async function findLegacyOCFacturasParentId(
  contractId: string,
  folderType: string,
): Promise<string | null> {
  const normalizedType = normalizeFolderToken(folderType);
  if (normalizedType !== "oocc" && normalizedType !== "facturas") return null;

  const { data: legacyParent } = await supabase
    .from("repository_folders")
    .select("id")
    .eq("contract_id", contractId)
    .or("folder_type.eq.oc_y_facturas,name.ilike.OC y FACTURAS")
    .is("parent_id", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return legacyParent?.id ?? null;
}

/**
 * Get or create a single destination folder in a contract's repository.
 */
async function getOrCreateRepoFolder(
  contractId: string,
  folderName: string,
  folderType: string = "oocc"
): Promise<{ id: string; driveFolderId: string | null } | null> {
  try {
    const normalizedType = normalizeFolderToken(folderType);
    const canonicalName = getCanonicalRepoFolderName(folderName, normalizedType);
    const normalizedCanonicalName = normalizeFolderToken(canonicalName);
    const normalizedInputName = normalizeFolderToken(folderName);
    const expectedParentId = await findLegacyOCFacturasParentId(contractId, normalizedType);

    const { data: existingFolders, error: existingError } = await supabase
      .from("repository_folders")
      .select("id, name, folder_type, parent_id, drive_folder_id, created_at")
      .eq("contract_id", contractId)
      .order("created_at", { ascending: true })
      .limit(500);

    if (existingError) {
      console.error(`Error loading repository folders for contract '${contractId}':`, existingError);
      return null;
    }

    const relevantFolders = (existingFolders || []).filter((f) => {
      const typeNorm = normalizeFolderToken(f.folder_type);
      const nameNorm = normalizeFolderToken(f.name);
      return (
        typeNorm === normalizedType ||
        nameNorm === normalizedCanonicalName ||
        nameNorm === normalizedInputName
      );
    });

    const scoreCandidate = (f: (typeof relevantFolders)[number]): number => {
      const typeNorm = normalizeFolderToken(f.folder_type);
      const nameNorm = normalizeFolderToken(f.name);
      let score = 0;

      if (expectedParentId && f.parent_id === expectedParentId) score += 100;
      if (!expectedParentId && !f.parent_id) score += 20;
      if (typeNorm === normalizedType) score += 40;
      if (nameNorm === normalizedCanonicalName) score += 30;
      if (nameNorm === normalizedInputName) score += 15;
      if (f.drive_folder_id) score += 10;
      if (expectedParentId && !f.parent_id) score -= 50;

      return score;
    };

    const existingFolder = relevantFolders
      .sort((a, b) => scoreCandidate(b) - scoreCandidate(a))[0];

    if (existingFolder) {
      const needsParentFix = !!expectedParentId && existingFolder.parent_id !== expectedParentId;
      const needsNameFix = normalizeFolderToken(existingFolder.name) !== normalizedCanonicalName;
      const needsTypeFix = normalizeFolderToken(existingFolder.folder_type) !== normalizedType;

      if (needsParentFix || needsNameFix || needsTypeFix) {
        const { error: normalizeError } = await supabase
          .from("repository_folders")
          .update({
            parent_id: needsParentFix ? expectedParentId : existingFolder.parent_id,
            is_base_folder: needsParentFix ? false : !existingFolder.parent_id,
            name: needsNameFix ? canonicalName : existingFolder.name,
            folder_type: needsTypeFix ? normalizedType : existingFolder.folder_type,
          })
          .eq("id", existingFolder.id);

        if (normalizeError) {
          console.error(`Error normalizing folder '${existingFolder.id}':`, normalizeError);
        }
      }

      return { id: existingFolder.id, driveFolderId: existingFolder.drive_folder_id };
    }

    const { data: newFolder, error: createError } = await supabase
      .from("repository_folders")
      .insert({
        contract_id: contractId,
        name: canonicalName,
        folder_type: normalizedType,
        is_base_folder: !expectedParentId,
        parent_id: expectedParentId,
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
    console.error(`Error in getOrCreateRepoFolder('${folderName}'):`, error);
    return null;
  }
}

/**
 * Find a general folder by name.
 * General folders are shared across contracts; we find the folder ID from general_folders table.
 */
async function findGeneralFolder(
  folderName: string
): Promise<{ id: string; driveFolderId: string | null } | null> {
  try {
    const { data } = await supabase
      .from("general_folders")
      .select("id, drive_folder_id")
      .ilike("name", folderName)
      .limit(1)
      .single();

    if (data) {
      return { id: data.id, driveFolderId: data.drive_folder_id || null };
    }
    return null;
  } catch (error) {
    console.error(`Error finding general folder '${folderName}':`, error);
    return null;
  }
}

/**
 * Resolve a single destination entry to a folder ID.
 * For "repo" source → find/create in contract's repository_folders.
 * For "general" source → find in general_folders.
 */
async function resolveDestinationFolder(
  contractId: string,
  entry: FolderDestinationEntry,
  repoFolderType: "oocc" | "facturas" = "oocc"
): Promise<{ id: string; driveFolderId: string | null; source: string; name: string } | null> {
  if (entry.source === "general") {
    const folder = await findGeneralFolder(entry.name);
    if (folder) return { ...folder, source: "general", name: entry.name };
    return null;
  }
  // Default: repo
  const folder = await getOrCreateRepoFolder(contractId, entry.name, repoFolderType);
  if (folder) return { ...folder, source: "repo", name: entry.name };
  return null;
}

/**
 * Get or create the configured destination folder(s) for OC files.
 * Returns the primary (first) folder.
 */
export async function getOrCreateOCFolder(contractId: string): Promise<{ id: string; driveFolderId: string | null } | null> {
  const folderName = await getConfiguredFolderName("oc_folder");
  return getOrCreateRepoFolder(contractId, folderName, "oocc");
}

/**
 * Get or create ALL configured destination folders for OC files.
 * Supports multiple folders from both repo templates and general folders.
 */
export async function getOrCreateOCFolders(contractId: string): Promise<{ id: string; driveFolderId: string | null; name: string; source: string }[]> {
  const destinations = await getConfiguredDestinations("oc_folder");
  const results: { id: string; driveFolderId: string | null; name: string; source: string }[] = [];

  for (const entry of destinations) {
    const folder = await resolveDestinationFolder(contractId, entry, "oocc");
    if (folder) {
      results.push(folder);
    }
  }

  return results;
}

/**
 * Get or create ALL configured destination folders for invoice/credit note files.
 */
export async function getOrCreateInvoiceFolders(contractId: string): Promise<{ id: string; driveFolderId: string | null; name: string; source: string }[]> {
  const destinations = await getConfiguredDestinations("invoice_folder");
  const results: { id: string; driveFolderId: string | null; name: string; source: string }[] = [];

  for (const entry of destinations) {
    const folder = await resolveDestinationFolder(contractId, entry, "facturas");
    if (!folder) {
      if (entry.source !== "general") {
        const created = await getOrCreateRepoFolder(contractId, entry.name, "facturas");
        if (created) {
          results.push({ ...created, name: entry.name, source: "repo" });
        }
      }
    } else {
      results.push(folder);
    }
  }

  return results;
}

/**
 * Backup an invoice/credit note file to ALL configured destination folders.
 * Uploads to Google Drive and creates DB references.
 */
export async function backupInvoiceFileToRepository(
  contractId: string,
  file: File,
  fileName: string
): Promise<{ success: boolean; fileId?: string; driveUrl?: string; error?: string }> {
  try {
    const folders = await getOrCreateInvoiceFolders(contractId);
    if (folders.length === 0) {
      return { success: false, error: "No se pudo obtener o crear las carpetas de destino para facturas" };
    }

    const fileExt = file.name.split(".").pop() || null;
    const sanitizedName = sanitizeFileName(fileName);
    const datePrefix = new Date().toISOString().split("T")[0].replace(/-/g, "");
    const unique = Date.now();
    const storagePath = `invoice-files/${datePrefix}/${contractId}/${unique}_${sanitizedName}`;

    const { path: storedUrl, error: uploadError } = await uploadFileToStorage(storagePath, file);
    if (uploadError) {
      return { success: false, error: uploadError.message };
    }

    let primaryFileId: string | undefined;
    let primaryDriveUrl: string | undefined;
    for (const folder of folders) {
      const record = await insertFileReference(folder, fileName, storedUrl, fileExt, file, contractId);
      if (!primaryFileId && record) {
        primaryFileId = record.id;
        const table = folder.source === "general" ? "general_folder_files" : "repository_files";
        const { data: fileRecord } = await supabase.from(table).select("url").eq("id", record.id).single();
        if (fileRecord?.url) primaryDriveUrl = fileRecord.url;
      }
    }

    return { success: true, fileId: primaryFileId, driveUrl: primaryDriveUrl };
  } catch (error: any) {
    console.error("Error backing up invoice file:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Insert a file reference into the correct table based on source type.
 */
async function insertFileReference(
  folder: { id: string; source: string; name: string; driveFolderId: string | null },
  fileName: string,
  url: string,
  fileExt: string | null,
  file?: File,
  contractId?: string
): Promise<{ id: string } | null> {
  let driveFileId: string | null = null;
  let fileUrl = url;

  // Try uploading to Google Drive if we have the original file
  if (file && contractId) {
    const driveResult = await uploadFileToDriveForFolder(file, fileName, folder, contractId);
    if (driveResult) {
      driveFileId = driveResult.driveFileId;
      fileUrl = driveResult.driveUrl;
    }
  }

  const table = folder.source === "general" ? "general_folder_files" : "repository_files";
  const { data, error } = await supabase
    .from(table)
    .insert({
      folder_id: folder.id,
      name: fileName,
      url: fileUrl,
      file_type: fileExt,
      drive_file_id: driveFileId,
    })
    .select("id")
    .single();

  if (error) {
    console.error(`Error creating file in ${folder.source} folder '${folder.name}':`, error);
    return null;
  }
  return data;
}

/**
 * Backup an OC file to ALL configured destination folders.
 * Uploads the file to Google Drive and creates a reference in each destination folder.
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

    const fileExt = file.name.split(".").pop() || null;
    const sanitizedName = sanitizeFileName(file.name);
    const fileName = `OC_${orderNumber}_${sanitizedName}`;

    // Use storage as fallback URL (Drive URL will replace it if upload succeeds)
    const datePrefix = new Date().toISOString().split("T")[0].replace(/-/g, "");
    const unique = Date.now();
    const storagePath = `oc-files/${datePrefix}/${contractId}/OC_${orderNumber}_${unique}_${sanitizedName}`;

    const { path: storedUrl, error: uploadError } = await uploadFileToStorage(storagePath, file);
    if (uploadError) {
      return { success: false, error: uploadError.message };
    }

    let primaryFileId: string | undefined;
    for (const folder of folders) {
      const record = await insertFileReference(folder, fileName, storedUrl, fileExt, file, contractId);
      if (!primaryFileId && record) {
        primaryFileId = record.id;
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
 */
export async function backupOCFromStorageUrl(
  contractId: string,
  storageUrl: string,
  orderNumber: string,
  originalFileName: string,
  file?: File
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
      const record = await insertFileReference(folder, fileName, storageUrl, fileExt, file, contractId);
      if (!primaryFileId && record) {
        primaryFileId = record.id;
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
  originalFileName: string,
  file?: File
): Promise<{ successful: string[]; failed: string[] }> {
  const successful: string[] = [];
  const failed: string[] = [];

  for (const contractId of contractIds) {
    const result = await backupOCFromStorageUrl(
      contractId,
      storageUrl,
      orderNumber,
      originalFileName,
      file
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
 * Uploads to Google Drive and creates DB references.
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

  // Upload once to Storage as fallback, then upload to Drive per contract
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
    const result = await backupOCFromStorageUrl(contractId, storedUrl, orderNumber, originalFileName, file);
    if (result.success) {
      successful.push({ contractId, url: storedUrl, fileId: result.fileId || "" });
    } else {
      failed.push({ contractId, error: result.error || "Error desconocido" });
    }
  }

  return { successful, failed, primaryUrl: storedUrl };
}
