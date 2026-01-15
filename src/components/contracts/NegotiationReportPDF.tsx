import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface ContractVersion {
  regime_rent: number;
  regime_rent_is_uf_m2?: boolean | null;
  initial_rent?: number | null;
  duration_months: number;
  is_current: boolean;
}

interface ContractAddress {
  region: string;
  commune: string;
  street?: string;
  number?: string;
}

interface ContractCompany {
  company_id: string;
  companies: { id: string; name: string } | null;
}

interface NegotiationContract {
  id: string;
  name: string;
  negotiation_subcategory: string | null;
  venta_estimada: number | null;
  contract_companies?: ContractCompany[];
  contract_addresses: ContractAddress[];
  contract_versions: ContractVersion[];
  superficie_edificada_local: number | null;
}

const subcategoryLabels: Record<string, string> = {
  negociacion_contrato: 'Negociación Contrato',
  ubicacion_preliminar: 'Ubicación Preliminar',
};

export const generateNegotiationReportPDF = (
  contracts: NegotiationContract[],
  subcategoryFilter: string
) => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Title
  const title = subcategoryFilter === 'todos' 
    ? 'Informe de Contratos en Negociación' 
    : `Informe: ${subcategoryLabels[subcategoryFilter] || subcategoryFilter}`;

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(title, pageWidth / 2, 15, { align: 'center' });

  // Date
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Generado el ${format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es })}`,
    pageWidth / 2,
    22,
    { align: 'center' }
  );

  // Summary
  const negociacionCount = contracts.filter(c => c.negotiation_subcategory === 'negociacion_contrato').length;
  const ubicacionCount = contracts.filter(c => c.negotiation_subcategory === 'ubicacion_preliminar').length;
  const totalVenta = contracts.reduce((sum, c) => sum + (c.venta_estimada || 0), 0);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Resumen', 14, 32);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  
  const summaryItems = [
    `Total contratos: ${contracts.length}`,
    `Negociación Contrato: ${negociacionCount}`,
    `Ubicación Preliminar: ${ubicacionCount}`,
    `Venta Estimada Total: $${totalVenta.toLocaleString('es-CL')}`,
  ];

  summaryItems.forEach((item, idx) => {
    doc.text(item, 14 + (idx * 70), 38);
  });

  // Table data
  const tableData = contracts.map((contract) => {
    const currentVersion = contract.contract_versions?.find((v) => v.is_current);
    const address = contract.contract_addresses?.[0];
    const companies = contract.contract_companies?.map(cc => cc.companies?.name).filter(Boolean).join(', ') || '-';
    
    const addressText = address 
      ? `${address.commune}${address.street ? `, ${address.street} ${address.number || ''}` : ''}`
      : '-';

    // Calculate rent - multiply by superficie if UF/m2
    let rentText = '-';
    if (currentVersion) {
      const superficie = contract.superficie_edificada_local || 0;
      const isRentUfM2 = currentVersion.regime_rent_is_uf_m2 === true;
      const rentAmount = isRentUfM2 ? currentVersion.regime_rent * superficie : currentVersion.regime_rent;
      if (isRentUfM2 && superficie > 0) {
        rentText = `${rentAmount.toLocaleString('es-CL', { minimumFractionDigits: 2 })} UF\n(${currentVersion.regime_rent.toLocaleString('es-CL', { minimumFractionDigits: 2 })} UF/m²)`;
      } else {
        rentText = `${rentAmount.toLocaleString('es-CL', { minimumFractionDigits: 2 })} UF`;
      }
    }

    // Calculate venta estimada with range and per m2
    let ventaText = '-';
    if (contract.venta_estimada) {
      const ventaMin = contract.venta_estimada;
      const ventaMax = (contract as any).venta_estimada_max || ventaMin;
      const superficie = contract.superficie_edificada_local || 0;
      const ventaMinMM = (ventaMin / 1000000).toFixed(0);
      const ventaMaxMM = (ventaMax / 1000000).toFixed(0);
      ventaText = ventaMin === ventaMax 
        ? `$${ventaMinMM} MM` 
        : `$${ventaMinMM} - $${ventaMaxMM} MM`;
      if (superficie > 0) {
        const ventaM2Min = Math.round(ventaMin / superficie);
        const ventaM2Max = Math.round(ventaMax / superficie);
        ventaText += ventaM2Min === ventaM2Max 
          ? `\n($${ventaM2Min.toLocaleString('es-CL')}/m²)` 
          : `\n($${ventaM2Min.toLocaleString('es-CL')} - $${ventaM2Max.toLocaleString('es-CL')}/m²)`;
      }
    }

    return [
      contract.name,
      companies,
      subcategoryLabels[contract.negotiation_subcategory || 'negociacion_contrato'] || '-',
      addressText,
      contract.superficie_edificada_local 
        ? `${contract.superficie_edificada_local.toLocaleString('es-CL')} m²` 
        : '-',
      rentText,
      currentVersion 
        ? `${currentVersion.duration_months} meses` 
        : '-',
      ventaText,
    ];
  });

  // Table
  autoTable(doc, {
    startY: 45,
    head: [[
      'Contrato',
      'Empresa',
      'Categoría',
      'Ubicación',
      'Superficie',
      'Canon',
      'Duración',
      'Venta Est.',
    ]],
    body: tableData,
    styles: {
      fontSize: 8,
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [220, 38, 38],
      textColor: 255,
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 45 },
      1: { cellWidth: 35 },
      2: { cellWidth: 35 },
      3: { cellWidth: 45 },
      4: { cellWidth: 25, halign: 'right' },
      5: { cellWidth: 25, halign: 'right' },
      6: { cellWidth: 25, halign: 'center' },
      7: { cellWidth: 30, halign: 'right' },
    },
    alternateRowStyles: {
      fillColor: [245, 247, 250],
    },
    margin: { left: 14, right: 14 },
  });

  // Footer
  const pageCount = doc.getNumberOfPages();
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
  const fileName = subcategoryFilter === 'todos'
    ? `informe_negociacion_${format(new Date(), 'yyyy-MM-dd')}.pdf`
    : `informe_${subcategoryFilter}_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
  
  doc.save(fileName);
};
