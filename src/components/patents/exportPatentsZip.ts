import JSZip from "jszip";
import { 
  ContractWithPatent, 
  PatentChecklistSection, 
  PatentChecklistItem,
  PatentEmitter,
  PatentItemEmitter
} from "./types";
import { exportPatentsToExcelBuffer } from "./exportPatentsExcel";
import { getSignedUrl, isStorageUrl } from "@/lib/storageUtils";

/**
 * Download a ZIP containing the Excel checklist + all uploaded patent documents.
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

  // 2. Collect all documents with URLs
  const sectionsToExport = sectionId 
    ? sections.filter(s => s.id === sectionId)
    : sections;

  const docs: { sectionName: string; itemName: string; url: string }[] = [];

  sectionsToExport.forEach(section => {
    const sectionItems = items.filter(i => i.section_id === section.id);
    sectionItems.forEach(item => {
      const doc = (contract.patent_documents || []).find(d => d.checklist_item_id === item.id);
      if (doc?.document_url) {
        docs.push({
          sectionName: section.name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ ]/g, '_'),
          itemName: item.name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ ]/g, '_'),
          url: doc.document_url,
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
        
        // Determine file extension from content-type or URL
        const ext = getFileExtension(doc.url, response.headers.get("content-type"));
        const folderName = doc.sectionName;
        const fileName = `${doc.itemName}${ext}`;

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
