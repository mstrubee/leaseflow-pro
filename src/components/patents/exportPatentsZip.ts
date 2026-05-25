import JSZip from "jszip";
import { 
  ContractWithPatent, 
  PatentChecklistSection, 
  PatentChecklistItem,
  PatentEmitter,
  PatentItemEmitter,
  PatentSharedItem
} from "./types";
import { exportPatentsToExcelBuffer } from "./exportPatentsExcel";
import { getSignedUrl, isStorageUrl } from "@/lib/storageUtils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Download a ZIP containing the Excel checklist + all uploaded patent documents
 * (including files from the shared patents repository).
 */
export async function exportPatentsWithFiles(
  contract: ContractWithPatent,
  sections: PatentChecklistSection[],
  items: PatentChecklistItem[],
  emitters: PatentEmitter[],
  itemEmitters: PatentItemEmitter[],
  sectionId?: string,
  onProgress?: (msg: string) => void
) {
  const zip = new JSZip();

  // 1. Generate the Excel buffer and add to ZIP
  onProgress?.("Generando Excel...");
  const excelBuffer = await exportPatentsToExcelBuffer(contract, sections, items, emitters, itemEmitters, sectionId);
  const sectionName = sectionId 
    ? sections.find(s => s.id === sectionId)?.name.replace(/[^a-zA-Z0-9]/g, '_') || 'seccion'
    : 'todas_secciones';
  zip.file(`patentes_${sectionName}.csv`, excelBuffer);

  // 2. Collect all documents with URLs (from patent_documents AND shared repository)
  const sectionsToExport = sectionId 
    ? sections.filter(s => s.id === sectionId)
    : sections;

  const docs: { sectionName: string; itemName: string; url: string; fileName?: string }[] = [];

  // Load shared items mapping
  const { data: sharedItemsData } = await supabase
    .from("patent_shared_items")
    .select("checklist_item_id, shared_folder_id");
  const sharedItems: PatentSharedItem[] = (sharedItemsData as any[]) || [];
  const sharedFolderIds = [...new Set(sharedItems.map(si => si.shared_folder_id))];

  // Load shared repository files
  let sharedFilesCache: Record<string, { name: string; url: string }[]> = {};
  if (sharedFolderIds.length > 0) {
    const { data: sharedFiles } = await supabase
      .from("repository_files")
      .select("name, url, folder_id")
      .in("folder_id", sharedFolderIds);
    (sharedFiles || []).forEach((f: any) => {
      if (!sharedFilesCache[f.folder_id]) sharedFilesCache[f.folder_id] = [];
      sharedFilesCache[f.folder_id].push({ name: f.name, url: f.url });
    });
  }

  const sharedItemLookup: Record<string, string> = {};
  sharedItems.forEach(si => { sharedItemLookup[si.checklist_item_id] = si.shared_folder_id; });

  sectionsToExport.forEach(section => {
    const sectionItems = items.filter(i => i.section_id === section.id);
    const cleanSection = section.name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ ]/g, '_');
    sectionItems.forEach(item => {
      const cleanItem = item.name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ ]/g, '_');

      // Contract-specific document(s) — may contain multiple URLs joined by '|||'
      const doc = (contract.patent_documents || []).find(d => d.checklist_item_id === item.id);
      if (doc?.document_url) {
        const urls = doc.document_url.split('|||').filter(Boolean);
        const names = (doc as any).document_names
          ? String((doc as any).document_names).split('|||').filter(Boolean)
          : [];
        urls.forEach((u, idx) => {
          docs.push({
            sectionName: cleanSection,
            itemName: cleanItem,
            url: u,
            fileName: names[idx] || undefined,
          });
        });
      }

      // Shared repository files
      const sharedFolderId = sharedItemLookup[item.id];
      if (sharedFolderId && sharedFilesCache[sharedFolderId]) {
        sharedFilesCache[sharedFolderId].forEach(file => {
          docs.push({
            sectionName: `${cleanSection}_Repositorio_Comun`,
            itemName: cleanItem,
            url: file.url,
            fileName: file.name,
          });
        });
      }
    });
  });

  // Helper: extract Drive file id from any Drive/Docs URL
  const extractDriveFileId = (url: string): string | null => {
    const patterns = [
      /\/file\/d\/([^/?#]+)/,
      /\/document\/d\/([^/?#]+)/,
      /\/spreadsheets\/d\/([^/?#]+)/,
      /\/presentation\/d\/([^/?#]+)/,
      /\/drawings\/d\/([^/?#]+)/,
    ];
    for (const re of patterns) {
      const m = url.match(re);
      if (m) return m[1];
    }
    const m2 = url.match(/[?&]id=([^&]+)/);
    if (m2) return m2[1];
    return null;
  };

  const base64ToBlob = (base64: string, mimeType: string): Blob => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mimeType || "application/octet-stream" });
  };

  // Build name → drive_file_id map from repository_files for this contract's docs
  const allNames = Array.from(new Set(docs.map(d => d.fileName).filter(Boolean) as string[]));
  const nameToDriveId = new Map<string, string>();
  if (allNames.length > 0) {
    try {
      const { data: repoFiles } = await supabase
        .from("repository_files")
        .select("name, drive_file_id")
        .in("name", allNames)
        .not("drive_file_id", "is", null);
      (repoFiles || []).forEach((r: any) => {
        if (r.drive_file_id && !nameToDriveId.has(r.name)) {
          nameToDriveId.set(r.name, r.drive_file_id);
        }
      });
    } catch (e) {
      console.warn("Could not load repository_files name map:", e);
    }
  }

  // 3. Download each file and add to ZIP in a "Documentos" folder
  const skipped: { name: string; reason: string }[] = [];
  if (docs.length > 0) {
    const docsFolder = zip.folder("Documentos");
    let downloaded = 0;

    for (const doc of docs) {
      const label = doc.fileName || doc.itemName;
      try {
        onProgress?.(`Descargando archivo ${++downloaded}/${docs.length}...`);

        const isDriveUrl = /drive\.google\.com|docs\.google\.com/.test(doc.url);
        let blob: Blob | null = null;
        let driveFileName: string | null = null;
        let contentType: string | null = null;

        // Prefer drive_file_id from repository_files (source of truth)
        let driveFileId: string | null = doc.fileName ? (nameToDriveId.get(doc.fileName) || null) : null;
        if (!driveFileId && isDriveUrl) {
          driveFileId = extractDriveFileId(doc.url);
        }

        if (driveFileId) {
          const { data, error } = await supabase.functions.invoke("google-drive", {
            body: { action: "downloadFile", driveFileId },
          });
          if (error || !data?.base64) {
            const msg = (data as any)?.error || error?.message || "Drive download error";
            console.error(`Drive download failed for ${label}:`, msg);
            skipped.push({ name: label, reason: `Drive: ${msg}` });
            continue;
          }
          contentType = data.mimeType || null;
          driveFileName = data.fileName || null;
          blob = base64ToBlob(data.base64, data.mimeType);
        } else if (isDriveUrl) {
          console.warn(`Could not resolve Drive file id for ${label}: ${doc.url}`);
          skipped.push({ name: label, reason: "ID de Drive no extraíble" });
          continue;
        } else {
          let fetchUrl = doc.url;
          if (isStorageUrl(doc.url)) {
            const signed = await getSignedUrl(doc.url);
            if (signed) fetchUrl = signed;
          }
          try {
            const response = await fetch(fetchUrl);
            if (!response.ok) {
              skipped.push({ name: label, reason: `HTTP ${response.status}` });
              continue;
            }
            contentType = response.headers.get("content-type");
            blob = await response.blob();
          } catch (fe: any) {
            skipped.push({ name: label, reason: `Fetch: ${fe?.message || "error"}` });
            continue;
          }
        }

        if (!blob) {
          skipped.push({ name: label, reason: "Blob vacío" });
          continue;
        }

        const baseName = doc.fileName || driveFileName;
        const ext = baseName ? '' : getFileExtension(doc.url, contentType);
        const folderName = doc.sectionName;
        const fileName = baseName || `${doc.itemName}${ext}`;

        const sectionFolder = docsFolder!.folder(folderName);
        sectionFolder!.file(fileName, blob);
      } catch (err: any) {
        console.error(`Error downloading file for ${label}:`, err);
        skipped.push({ name: label, reason: err?.message || "error" });
      }
    }
  }

  const okCount = docs.length - skipped.length;
  if (skipped.length > 0) {
    console.warn("Archivos omitidos del ZIP:", skipped);
    toast.warning(`${okCount} archivo(s) descargado(s), ${skipped.length} omitido(s). Ver consola para detalle.`);
  }



  // 4. Generate and download ZIP
  onProgress?.("Generando ZIP...");
  const zipBlob = await zip.generateAsync({ type: "blob" });
  const contractName = contract.name.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `patentes_${contractName}_${sectionName}.zip`;

  const link = document.createElement('a');
  link.href = URL.createObjectURL(zipBlob);
  link.download = filename;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

function getFileExtension(url: string, contentType: string | null): string {
  // Try from URL first
  const urlPath = url.split('?')[0];
  const urlExt = urlPath.split('.').pop();
  if (urlExt && urlExt.length <= 5 && urlExt !== urlPath) {
    return `.${urlExt}`;
  }

  // Fallback to content-type
  const typeMap: Record<string, string> = {
    'application/pdf': '.pdf',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  };

  if (contentType && typeMap[contentType]) {
    return typeMap[contentType];
  }

  return '.pdf'; // Default
}
