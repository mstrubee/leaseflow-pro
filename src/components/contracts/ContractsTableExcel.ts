import * as XLSX from "xlsx";
import { format, addMonths, subMonths, parseISO } from "date-fns";
import { calculateTotalArriendoUF } from "@/lib/contractRent";
import { getAvailableColumns } from "./ContractsTablePDF";

interface ContractVersion {
  regime_rent: number;
  regime_rent_is_uf_m2?: boolean | null;
  initial_rent?: number | null;
  initial_rent_is_uf_m2?: boolean | null;
  effective_date?: string | null;
  grace_months?: number | null;
  rent_escalations?: Array<{ month_number: number; amount: number }>;
  has_periodic_adjustments?: boolean | null;
  first_adjustment_month?: number | null;
  adjustment_periodicity_months?: number | null;
  adjustment_type?: string | null;
  adjustment_value?: number | null;
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
  fondo_promocion_percentage?: number | null;
  otros_egresos_amount?: number | null;
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
  negotiation_notes?: string | null;
  venta_estimada?: number | null;
  venta_estimada_max?: number | null;
  clasificacion?: string | null;
  origen?: string | null;
  metros_lineales_frente?: number | null;
  patente_status?: string | null;
  contract_companies?: Array<{ companies: { name: string } | null }>;
  contract_addresses: Array<{ region: string; commune: string; street?: string; number?: string }>;
  contract_versions: ContractVersion[];
  superficie_edificada_local: number | null;
}

const subcategoryLabels: Record<string, string> = {
  negociacion_contrato: "Rev. Contrato",
  ubicacion_preliminar: "Ubic. Preliminar",
};

const origenLabels: Record<string, string> = {
  corredor: "Corredor",
  gestion_directa: "Gestión Directa",
  inversionista: "Inversionista",
};

const calculateEndDate = (contract: Contract): Date | null => {
  const v = contract.contract_versions?.find((x) => x.is_current);
  if (!v) return null;
  const start = v.effective_date
    ? parseISO(v.effective_date)
    : contract.signed_date
      ? parseISO(contract.signed_date)
      : null;
  if (!start) return null;
  return addMonths(start, v.duration_months);
};

const calculateNoticeDeadline = (contract: Contract): Date | null => {
  const v = contract.contract_versions?.find((x) => x.is_current);
  if (!v) return null;
  const start = v.effective_date
    ? parseISO(v.effective_date)
    : contract.signed_date
      ? parseISO(contract.signed_date)
      : null;

  if (v.notice_type === "fecha" && v.notice_value) return parseISO(v.notice_value);

  if (v.notice_type === "rangos" && start) {
    const ranges = v.notice_ranges || [];
    if (ranges.length > 0) {
      const today = new Date();
      const sorted = [...ranges].sort((a, b) => a.start_month - b.start_month);
      for (const r of sorted) {
        const d = addMonths(start, r.start_month - 1);
        if (d > today) return d;
      }
      const last = sorted[sorted.length - 1];
      return addMonths(start, last.start_month - 1);
    }
  }

  const end = calculateEndDate(contract);
  if (!end) return null;
  const months = parseInt(v.notice_value) || 0;
  return subMonths(end, months);
};

export const generateContractsListExcel = (
  contracts: Contract[],
  selectedColumns: string[],
  title: string,
  isFirmadoView: boolean,
  isNegociacionView: boolean,
  ufValue: number = 0
) => {
  const allColumns = getAvailableColumns(isFirmadoView, isNegociacionView);
  const columns = allColumns.filter((c) => selectedColumns.includes(c.key));

  const headers = columns.map((c) => c.label);

  const rows = contracts.map((contract) => {
    const v = contract.contract_versions?.find((x) => x.is_current);
    const address = contract.contract_addresses?.[0];
    const companies =
      contract.contract_companies?.map((cc) => cc.companies?.name).filter(Boolean).join(", ") || "";
    const endDate = calculateEndDate(contract);
    const noticeDeadline = calculateNoticeDeadline(contract);

    return columns.map((col) => {
      switch (col.key) {
        case "contrato":
          return contract.name;
        case "empresa":
          return companies;
        case "ubicacion":
          return address?.commune || "";
        case "direccion":
          return address ? `${address.street || ""} ${address.number || ""}`.trim() : "";
        case "costo_arriendo": {
          if (!v) return "";
          const superficie = contract.superficie_edificada_local || 0;
          const metrosFrente = contract.metros_lineales_frente || 0;
          const breakdown = calculateTotalArriendoUF({
            version: v,
            signedDate: contract.signed_date,
            superficie,
            metrosLinealesFrente: metrosFrente,
          });
          const parts: string[] = [`${breakdown.total.toFixed(2)} UF`];
          if (superficie > 0) {
            const ufM2 = breakdown.regimeRentUfM2 ?? breakdown.canon / superficie;
            if (Number.isFinite(ufM2) && ufM2 > 0) parts.push(`Canon ${ufM2.toFixed(3)} UF/m²`);
          }
          const extras: string[] = [];
          if (breakdown.ggcc > 0) extras.push(`GGCC ${breakdown.ggcc.toFixed(2)}`);
          if (breakdown.fondoPromocion > 0) extras.push(`FP ${breakdown.fondoPromocion.toFixed(2)}`);
          if (breakdown.otrosEgresos > 0) extras.push(`Otros ${breakdown.otrosEgresos.toFixed(2)}`);
          if (extras.length) parts.push(extras.join(" + "));
          return parts.join(" | ");
        }
        case "duracion":
          return v ? `${v.duration_months} meses` : "";
        case "termino":
          return endDate ? format(endDate, "dd/MM/yyyy") : "";
        case "aviso":
          return noticeDeadline ? format(noticeDeadline, "dd/MM/yyyy") : "";
        case "categoria":
          return subcategoryLabels[contract.negotiation_subcategory || ""] || "";
        case "clasificacion":
          return contract.clasificacion || "";
        case "origen":
          return origenLabels[contract.origen || ""] || "";
        case "venta_estimada": {
          if (!contract.venta_estimada) return "";
          const min = contract.venta_estimada;
          const max = contract.venta_estimada_max || min;
          const minMM = Math.round(min / 1_000_000);
          const maxMM = Math.round(max / 1_000_000);
          const lines: string[] = [min === max ? `${minMM} MM$` : `${minMM}-${maxMM} MM$`];
          if (ufValue > 0) {
            const minUF = Math.round(min / ufValue);
            const maxUF = Math.round(max / ufValue);
            lines.push(minUF === maxUF ? `${minUF} UF` : `${minUF}-${maxUF} UF`);
          }
          return lines.join(" | ");
        }
        case "notas_negociacion":
          return contract.negotiation_notes || "";
        default:
          return "";
      }
    });
  });

  const wsData = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Column widths
  ws["!cols"] = columns.map((c) => {
    const widths: Record<string, number> = {
      contrato: 24,
      empresa: 22,
      ubicacion: 18,
      direccion: 30,
      costo_arriendo: 42,
      duracion: 12,
      termino: 12,
      aviso: 12,
      categoria: 18,
      clasificacion: 14,
      origen: 16,
      venta_estimada: 22,
      notas_negociacion: 40,
    };
    return { wch: widths[c.key] || 18 };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Contratos");

  const fileName = `contratos_${format(new Date(), "yyyy-MM-dd")}.xlsx`;
  XLSX.writeFile(wb, fileName);
};
