import { supabase } from "@/integrations/supabase/client";
import { sanitizeFileName } from "@/lib/fileValidation";

const EVIDENCIA_FOLDER_NAME = "Evidencia de Mantención";

/**
 * Gets or creates the "Evidencia de Mantención" subfolder inside the
 * contract's Drive folder, then uploads a photo file to it.
 *
 * Returns the public Drive view URL, or null on failure.
 */
export async function uploadEvidenciaToContractDrive(
  file: File,
  contractId: string,
  formNumber: string,
): Promise<string | null> {
  try {
    // 1. Get the contract's root Drive folder ID
    const { data: contract, error: contractErr } = await supabase
      .from("contracts")
      .select("drive_folder_id, name")
      .eq("id", contractId)
      .single();

    if (contractErr || !contract?.drive_folder_id) {
      console.warn("[driveEvidencia] Contract has no Drive folder:", contractId);
      return null;
    }

    // 2. Ensure "Evidencia de Mantención" subfolder exists
    const { data: folderData, error: folderErr } = await supabase.functions.invoke(
      "google-drive",
      {
        body: {
          action: "ensureSubfolderExists",
          parentDriveFolderId: contract.drive_folder_id,
          folderName: EVIDENCIA_FOLDER_NAME,
        },
      },
    );

    if (folderErr || !folderData?.id) {
      console.error("[driveEvidencia] Could not get/create subfolder:", folderErr);
      return null;
    }

    const evidenciaFolderId: string = folderData.id;

    // 3. Build filename: FORM_NUMBER_YYYYMMDD_HHMMSS_originalname
    const now = new Date();
    const timestamp = now
      .toISOString()
      .replace(/[-:T]/g, "")
      .slice(0, 15);
    const sanitized = sanitizeFileName(file.name);
    const fileName = `${formNumber}_${timestamp}_${sanitized}`;

    // 4. Stage to Supabase Storage then push to Drive
    const uploadPath = `maintenance-evidencia/${contractId}/${Date.now()}_${sanitized}`;

    const { error: storageError } = await supabase.storage
      .from("repository-files")
      .upload(uploadPath, file, { upsert: true });

    if (storageError) {
      console.error("[driveEvidencia] Storage upload failed:", storageError);
      return null;
    }

    const storageUrl = `storage://repository-files/${uploadPath}`;

    const { data: uploadData, error: uploadErr } = await supabase.functions.invoke(
      "google-drive",
      {
        body: {
          action: "uploadFileFromStorage",
          fileName,
          storageUrl,
          mimeType: file.type || "image/jpeg",
          driveFolderId: evidenciaFolderId,
        },
      },
    );

    // Cleanup temp file regardless
    supabase.storage.from("repository-files").remove([uploadPath]).catch(() => {});

    if (uploadErr || !uploadData) {
      console.error("[driveEvidencia] Drive upload failed:", uploadErr);
      return null;
    }

    return (
      uploadData.webViewLink ||
      `https://drive.google.com/file/d/${uploadData.id}/view`
    );
  } catch (err) {
    console.error("[driveEvidencia] Unexpected error:", err);
    return null;
  }
}

/**
 * Migra una foto que ya está en Supabase Storage (public URL) al Drive del
 * contrato, y borra la copia de Storage. Devuelve la URL de Drive, o null si
 * falla (en cuyo caso NO se borra de Storage, para no perder la evidencia).
 */
export async function migrateStorageEvidenceToDrive(
  publicUrl: string,
  contractId: string,
  formNumber: string,
): Promise<string | null> {
  try {
    // Extraer el path de Storage desde la URL pública
    const marker = "/public/repository-files/";
    const idx = publicUrl.indexOf(marker);
    if (idx < 0) return null; // no es una URL de Storage gestionable
    const storagePath = decodeURIComponent(publicUrl.slice(idx + marker.length).split("?")[0]);

    const { data: contract, error: contractErr } = await supabase
      .from("contracts")
      .select("drive_folder_id")
      .eq("id", contractId)
      .single();
    if (contractErr || !contract?.drive_folder_id) return null;

    const { data: folderData, error: folderErr } = await supabase.functions.invoke("google-drive", {
      body: {
        action: "ensureSubfolderExists",
        parentDriveFolderId: contract.drive_folder_id,
        folderName: EVIDENCIA_FOLDER_NAME,
      },
    });
    if (folderErr || !folderData?.id) return null;

    const baseName = storagePath.split("/").pop() || "evidencia.jpg";
    const fileName = `${formNumber}_${baseName}`;
    const { data: uploadData, error: uploadErr } = await supabase.functions.invoke("google-drive", {
      body: {
        action: "uploadFileFromStorage",
        fileName,
        storageUrl: `storage://repository-files/${storagePath}`,
        mimeType: "image/jpeg",
        driveFolderId: folderData.id,
      },
    });
    if (uploadErr || !uploadData) return null;

    // Subida OK → liberar Storage
    await supabase.storage.from("repository-files").remove([storagePath]).catch(() => {});

    return uploadData.webViewLink || `https://drive.google.com/file/d/${uploadData.id}/view`;
  } catch (err) {
    console.error("[migrateStorageEvidenceToDrive] Unexpected error:", err);
    return null;
  }
}
