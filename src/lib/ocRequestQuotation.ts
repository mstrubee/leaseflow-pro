import { supabase } from "@/integrations/supabase/client";
import { extractStoragePath } from "@/lib/storageUtils";
import type { QuotationFile } from "@/lib/ocRequestZip";

/**
 * Referencia a la cotización adjunta a un requerimiento/solicitud. El archivo
 * vive siempre en Drive (driveUrl) y, además, en una copia temporal en Supabase
 * Storage (storagePath) que se borra a los 30 días o al convertirse en
 * Solicitud de OC (ver cleanup-oc-quotation-files).
 */
export interface OCRequestQuotationRef {
  fileName: string | null;
  storagePath: string | null;
  driveUrl: string | null;
}

const BUCKET = "repository-files";

const driveFileIdFrom = (url: string | null): string | null => url?.match(/\/file\/d\/([^/?#]+)/)?.[1] ?? null;

function base64ToBlob(base64: string, mimeType?: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType || "application/octet-stream" });
}

/**
 * Obtiene los bytes de la cotización: primero la copia de Supabase Storage
 * (rápida) y, si no existe o ya fue purgada, desde Drive vía la Edge Function
 * `google-drive` (acción `downloadFile`, la misma que usa la exportación ZIP de
 * patentes). Devuelve null si no se pudo por ninguna vía.
 */
export async function fetchQuotationFile(ref: OCRequestQuotationRef): Promise<QuotationFile | null> {
  const fallbackName = ref.fileName || "Cotizacion";

  const storagePath = ref.storagePath ? extractStoragePath(ref.storagePath) ?? ref.storagePath : null;
  if (storagePath) {
    try {
      const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
      if (!error && data) return { blob: data, fileName: fallbackName };
    } catch (error) {
      console.warn("No se pudo leer la cotización desde Storage, se prueba con Drive.", error);
    }
  }

  const driveFileId = driveFileIdFrom(ref.driveUrl);
  if (driveFileId) {
    try {
      const { data, error } = await supabase.functions.invoke("google-drive", {
        body: { action: "downloadFile", driveFileId },
      });
      if (!error && data?.base64) {
        return { blob: base64ToBlob(data.base64, data.mimeType), fileName: ref.fileName || data.fileName || fallbackName };
      }
      console.warn("No se pudo descargar la cotización desde Drive:", (data as { error?: string })?.error || error?.message);
    } catch (error) {
      console.warn("Error al descargar la cotización desde Drive.", error);
    }
  }

  return null;
}
