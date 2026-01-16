import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, addMonths, subMonths, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import logosHeader from "@/assets/logos-header.png";
import { calculateTotalArriendoUF } from "@/lib/contractRent";

interface ContractVersion {
  // Base rent
  regime_rent: number;
  regime_rent_is_uf_m2?: boolean | null;
  initial_rent?: number | null;
  initial_rent_is_uf_m2?: boolean | null;
  effective_date?: string | null;
  grace_months?: number | null;

  // Escalations & adjustments
  rent_escalations?: Array<{ month_number: number; amount: number }>;
  has_periodic_adjustments?: boolean | null;
  first_adjustment_month?: number | null;
  adjustment_periodicity_months?: number | null;
  adjustment_type?: string | null;
  adjustment_value?: number | null;

  // GGCC
  gastos_comunes_methodology?: string | null;
  gastos_comunes_percentage?: number | null;
  gastos_comunes_total_centro?: number | null;
  gastos_comunes_tope?: number | null;
  gastos_comunes_tope_type?: string | null;
  gastos_comunes_uf_m2?: number | null;
  gastos_comunes_uf_ml_frente?: number | null;
  gastos_comunes_prorrata_kwh_clima?: number | null;
  adicional_administracion_percentage?: number | null;
  has_extended_gastos_comunes?: boolean | null;

  // FP + Otros
  fondo_promocion_percentage?: number | null;
  otros_egresos_amount?: number | null;

  // Existing fields used in this file
  duration_months: number;
  is_current: boolean;
  notice_type: string;
  notice_value: string;
  notice_ranges?: Array<{ start_month: number; end_month: number }>;
}

interface Contract {
  id: string;
  name: string;
  status: string;
  signed_date: string | null;
  negotiation_subcategory?: string | null;
  venta_estimada?: number | null;
  clasificacion?: string | null;
  origen?: string | null;
  metros_lineales_frente?: number | null;
  contract_companies?: Array<{ companies: { name: string } | null }>;
  contract_addresses: Array<{ region: string; commune: string; street?: string; number?: string }>;
  contract_versions: ContractVersion[];
  superficie_edificada_local: number | null;
}

export interface PDFColumn {
  key: string;
  label: string;
}

// Available columns for PDF export
export const getAvailableColumns = (isFirmadoView: boolean, isNegociacionView: boolean): PDFColumn[] => {
  const baseColumns: PDFColumn[] = [
    { key: "contrato", label: "Contrato" },
    { key: "empresa", label: "Empresa" },
    { key: "ubicacion", label: "Ubicación" },
    { key: "direccion", label: "Dirección" },
    { key: "costo_arriendo", label: "Costo Arriendo" },
    { key: "duracion", label: "Duración" },
  ];

  if (isFirmadoView) {
    baseColumns.push(
      { key: "termino", label: "Término" },
      { key: "aviso", label: "Aviso" }
    );
  }

  if (isNegociacionView) {
    baseColumns.push(
      { key: "categoria", label: "Categoría" },
      { key: "clasificacion", label: "Clasificación" },
      { key: "origen", label: "Origen" },
      { key: "venta_estimada", label: "Venta Est." }
    );
  }

  return baseColumns;
};

const calculateEndDate = (contract: Contract): Date | null => {
  const currentVersion = contract.contract_versions?.find((v) => v.is_current);
  if (!currentVersion) return null;

  const startDate = currentVersion.effective_date
    ? parseISO(currentVersion.effective_date)
    : contract.signed_date
      ? parseISO(contract.signed_date)
      : null;

  if (!startDate) return null;
  return addMonths(startDate, currentVersion.duration_months);
};

