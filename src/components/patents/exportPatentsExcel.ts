import { 
  ContractWithPatent, 
  PatentChecklistSection, 
  PatentChecklistItem,
  PatentEmitter,
  PatentItemEmitter
} from "./types";
import { supabase } from "@/integrations/supabase/client";

interface ExportRow {
  seccion: string;
  documento: string;
  estado: string;
  responsable: string;
  emisor: string;
  fecha_inicio: string;
  plazo: string;
  fecha_entrega: string;
  notas: string;
}

// Fetch dynamic statuses from database
async function fetchStatuses(): Promise<Record<string, string>> {
  const { data } = await supabase
    .from("patent_statuses")
    .select("code, name")
    .eq("is_active", true);
  
  const statusMap: Record<string, string> = {};
  (data || []).forEach((s: any) => {
    statusMap[s.code] = s.name;
  });
  return statusMap;
}

// Internal function to build CSV content string
async function buildCsvContent(
  contract: ContractWithPatent,
  sections: PatentChecklistSection[],
  items: PatentChecklistItem[],
  emitters: PatentEmitter[],
  itemEmitters: PatentItemEmitter[],
  sectionId?: string
): Promise<string> {
  const statusMap = await fetchStatuses();
  const rows: ExportRow[] = [];

  // Filter sections if sectionId provided
  const sectionsToExport = sectionId 
    ? sections.filter(s => s.id === sectionId)
    : sections;

  // Build emitter lookup
  const emitterLookup: Record<string, string> = {};
  emitters.forEach(e => { emitterLookup[e.id] = e.name; });

  // Build fixed emitter lookup (item_id -> emitter_id)
  const fixedEmitterLookup: Record<string, string> = {};
  itemEmitters.forEach(ie => {
    fixedEmitterLookup[ie.checklist_item_id] = ie.emitter_id;
  });

  // Build rows for each section and item
  sectionsToExport.forEach(section => {
    const sectionItems = items.filter(item => item.section_id === section.id);
    
    sectionItems.forEach(item => {
      const doc = (contract.patent_documents || []).find(d => d.checklist_item_id === item.id);
      
      // Skip items with status "no_aplica"
      if (doc?.status === 'no_aplica') return;

      // Get emitter - prefer document emitter, fallback to fixed emitter
      let emitterName = '';
      if (doc?.emitter_id) {
        emitterName = emitterLookup[doc.emitter_id] || '';
      } else if (fixedEmitterLookup[item.id]) {
        emitterName = emitterLookup[fixedEmitterLookup[item.id]] || '';
      }

      rows.push({
        seccion: section.name,
        documento: item.name,
        estado: doc?.status ? (statusMap[doc.status] || doc.status) : '',
        responsable: doc?.responsible || '',
        emisor: emitterName,
        fecha_inicio: doc?.start_date || '',
        plazo: doc?.deadline_days ? `${doc.deadline_days} días` : '',
        fecha_entrega: doc?.end_date || '',
        notas: doc?.notes || '',
      });
    });
  });

  // Generate CSV content with BOM for Excel UTF-8 compatibility
  const BOM = '\uFEFF';
  const headers = ['Sección', 'Documento', 'Estado', 'Responsable', 'Emisor', 'Fecha Inicio', 'Plazo', 'Fecha Entrega', 'Notas'];
  return BOM + [
    headers.join(';'),
    ...rows.map(row => 
      [row.seccion, row.documento, row.estado, row.responsable, row.emisor, row.fecha_inicio, row.plazo, row.fecha_entrega, row.notas]
        .map(cell => `"${(cell || '').replace(/"/g, '""')}"`)
        .join(';')
    )
  ].join('\n');
}

/**
 * Export patents checklist as CSV and trigger browser download.
 */
export async function exportPatentsToExcel(
  contract: ContractWithPatent,
  sections: PatentChecklistSection[],
  items: PatentChecklistItem[],
  emitters: PatentEmitter[],
  itemEmitters: PatentItemEmitter[],
  sectionId?: string
) {
  const csvContent = await buildCsvContent(contract, sections, items, emitters, itemEmitters, sectionId);

  const sectionsToExport = sectionId ? sections.filter(s => s.id === sectionId) : sections;
  const sectionName = sectionId 
    ? sectionsToExport[0]?.name.replace(/[^a-zA-Z0-9]/g, '_') 
    : 'todas_secciones';
  const contractName = contract.name.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `patentes_${contractName}_${sectionName}.csv`;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Returns the CSV content as a string buffer (for use in ZIP packaging).
 */
export async function exportPatentsToExcelBuffer(
  contract: ContractWithPatent,
  sections: PatentChecklistSection[],
  items: PatentChecklistItem[],
  emitters: PatentEmitter[],
  itemEmitters: PatentItemEmitter[],
  sectionId?: string
): Promise<string> {
  return buildCsvContent(contract, sections, items, emitters, itemEmitters, sectionId);
}
