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
      
      // Contract-specific document
      const doc = (contract.patent_documents || []).find(d => d.checklist_item_id === item.id);
      if (doc?.document_url) {
        docs.push({ sectionName: cleanSection, itemName: cleanItem, url: doc.document_url });
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

  // 3. Download each file and add to ZIP in a "Documentos" folder
  if (docs.length > 0) {
    const docsFolder = zip.folder("Documentos");
    let downloaded = 0;

    for (const doc of docs) {
      try {
        onProgress?.(`Descargando archivo ${++downloaded}/${docs.length}...`);
        
        let fetchUrl = doc.url;
        if (isStorageUrl(doc.url)) {
          const signed = await getSignedUrl(doc.url);
          if (signed) fetchUrl = signed;
        }

        const response = await fetch(fetchUrl);
        if (!response.ok) continue;

        const blob = await response.blob();
        
        // Determine file name
        const ext = doc.fileName ? '' : getFileExtension(doc.url, response.headers.get("content-type"));
        const folderName = doc.sectionName;
        const fileName = doc.fileName || `${doc.itemName}${ext}`;

        const sectionFolder = docsFolder!.folder(folderName);
        sectionFolder!.file(fileName, blob);
      } catch (err) {
        console.error(`Error downloading file for ${doc.itemName}:`, err);
        // Skip failed downloads
      }
    }
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