const calculateNoticeDeadline = (contract: Contract): Date | null => {
  const currentVersion = contract.contract_versions?.find((v) => v.is_current);
  if (!currentVersion) return null;

  const startDate = currentVersion.effective_date
    ? parseISO(currentVersion.effective_date)
    : contract.signed_date
      ? parseISO(contract.signed_date)
      : null;

  if (currentVersion.notice_type === "fecha" && currentVersion.notice_value) {
    return parseISO(currentVersion.notice_value);
  }

  if (currentVersion.notice_type === "rangos" && startDate) {
    const noticeRanges = currentVersion.notice_ranges || [];
    if (noticeRanges.length > 0) {
      const today = new Date();
      const sortedRanges = [...noticeRanges].sort((a, b) => a.start_month - b.start_month);
      
      for (const range of sortedRanges) {
        const rangeStartDate = addMonths(startDate, range.start_month - 1);
        if (rangeStartDate > today) {
          return rangeStartDate;
        }
      }
      
      if (sortedRanges.length > 0) {
        const lastRange = sortedRanges[sortedRanges.length - 1];
        return addMonths(startDate, lastRange.start_month - 1);
      }
    }
  }

  const endDate = calculateEndDate(contract);
  if (!endDate) return null;

  const noticeMonths = parseInt(currentVersion.notice_value) || 0;
  return subMonths(endDate, noticeMonths);
};

const subcategoryLabels: Record<string, string> = {
  negociacion_contrato: "Rev. Contrato",
  ubicacion_preliminar: "Ubic. Preliminar",
};

const clasificacionLabels: Record<string, string> = {
  "1": "1",
  "2": "2",
  "3": "3",
};

const origenLabels: Record<string, string> = {
  corredor: "Corredor",
  gestion_directa: "Gestión Directa",
  inversionista: "Inversionista",
};

