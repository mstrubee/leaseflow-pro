import { supabase } from "@/integrations/supabase/client";

const BUCKET_NAME = "repository-files";
const SIGNED_URL_EXPIRY_SECONDS = 3600; // 1 hour

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
