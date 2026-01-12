import { useCallback } from "react";
import { getSignedUrl, isStorageUrl } from "@/lib/storageUtils";
import { useToast } from "@/hooks/use-toast";

/**
 * Hook for securely opening files that may be stored in Supabase Storage.
 * Automatically converts storage paths to signed URLs before opening.
 */
export function useSecureFileAccess() {
  const { toast } = useToast();

  const openFile = useCallback(async (url: string | null | undefined) => {
    if (!url) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se encontró la URL del archivo",
      });
      return;
    }

    try {
      // If it's a storage URL, get a signed URL first
      if (isStorageUrl(url)) {
        const signedUrl = await getSignedUrl(url);
        if (signedUrl) {
          window.open(signedUrl, "_blank");
        } else {
          toast({
            variant: "destructive",
            title: "Error",
            description: "No se pudo acceder al archivo. Por favor, inicie sesión nuevamente.",
          });
        }
      } else {
        // External URL (Google Drive, etc.) - open directly
        window.open(url, "_blank");
      }
    } catch (error) {
      console.error("Error opening file:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo abrir el archivo",
      });
    }
  }, [toast]);

  /**
   * Get a signed URL for display in an anchor tag or image.
   * Returns the original URL if it's not a storage URL.
   */
  const getSecureUrl = useCallback(async (url: string | null | undefined): Promise<string | null> => {
    if (!url) return null;

    if (isStorageUrl(url)) {
      return await getSignedUrl(url);
    }
    
    return url;
  }, []);

  return { openFile, getSecureUrl };
}