export const generateContractsListPDF = async (
  contracts: Contract[],
  selectedColumns: string[],
  title: string,
  isFirmadoView: boolean,
  isNegociacionView: boolean
) => {
  const doc = new jsPDF({ orientation: 'landscape' });
  const today = new Date().toLocaleDateString('es-CL');

  // Add logo
  try {
    const logoImg = new Image();
    logoImg.src = logosHeader;
    await new Promise((resolve, reject) => {
      logoImg.onload = resolve;
      logoImg.onerror = reject;
    });
    doc.addImage(logoImg, 'PNG', 14, 10, 50, 20);
  } catch (error) {
    console.log('Error loading logo:', error);
  }

  // Title
  doc.setFontSize(18);
  doc.text(title, 70, 20);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generado: ${today} | Total: ${contracts.length} contratos`, 70, 28);
  doc.setTextColor(0);

  // Get column definitions based on selection
  const allColumns = getAvailableColumns(isFirmadoView, isNegociacionView);
  const columns = allColumns.filter(col => selectedColumns.includes(col.key));

  // Build headers
  const headers = columns.map(col => col.label);

  // Build data rows
  const tableData = contracts.map(contract => {
    const currentVersion = contract.contract_versions?.find(v => v.is_current);
    const address = contract.contract_addresses?.[0];
    const companies = contract.contract_companies?.map(cc => cc.companies?.name).filter(Boolean).join(', ') || '-';
    const endDate = calculateEndDate(contract);
    const noticeDeadline = calculateNoticeDeadline(contract);

    const rowData: string[] = [];

    columns.forEach(col => {
      switch (col.key) {
        case "contrato":
          rowData.push(contract.name);
          break;
        case "empresa":
          rowData.push(companies);
          break;
        case "ubicacion":
          rowData.push(address?.commune || '-');
          break;
        case "direccion":
          rowData.push(address ? `${address.street || ''} ${address.number || ''}`.trim() || '-' : '-');
          break;
        case "costo_arriendo":
          if (currentVersion) {
            const superficie = contract.superficie_edificada_local || 0;
            const metrosFrente = contract.metros_lineales_frente || 0;

            const breakdown = calculateTotalArriendoUF({
              version: currentVersion,
              signedDate: contract.signed_date,
              superficie,
              metrosLinealesFrente: metrosFrente,
            });

            const fmt = (n: number) => n.toLocaleString('es-CL', { minimumFractionDigits: 2 });
            const lines: string[] = [`${fmt(breakdown.total)} UF`];

            // If base is UF/m², keep that reference visible
            if (breakdown.regimeRentUfM2 != null && superficie > 0) {
              lines.push(`(Canon ${fmt(breakdown.regimeRentUfM2)} UF/m²)`);
            }

            const extras: string[] = [];
            if (breakdown.ggcc > 0) extras.push(`GGCC ${fmt(breakdown.ggcc)}`);
            if (breakdown.fondoPromocion > 0) extras.push(`FP ${fmt(breakdown.fondoPromocion)}`);
            if (breakdown.otrosEgresos > 0) extras.push(`Otros ${fmt(breakdown.otrosEgresos)}`);
            if (extras.length > 0) {
              lines.push(`(${extras.join(' + ')})`);
            }

            rowData.push(lines.join('\n'));
          } else {
            rowData.push('-');
          }
          break;
        case "duracion":
          rowData.push(currentVersion ? `${currentVersion.duration_months} meses` : '-');
          break;
        case "termino":
          rowData.push(endDate ? format(endDate, "dd/MM/yy", { locale: es }) : '-');
          break;
        case "aviso":
          rowData.push(noticeDeadline ? format(noticeDeadline, "dd/MM/yy", { locale: es }) : '-');
          break;
        case "categoria":
          rowData.push(subcategoryLabels[contract.negotiation_subcategory || ''] || '-');
          break;
        case "clasificacion":
          rowData.push(clasificacionLabels[contract.clasificacion || ''] || contract.clasificacion || '-');
          break;
        case "origen":
          rowData.push(origenLabels[contract.origen || ''] || '-');
          break;
        case "venta_estimada":
          if (contract.venta_estimada) {
            const ventaMin = contract.venta_estimada;
            const ventaMax = (contract as any).venta_estimada_max || ventaMin;
            const superficie = contract.superficie_edificada_local || 0;
            const ventaMinMM = (ventaMin / 1000000).toFixed(0);
            const ventaMaxMM = (ventaMax / 1000000).toFixed(0);
            let text = ventaMin === ventaMax 
              ? `$${ventaMinMM} MM` 
              : `$${ventaMinMM} - $${ventaMaxMM} MM`;
            if (superficie > 0) {
              const ventaM2Min = Math.round(ventaMin / superficie);
              const ventaM2Max = Math.round(ventaMax / superficie);
              text += ventaM2Min === ventaM2Max 
                ? `\n($${ventaM2Min.toLocaleString('es-CL')}/m²)` 
                : `\n($${ventaM2Min.toLocaleString('es-CL')} - $${ventaM2Max.toLocaleString('es-CL')}/m²)`;
            }
            rowData.push(text);
          } else {
            rowData.push('-');
          }
          break;
        default:
          rowData.push('-');
      }
    });

    return rowData;
  });

  // Calculate column widths
  const pageWidth = doc.internal.pageSize.getWidth();
  const availableWidth = pageWidth - 28; // margins
  const colWidth = availableWidth / columns.length;

  const columnStyles: Record<number, { cellWidth: number; halign?: 'left' | 'center' | 'right' }> = {};
  columns.forEach((col, idx) => {
    columnStyles[idx] = { 
      cellWidth: colWidth,
      halign: ['costo_arriendo', 'venta_estimada'].includes(col.key) ? 'right' : 
              ['duracion', 'termino', 'aviso', 'categoria', 'clasificacion'].includes(col.key) ? 'center' : 'left'
    };
  });

  // Generate table
  autoTable(doc, {
    startY: 36,
    head: [headers],
    body: tableData,
    theme: 'grid',
    headStyles: { 
      fillColor: [220, 38, 38],
      textColor: 255,
      fontStyle: 'bold',
      halign: 'center'
    },
    margin: { left: 14, right: 14 },
    columnStyles,
    styles: {
      fontSize: 8,
      cellPadding: 3,
      overflow: 'linebreak',
    },
    alternateRowStyles: {
      fillColor: [245, 247, 250],
    },
  });

  // Footer with page numbers
  const pageCount = doc.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128);
    doc.text(
      `Página ${i} de ${pageCount}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    );
  }

  // Download
  const fileName = `contratos_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
  doc.save(fileName);
};
