import { supabase } from "@/integrations/supabase/client";

const BUCKET_NAME = "repository-files";
const SIGNED_URL_EXPIRY_SECONDS = 3600; // 1 hour

// Private buckets whose stored values (storage:// paths or legacy public URLs)
// must be converted to short-lived signed URLs before they can be fetched/displayed.
const PRIVATE_BUCKETS = ["repository-files", "ot-files", "expense-receipts"] as const;

/**
 * Resolve any stored file reference to a usable URL.
 *
 * Handles:
 *  - storage://<bucket>/<path>      → signed URL
 *  - legacy public URLs containing /<bucket>/<path> → signed URL
 *  - tagged entries like "[Evidencia Visita] <url>" → strips the tag, signs the URL
 *  - external URLs (Google Drive, etc.) → returned unchanged
 *
 * Because the buckets are private, this MUST be used anywhere a file is fetched,
 * downloaded, displayed as an image, or embedded into a PDF/email.
 */
export async function resolveFileUrl(
  storedValue: string | null | undefined,
  expirySeconds: number = SIGNED_URL_EXPIRY_SECONDS
): Promise<string | null> {
  if (!storedValue) return null;

  // Strip a leading "[tag] " prefix (used by maintenance evidence entries)
  const tagMatch = storedValue.match(/^\[[^\]]+\]\s*(.*)$/);
  const value = tagMatch ? tagMatch[1] : storedValue;

  // External / non-storage URLs: return as-is
  if (
    value.startsWith("https://drive.google.com") ||
    value.startsWith("https://docs.google.com")
  ) {
    return value;
  }

  for (const bucket of PRIVATE_BUCKETS) {
    let filePath: string | null = null;

    if (value.startsWith(`storage://${bucket}/`)) {
      filePath = value.replace(`storage://${bucket}/`, "");
    } else if (value.includes(`/${bucket}/`)) {
      const parts = value.split(`/${bucket}/`);
      if (parts.length > 1) filePath = decodeURIComponent(parts[1]);
    }

    if (filePath) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(filePath, expirySeconds);
      if (error) {
        console.error(`Error creating signed URL for ${bucket}:`, error);
        return null;
      }
      return data.signedUrl;
    }
  }

  // Unknown format — return as-is so external links keep working
  return value;
}

/**
 * Upload a file to the repository-files bucket and return the storage path.
 * The storage path should be stored in the database instead of public URLs.
 */
export async function uploadFileToStorage(
  filePath: string,
  file: File
): Promise<{ path: string; error: Error | null }> {
  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, file);

  if (error) {
    return { path: "", error };
  }

  // Return the storage path prefixed with bucket identifier for later retrieval
  return { path: `storage://${BUCKET_NAME}/${filePath}`, error: null };
}

/**
 * Generate a signed URL for a file stored in Supabase storage.
 * This works for both new format (storage://bucket/path) and legacy public URLs.
 */
export async function getSignedUrl(
  storedUrl: string,
  expirySeconds: number = SIGNED_URL_EXPIRY_SECONDS
): Promise<string | null> {
  // If it's a Google Drive URL or external URL, return as-is
  if (
    storedUrl.startsWith("https://drive.google.com") ||
    storedUrl.startsWith("https://docs.google.com") ||
    (!storedUrl.includes(BUCKET_NAME) && !storedUrl.startsWith("storage://"))
  ) {
    return storedUrl;
  }

  let filePath: string;

  // Handle new storage:// format
  if (storedUrl.startsWith(`storage://${BUCKET_NAME}/`)) {
    filePath = storedUrl.replace(`storage://${BUCKET_NAME}/`, "");
  } 
  // Handle legacy public URL format
  else if (storedUrl.includes(`/${BUCKET_NAME}/`)) {
    const urlParts = storedUrl.split(`/${BUCKET_NAME}/`);
    if (urlParts.length > 1) {
      filePath = decodeURIComponent(urlParts[1]);
    } else {
      return storedUrl; // Can't parse, return as-is
    }
  } else {
    return storedUrl; // Unknown format, return as-is
  }

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(filePath, expirySeconds);

  if (error) {
    console.error("Error creating signed URL:", error);
    return null;
  }

  return data.signedUrl;
}

/**
 * Extract the storage file path from a stored URL.
 * Works with both new storage:// format and legacy public URLs.
 */
export function extractStoragePath(storedUrl: string): string | null {
  if (storedUrl.startsWith(`storage://${BUCKET_NAME}/`)) {
    return storedUrl.replace(`storage://${BUCKET_NAME}/`, "");
  }
  
  if (storedUrl.includes(`/${BUCKET_NAME}/`)) {
    const urlParts = storedUrl.split(`/${BUCKET_NAME}/`);
    if (urlParts.length > 1) {
      return decodeURIComponent(urlParts[1]);
    }
  }
  
  return null;
}

/**
 * Delete a file from storage using the stored URL format.
 */
export async function deleteFileFromStorage(
  storedUrl: string
): Promise<{ error: Error | null }> {
  const filePath = extractStoragePath(storedUrl);
  
  if (!filePath) {
    return { error: new Error("Invalid storage URL format") };
  }

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([filePath]);

  return { error: error ? new Error(error.message) : null };
}

/**
 * Check if a URL is a Supabase storage URL (needs signed URL conversion)
 */
export function isStorageUrl(url: string): boolean {
  return (
    url.startsWith(`storage://${BUCKET_NAME}/`) ||
    url.includes(`/${BUCKET_NAME}/`)
  );
}
