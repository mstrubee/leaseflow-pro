import { 
  ContractWithPatent, 
  PatentChecklistSection, 
  PatentChecklistItem,
  STATUS_CONFIG
} from "./types";

interface ExportRow {
  seccion: string;
  documento: string;
  estado: string;
  responsable: string;
}

export function exportPatentsToExcel(
  contract: ContractWithPatent,
  sections: PatentChecklistSection[],
  items: PatentChecklistItem[]
) {
  const rows: ExportRow[] = [];

  // Build rows for each section and item
  sections.forEach(section => {
    const sectionItems = items.filter(item => item.section_id === section.id);
    
    sectionItems.forEach(item => {
      const doc = (contract.patent_documents || []).find(d => d.checklist_item_id === item.id);
      
      rows.push({
        seccion: section.name,
        documento: item.name,
        estado: doc?.status ? STATUS_CONFIG[doc.status]?.label || '' : '',
        responsable: doc?.responsible || '',
      });
    });
  });

  // Generate CSV content with BOM for Excel UTF-8 compatibility
  const BOM = '\uFEFF';
  const headers = ['Sección', 'Documento', 'Estado', 'Responsable'];
  const csvContent = BOM + [
    headers.join(';'),
    ...rows.map(row => 
      [row.seccion, row.documento, row.estado, row.responsable]
        .map(cell => `"${(cell || '').replace(/"/g, '""')}"`)
        .join(';')
    )
  ].join('\n');

  // Create and download file
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `patentes_${contract.name.replace(/[^a-zA-Z0-9]/g, '_')}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
