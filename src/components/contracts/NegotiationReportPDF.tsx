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
  gastos_comunes_fixed_admin_uf?: number | null;
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
  negotiation_notes?: string | null;
  venta_estimada: number | null;
  venta_estimada_max?: number | null;
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
  subcategoryFilter: string,
  ufValue: number = 0
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

      // Show UF/m² rate - either from stored rate or calculated from total
      if (superficie > 0) {
        const ufM2Rate = breakdown.regimeRentUfM2 != null 
          ? breakdown.regimeRentUfM2 
          : breakdown.canon / superficie;
        lines.push(`(Canon ${fmtUFM2(ufM2Rate)} UF/m²)`);
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

    // Calculate venta estimada matching the table format exactly
    let ventaText = '-';
    if (contract.venta_estimada) {
      const ventaMin = contract.venta_estimada;
      const ventaMax = contract.venta_estimada_max || ventaMin;
      const superficie = contract.superficie_edificada_local || 0;
      const lines: string[] = [];
      
      // Line 1: Range in MM$
      const ventaMinMM = Math.round(ventaMin / 1000000);
      const ventaMaxMM = Math.round(ventaMax / 1000000);
      lines.push(ventaMin === ventaMax 
        ? `${ventaMinMM} MM$` 
        : `${ventaMinMM}-${ventaMaxMM} MM$`);
      
      // Line 2: Range in UF (if ufValue available)
      if (ufValue > 0) {
        const ventaMinUF = Math.round(ventaMin / ufValue);
        const ventaMaxUF = Math.round(ventaMax / ufValue);
        lines.push(ventaMinUF === ventaMaxUF 
          ? `${ventaMinUF.toLocaleString('es-CL')} UF` 
          : `${ventaMinUF.toLocaleString('es-CL')}-${ventaMaxUF.toLocaleString('es-CL')} UF`);
      }
      
      // Line 3: UF/m² (if superficie available)
      if (superficie > 0 && ufValue > 0) {
        const ventaMinUFm2 = (ventaMin / ufValue) / superficie;
        const ventaMaxUFm2 = (ventaMax / ufValue) / superficie;
        const fmtUFm2 = (n: number) => n.toFixed(1);
        lines.push(ventaMinUFm2 === ventaMaxUFm2 
          ? `${fmtUFm2(ventaMinUFm2)} UF/m²` 
          : `${fmtUFm2(ventaMinUFm2)}-${fmtUFm2(ventaMaxUFm2)} UF/m²`);
      }
      
      // Line 4: Arr/Vta ratio
      if (ufValue > 0 && currentVersion) {
        const hasExtended = currentVersion.has_extended_gastos_comunes ?? false;
        const methodology = currentVersion.gastos_comunes_methodology || "uf_m2";
        
        // Calculate current rent
        let currentRent = currentVersion.regime_rent || 0;
        if (currentVersion.regime_rent_is_uf_m2 && superficie > 0) {
          currentRent = currentVersion.regime_rent * superficie;
        }
        
        // Calculate GGCC
        let gastosComunesTotal = 0;
        if (hasExtended) {
          const ufM2 = currentVersion.gastos_comunes_uf_m2 || 0;
          const ufMlFrente = currentVersion.gastos_comunes_uf_ml_frente || 0;
          const prorrataPct = currentVersion.gastos_comunes_percentage || 0;
          const centroTotal = currentVersion.gastos_comunes_total_centro || 0;
          const metrosFrente = contract.metros_lineales_frente || 0;
          
          gastosComunesTotal = (ufM2 * superficie) + (ufMlFrente * metrosFrente) + (centroTotal * (prorrataPct / 100));
        } else {
          switch (methodology) {
            case "uf_m2":
              const ggccUfM2 = currentVersion.gastos_comunes_uf_m2 || 0;
              gastosComunesTotal = ggccUfM2 * superficie;
              break;
            case "percentage":
              const ggccPct = currentVersion.gastos_comunes_percentage || 0;
              gastosComunesTotal = currentRent * (ggccPct / 100);
              break;
          }
        }
        
        const fondoPromocionPct = currentVersion.fondo_promocion_percentage || 0;
        const fondoPromocion = currentRent * (fondoPromocionPct / 100);
        const otrosEgresos = currentVersion.otros_egresos_amount || 0;
        
        const arriendoTotalMensual = currentRent + gastosComunesTotal + fondoPromocion + otrosEgresos;
        const ventaPromedio = ventaMax ? (ventaMin + ventaMax) / 2 : ventaMin;
        const ventaPromedioEnUF = ventaPromedio / ufValue;
        const ratioArrVta = ventaPromedioEnUF > 0 ? (arriendoTotalMensual / ventaPromedioEnUF) * 100 : 0;
        
        if (ratioArrVta > 0) {
          lines.push(`Arr/Vta: ${ratioArrVta.toFixed(2)}%`);
        }
      }
      
      ventaText = lines.join('\n');
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
      contract.negotiation_notes || '-',
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
      'Notas Negociación',
    ]],
    body: tableData,
    styles: {
      fontSize: 7,
      cellPadding: 2,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [220, 38, 38],
      textColor: 255,
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 7,
    },
    columnStyles: {
      0: { cellWidth: 35 },
      1: { cellWidth: 28 },
      2: { cellWidth: 28 },
      3: { cellWidth: 35 },
      4: { cellWidth: 20, halign: 'right' },
      5: { cellWidth: 22, halign: 'right' },
      6: { cellWidth: 18, halign: 'center' },
      7: { cellWidth: 25, halign: 'right' },
      8: { cellWidth: 55, halign: 'left' },
    },
    alternateRowStyles: {
      fillColor: [245, 247, 250],
    },
    margin: { left: 10, right: 10 },
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
