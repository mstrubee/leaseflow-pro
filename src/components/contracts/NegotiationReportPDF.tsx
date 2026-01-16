import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { calculateTotalArriendoUF } from '@/lib/contractRent';

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
  signed_date?: string | null;
  negotiation_subcategory: string | null;
  venta_estimada: number | null;
  metros_lineales_frente?: number | null;
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

    // Arriendo total (Canon + GGCC + Fondo Promoción + Otros)
    let rentText = '-';
    if (currentVersion) {
      const superficie = contract.superficie_edificada_local || 0;
      const metrosFrente = contract.metros_lineales_frente || 0;

      const breakdown = calculateTotalArriendoUF({
        version: currentVersion,
        signedDate: contract.signed_date ?? null,
        superficie,
        metrosLinealesFrente: metrosFrente,
      });

      // UF totals: 2 decimals max | UF/m²: 3 decimals max
      const fmtUF = (n: number) => n.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const fmtUFM2 = (n: number) => n.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
      const lines: string[] = [`${fmtUF(breakdown.total)} UF`];

      if (breakdown.regimeRentUfM2 != null && superficie > 0) {
        lines.push(`(Canon ${fmtUFM2(breakdown.regimeRentUfM2)} UF/m²)`);
      }

      const extras: string[] = [];
      if (breakdown.ggcc > 0) extras.push(`GGCC ${fmtUF(breakdown.ggcc)}`);
      if (breakdown.fondoPromocion > 0) extras.push(`FP ${fmtUF(breakdown.fondoPromocion)}`);
      if (breakdown.otrosEgresos > 0) extras.push(`Otros ${fmtUF(breakdown.otrosEgresos)}`);
      if (extras.length > 0) {
        lines.push(`(${extras.join(' + ')})`);
      }

      rentText = lines.join('\n');
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
      'Arriendo Total',
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
