import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Trash2, AlertTriangle, FileCheck, FilePlus, Bell, FileWarning, DollarSign, Check, X } from "lucide-react";
import { ContractStatusActions } from "@/components/contracts/ContractStatusActions";
import { useEconomicIndicators } from "@/hooks/useEconomicIndicators";
import { useContractColumnWidths } from "@/hooks/useContractColumnWidths";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { calculateTotalArriendoUF, calculateWeightedAverageTotalArriendo } from "@/lib/contractRent";
import { addMonths, format, subMonths, parseISO, differenceInMonths, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { SortableTableHead, SortOrder } from "./SortableTableHead";
import { CompanyLogo, getCompanyNames } from "./CompanyLogo";

interface ContractAlert {
  id: string;
  contract_id: string;
  title: string;
  alert_type: string;
  due_date: string;
  is_active: boolean;
}

interface TerminationNotice {
  id: string;
  notice_type: string;
  notice_date: string;
  required_exit_date: string | null;
  document_url: string | null;
}

interface RentEscalation {
  id: string;
  month_number: number;
  amount: number;
  is_uf_m2?: boolean;
}

interface ContractVersion {
  id?: string;
  regime_rent: number;
  regime_rent_is_uf_m2?: boolean | null;
  initial_rent?: number | null;
  initial_rent_is_uf_m2?: boolean | null;
  grace_months?: number | null;
  duration_months: number;
  is_current: boolean;
  effective_date: string | null;
  notice_type: string;
  notice_value: string;
  gastos_comunes_uf_m2: number | null;
  gastos_comunes_uf_ml_frente?: number | null;
  gastos_comunes_prorrata_kwh_clima?: number | null;
  gastos_comunes_methodology?: string | null;
  gastos_comunes_percentage?: number | null;
  gastos_comunes_total_centro?: number | null;
  gastos_comunes_tope?: number | null;
  gastos_comunes_tope_type?: string | null;
  fondo_promocion_percentage: number | null;
  adicional_administracion_percentage?: number | null;
  gastos_comunes_fixed_admin_uf?: number | null;
  has_extended_gastos_comunes?: boolean | null;
  notice_ranges?: Array<{ start_month: number; end_month: number }>;
  otros_egresos_amount?: number | null;
  otros_egresos_description?: string | null;
  rent_escalations?: RentEscalation[];
  // Periodic adjustments
  has_periodic_adjustments?: boolean | null;
  adjustment_type?: string | null;
  adjustment_value?: number | null;
  first_adjustment_month?: number | null;
  adjustment_periodicity_months?: number | null;
}

interface ContractCompany {
  company_id: string;
  companies: { id: string; name: string } | null;
}

interface ComiteGPStatus {
  id: string;
  name: string;
  color: string;
}

interface Contract {
  id: string;
  name: string;
  status: string;
  created_at: string;
  signed_date: string | null;
  operation_status: string | null;
  obra_status: string | null;
  patente_status: string | null;
  is_expired_but_operating: boolean | null;
  display_currency: string | null;
  requires_special_attention: boolean | null;
  special_attention_reason: string | null;
  negotiation_subcategory?: string | null;
  venta_estimada?: number | null;
  venta_estimada_max?: number | null;
  clasificacion?: string | null;
  origen?: string | null;
  comite_gp_status?: string | null;
  contract_companies?: ContractCompany[];
  contract_addresses: Array<{ region: string; commune: string; street?: string; number?: string }>;
  contract_versions: ContractVersion[];
  superficie_edificada_local: number | null;
  superficie_terreno: number | null;
  metros_lineales_frente?: number | null;
  termination_notices?: TerminationNotice[];
}

export type ContractSortField = "name" | "empresa" | "ubicacion" | "costo_arriendo" | "duracion" | "termino" | "aviso" | "categoria" | "clasificacion" | "venta_estimada" | "comite_gp" | "end_date" | "notice_deadline" | null;

interface ContractsTableProps {
  contracts: Contract[];
  isFirmadoView: boolean;
  onDelete: (e: React.MouseEvent, contract: Contract) => void;
  onUpdateField: (e: React.MouseEvent, contractId: string, field: string, value: string) => void;
  onRefresh: () => void;
  sortField?: ContractSortField;
  sortOrder?: SortOrder;
  onSort?: (field: ContractSortField) => void;
  columnWidths?: Record<string, number>;
  customFieldsByContract?: Record<string, { cebe?: string; codigo?: string }>;
}

export function ContractsTable({ contracts, isFirmadoView, onDelete, onUpdateField, onRefresh, sortField, sortOrder, onSort, columnWidths: externalColumnWidths, customFieldsByContract }: ContractsTableProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { ufValue, convertUFToPesos, convertPesosToUF } = useEconomicIndicators();
  const { columnWidths: defaultColumnWidths, getColumnStyle } = useContractColumnWidths();
  const { isAdmin } = useAuth();
  const [contractAlerts, setContractAlerts] = useState<Record<string, ContractAlert[]>>({});
  const [editingVenta, setEditingVenta] = useState<string | null>(null);
  const [ventaMinValue, setVentaMinValue] = useState<string>("");
  const [ventaMaxValue, setVentaMaxValue] = useState<string>("");
  const [comiteGPStatuses, setComiteGPStatuses] = useState<ComiteGPStatus[]>([]);
  const [comiteGPConfirm, setComiteGPConfirm] = useState<{ contractId: string; contractName: string } | null>(null);
  const [rechazadaConfirm, setRechazadaConfirm] = useState<{ contractId: string; contractName: string } | null>(null);
  const [capexByContract, setCapexByContract] = useState<Record<string, { authorized: number; unauthorized: number }>>({});
  
  // Use external column widths if provided, otherwise use defaults from hook
  const columnWidths = externalColumnWidths || defaultColumnWidths;
  
  // Helper to get column style with width
  const getColStyle = (columnKey: string): React.CSSProperties => {
    if (externalColumnWidths) {
      const total = Object.values(externalColumnWidths).reduce((s, w) => s + (w || 0), 0) || 1;
      const rawWidth = externalColumnWidths[columnKey] ?? 10;
      const pct = (rawWidth / total) * 100;
      return { width: `${pct.toFixed(1)}%`, minWidth: '80px' };
    }
    return getColumnStyle(columnKey);
  };

  // Load Comité GP statuses
  useEffect(() => {
    const loadComiteStatuses = async () => {
      const { data } = await supabase
        .from("comite_gp_statuses")
        .select("id, name, color")
        .eq("is_active", true)
        .order("display_order");
      if (data) setComiteGPStatuses(data);
    };
    loadComiteStatuses();
  }, []);

  // Load CAPEX totals for current year (mirrors BudgetDashboard logic)
  useEffect(() => {
    const loadCapex = async () => {
      const currentYear = new Date().getFullYear();
      
      // Get all capex budgets for current year
      const { data: budgets } = await supabase
        .from("contract_budgets")
        .select("id, contract_id, amount_uf")
        .eq("budget_type", "capex")
        .eq("year", currentYear);
      
      if (!budgets || budgets.length === 0) {
        setCapexByContract({});
        return;
      }

      // For budgets with amount_uf = 0, fallback to sum of budget lines (authorized first, then unauthorized)
      const budgetsNeedingLines = budgets.filter(b => !b.amount_uf || b.amount_uf === 0);
      let authorizedByBudget: Record<string, number> = {};
      let unauthorizedByBudget: Record<string, number> = {};
      
      if (budgetsNeedingLines.length > 0) {
        const budgetIds = budgetsNeedingLines.map(b => b.id);
        const { data: lines } = await supabase
          .from("budget_lines")
          .select("budget_id, amount_uf, status, parent_id, id")
          .in("budget_id", budgetIds);
        
        if (lines) {
          const parentIds = new Set(lines.filter(l => l.parent_id).map(l => l.parent_id));
          const leafLines = lines.filter(l => !parentIds.has(l.id));
          
          leafLines.forEach(l => {
            if (l.status === "autorizado") {
              authorizedByBudget[l.budget_id] = (authorizedByBudget[l.budget_id] || 0) + (l.amount_uf || 0);
            } else {
              unauthorizedByBudget[l.budget_id] = (unauthorizedByBudget[l.budget_id] || 0) + (l.amount_uf || 0);
            }
          });
        }
      }

      const map: Record<string, number> = {};
      budgets.forEach(row => {
        const budgetAmount = row.amount_uf || 0;
        const authorized = authorizedByBudget[row.id] || 0;
        const unauthorized = unauthorizedByBudget[row.id] || 0;
        const effectiveAmount = budgetAmount > 0 ? budgetAmount : (authorized > 0 ? authorized : unauthorized);
        map[row.contract_id] = (map[row.contract_id] || 0) + effectiveAmount;
      });
      setCapexByContract(map);
    };
    loadCapex();
  }, []);

  const handleComiteGPChange = async (contractId: string, value: string) => {
    const { error } = await supabase
      .from('contracts')
      .update({ comite_gp_status: value || null })
      .eq('id', contractId);
    if (error) {
      toast.error('Error al actualizar Comité GP');
    } else {
      // If set to "Rechazada", prompt to move to rejected list
      if (value === 'Rechazada') {
        const contract = contracts.find(c => c.id === contractId);
        if (contract) {
          setRechazadaConfirm({ contractId, contractName: contract.name });
        }
      }
      onRefresh();
    }
  };

  const getComiteGPColor = (statusName: string | null) => {
    if (!statusName) return '';
    const status = comiteGPStatuses.find(s => s.name === statusName);
    const colorMap: Record<string, string> = {
      green: 'bg-green-100 text-green-800 border-green-300 hover:bg-green-200',
      red: 'bg-red-100 text-red-800 border-red-300 hover:bg-red-200',
      blue: 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200',
      yellow: 'bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-200',
      purple: 'bg-purple-100 text-purple-800 border-purple-300 hover:bg-purple-200',
      orange: 'bg-orange-100 text-orange-800 border-orange-300 hover:bg-orange-200',
      gray: 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200',
    };
    return colorMap[status?.color || 'gray'] || colorMap.gray;
  };

  const isNegociacionView = !isFirmadoView && contracts.some(c => c.status === 'en_negociacion');

  const handleSaveVenta = async (e: React.MouseEvent, contractId: string) => {
    e.stopPropagation();
    const minValue = ventaMinValue ? parseFloat(ventaMinValue.replace(/\./g, '').replace(',', '.')) : null;
    const maxValue = ventaMaxValue ? parseFloat(ventaMaxValue.replace(/\./g, '').replace(',', '.')) : null;
    
    const { error } = await supabase
      .from('contracts')
      .update({ 
        venta_estimada: minValue,
        venta_estimada_max: maxValue 
      })
      .eq('id', contractId);

    if (error) {
      toast.error('Error al guardar la venta estimada');
    } else {
      toast.success('Venta estimada guardada');
      onRefresh();
    }
    setEditingVenta(null);
    setVentaMinValue("");
    setVentaMaxValue("");
  };

  const handleCancelVenta = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingVenta(null);
    setVentaMinValue("");
    setVentaMaxValue("");
  };

  const handleSubcategoryChange = async (e: React.MouseEvent, contractId: string, value: string) => {
    e.stopPropagation();
    const { error } = await supabase
      .from('contracts')
      .update({ negotiation_subcategory: value })
      .eq('id', contractId);

    if (error) {
      toast.error('Error al actualizar la categoría');
    } else {
      // If changed to "Rev. Contrato" (negociacion_contrato), prompt for Comité GP = Aceptada
      if (value === 'negociacion_contrato') {
        const contract = contracts.find(c => c.id === contractId);
        if (contract && !contract.comite_gp_status) {
          setComiteGPConfirm({ contractId, contractName: contract.name });
        }
      }
      onRefresh();
    }
  };

  const handleClasificacionChange = async (contractId: string, value: string) => {
    const { error } = await supabase
      .from('contracts')
      .update({ clasificacion: value })
      .eq('id', contractId);

    if (error) {
      toast.error('Error al actualizar la clasificación');
    } else {
      onRefresh();
    }
  };

  const handleOrigenChange = async (contractId: string, value: string) => {
    const { error } = await supabase
      .from('contracts')
      .update({ origen: value })
      .eq('id', contractId);

    if (error) {
      toast.error('Error al actualizar el origen');
    } else {
      onRefresh();
    }
  };

  // Load alerts for all contracts
  useEffect(() => {
    const loadAlerts = async () => {
      if (contracts.length === 0) return;
      
      const contractIds = contracts.map(c => c.id);
      
      const { data, error } = await supabase
        .from('alerts')
        .select('id, contract_id, title, alert_type, due_date, is_active')
        .in('contract_id', contractIds)
        .eq('is_active', true)
        .is('completed_at', null)
        .is('deleted_at', null);
      
      if (!error && data) {
        // Group alerts by contract_id
        const alertsByContract: Record<string, ContractAlert[]> = {};
        data.forEach((alert) => {
          if (!alertsByContract[alert.contract_id!]) {
            alertsByContract[alert.contract_id!] = [];
          }
          alertsByContract[alert.contract_id!].push(alert as ContractAlert);
        });
        setContractAlerts(alertsByContract);
      }
    };
    
    loadAlerts();
  }, [contracts]);


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

  // Check if we're currently inside a notice range
  const getNoticeRangeStatus = (contract: Contract): { isInsideRange: boolean; rangeEndDate: Date | null } => {
    const currentVersion = contract.contract_versions?.find((v) => v.is_current);
    if (!currentVersion || currentVersion.notice_type !== "rangos") {
      return { isInsideRange: false, rangeEndDate: null };
    }

    const startDate = currentVersion.effective_date
      ? parseISO(currentVersion.effective_date)
      : contract.signed_date
        ? parseISO(contract.signed_date)
        : null;

    if (!startDate) return { isInsideRange: false, rangeEndDate: null };

    const noticeRanges = currentVersion.notice_ranges || [];
    if (noticeRanges.length === 0) return { isInsideRange: false, rangeEndDate: null };

    const today = new Date();
    const sortedRanges = [...noticeRanges].sort((a, b) => a.start_month - b.start_month);

    for (const range of sortedRanges) {
      const rangeStartDate = addMonths(startDate, range.start_month - 1);
      const rangeEndDate = addMonths(startDate, range.end_month - 1);
      
      // Check if today is within this range
      if (today >= rangeStartDate && today <= rangeEndDate) {
        return { isInsideRange: true, rangeEndDate };
      }
    }

    return { isInsideRange: false, rangeEndDate: null };
  };

  // Calculate current rent based on escalations, periodic adjustments, and current month
  // superficie parameter is used when rent is in UF/m²
  // For contracts that haven't started yet (future start date), returns regime rent
  const calculateCurrentRent = (version: ContractVersion, signedDate: string | null, superficie: number = 0): { currentRent: number; hasEscalations: boolean; hasAdjustments: boolean; isContractNotStarted: boolean } => {
    const escalations = version.rent_escalations || [];
    const hasEscalations = escalations.length > 0;
    const hasAdjustments = version.has_periodic_adjustments && 
      (version.adjustment_value || 0) > 0 && 
      (version.first_adjustment_month || 0) > 0;
    
    const isRentUfM2 = version.regime_rent_is_uf_m2 ?? false;
    const isInitialRentUfM2 = version.initial_rent_is_uf_m2 ?? false;
    
    // Calculate current month
    const startDate = version.effective_date
      ? parseISO(version.effective_date)
      : signedDate
        ? parseISO(signedDate)
        : null;
    
    // Get base regime rent (considering UF/m²)
    const baseRegimeRent = isRentUfM2 ? version.regime_rent * superficie : version.regime_rent;
    
    if (!startDate) {
      return { currentRent: baseRegimeRent, hasEscalations, hasAdjustments: !!hasAdjustments, isContractNotStarted: true };
    }
    
    const today = new Date();
    const diffTime = today.getTime() - startDate.getTime();
    const currentMonth = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30.44)) + 1;
    
    // Check if contract hasn't started yet (future start date)
    const isContractNotStarted = currentMonth < 1;
    if (isContractNotStarted) {
      // For contracts that haven't started, return regime rent (projected)
      return { currentRent: baseRegimeRent, hasEscalations, hasAdjustments: !!hasAdjustments, isContractNotStarted: true };
    }
    
    // Check grace period - only for active contracts (currentMonth >= 1)
    const graceMonths = version.grace_months || 0;
    if (currentMonth <= graceMonths) {
      return { currentRent: 0, hasEscalations, hasAdjustments: !!hasAdjustments, isContractNotStarted: false };
    }
    
    // If no escalations and no adjustments, return regime rent
    if (!hasEscalations && !hasAdjustments) {
      return { currentRent: baseRegimeRent, hasEscalations: false, hasAdjustments: false, isContractNotStarted: false };
    }
    
    // Start with base rent from escalations or regime rent
    let currentRent = baseRegimeRent;
    
    if (hasEscalations) {
      // Find the applicable escalation for current month
      const sortedEscalations = [...escalations].sort((a, b) => a.month_number - b.month_number);
      
      // Initial rent (considering UF/m²)
      const baseInitialRent = version.initial_rent 
        ? (isInitialRentUfM2 ? version.initial_rent * superficie : version.initial_rent)
        : baseRegimeRent;
      
      currentRent = baseInitialRent;
      for (const esc of sortedEscalations) {
        if (esc.month_number <= currentMonth) {
          // Per-escalation UF/m²: own flag or legacy regime flag
          const needsMultiply = esc.is_uf_m2 || (isRentUfM2 && !esc.is_uf_m2);
          currentRent = needsMultiply ? esc.amount * superficie : esc.amount;
        } else {
          break;
        }
      }
    }
    
    // Apply periodic adjustments on top of base rent
    if (hasAdjustments) {
      const firstAdjMonth = version.first_adjustment_month || 0;
      const periodicity = version.adjustment_periodicity_months || 12;
      const adjValue = version.adjustment_value || 0;
      const adjType = version.adjustment_type || "percentage";
      
      // Calculate how many adjustments have been applied
      if (currentMonth >= firstAdjMonth) {
        const monthsSinceFirst = currentMonth - firstAdjMonth;
        const numAdjustments = Math.floor(monthsSinceFirst / periodicity) + 1;
        
        // Apply adjustments cumulatively
        for (let i = 0; i < numAdjustments; i++) {
          if (adjType === "percentage") {
            currentRent = currentRent * (1 + adjValue / 100);
          } else {
            currentRent = currentRent + adjValue;
          }
        }
      }
    }
    
    return { currentRent, hasEscalations, hasAdjustments: !!hasAdjustments, isContractNotStarted: false };
  };

  const getStatusBadge = (status: string) => {
    const statusMap: { [key: string]: { label: string; className: string } } = {
      en_negociacion: { label: "En Negociación", className: "bg-yellow-500 text-white" },
      firmado: { label: "Vigente", className: "bg-green-500 text-white" },
      vencido: { label: "Vencido", className: "bg-red-500 text-white" },
    };

    const statusInfo = statusMap[status] || { label: status, className: "" };
    return <Badge className={`${statusInfo.className} text-xs`}>{statusInfo.label}</Badge>;
  };

  const formatUF = (amount: number) => {
    return `${amount.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} UF`;
  };

  const formatAmount = (amount: number, currency: string | null) => {
    const displayCurrency = currency || "UF";
    if (displayCurrency === "CLP") {
      // Cuando el contrato está en CLP, los montos ya están en pesos (no convertir)
      return `$${amount.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    }
    return `${amount.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF`;
  };

  const formatDateShort = (date: Date) => {
    return format(date, "dd/MM/yy", { locale: es });
  };

  const handleSort = (field: string) => {
    if (onSort) {
      onSort(field as ContractSortField);
    }
  };

  return (
    <div className="rounded-md border">
      <Table className="w-auto">
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow className="bg-muted/50">
            <SortableTableHead
              label="Contrato"
              sortKey="name"
              currentSortKey={sortField || null}
              currentSortOrder={sortOrder || null}
              onSort={handleSort}
              style={getColStyle("name")}
            />
            <SortableTableHead
              label="Ubicación"
              sortKey="ubicacion"
              currentSortKey={sortField || null}
              currentSortOrder={sortOrder || null}
              onSort={handleSort}
              style={getColStyle("ubicacion")}
            />
            {isNegociacionView && (
              <>
                <SortableTableHead
                  label="Comité GP"
                  sortKey="comite_gp"
                  currentSortKey={sortField || null}
                  currentSortOrder={sortOrder || null}
                  onSort={handleSort}
                  align="center"
                  style={getColStyle("comite_gp")}
                />
                <SortableTableHead
                  label="Estado"
                  sortKey="categoria"
                  currentSortKey={sortField || null}
                  currentSortOrder={sortOrder || null}
                  onSort={handleSort}
                  align="center"
                  style={getColStyle("categoria")}
                />
                <SortableTableHead
                  label="Clasificación"
                  sortKey="clasificacion"
                  currentSortKey={sortField || null}
                  currentSortOrder={sortOrder || null}
                  onSort={handleSort}
                  align="center"
                  style={getColStyle("clasificacion")}
                />
                <TableHead className="font-semibold text-center" style={getColStyle("origen")}>Origen</TableHead>
              </>
            )}
            <SortableTableHead
              label="Venta Est."
              sortKey="venta_estimada"
              currentSortKey={sortField || null}
              currentSortOrder={sortOrder || null}
              onSort={handleSort}
              align="center"
              style={getColStyle("venta_estimada")}
            />
            <TableHead className="font-semibold text-center" style={getColStyle("capex")}>CAPEX</TableHead>
            <SortableTableHead
              label={<div className="leading-tight">Costo<br/>Arriendo</div>}
              sortKey="costo_arriendo"
              currentSortKey={sortField || null}
              currentSortOrder={sortOrder || null}
              onSort={handleSort}
              align="center"
              style={getColStyle("costo_arriendo")}
            />
            <SortableTableHead
              label="Duración"
              sortKey="duracion"
              currentSortKey={sortField || null}
              currentSortOrder={sortOrder || null}
              onSort={handleSort}
              align="center"
              style={getColStyle("duracion")}
            />
            {isFirmadoView && (
              <>
                <SortableTableHead
                  label="Término"
                  sortKey="termino"
                  currentSortKey={sortField || null}
                  currentSortOrder={sortOrder || null}
                  onSort={handleSort}
                  align="center"
                  style={getColStyle("termino")}
                />
                <SortableTableHead
                  label="Aviso"
                  sortKey="aviso"
                  currentSortKey={sortField || null}
                  currentSortOrder={sortOrder || null}
                  onSort={handleSort}
                  align="center"
                  style={getColStyle("aviso")}
                />
                <TableHead className="font-semibold text-center" style={getColStyle("estado")}>Estado</TableHead>
              </>
            )}
            {isAdmin && <TableHead className="w-2 p-0 px-0.5"></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {contracts.map((contract) => {
            const currentVersion = contract.contract_versions?.find((v) => v.is_current);
            const address = contract.contract_addresses?.[0];
            const originalEndDate = calculateEndDate(contract);
            const noticeDeadline = calculateNoticeDeadline(contract);
            const noticeRangeStatus = getNoticeRangeStatus(contract);
            const isPastNotice = noticeDeadline && noticeDeadline < new Date() && !noticeRangeStatus.isInsideRange;
            const isExpiredOperating = contract.status === "vencido" && contract.is_expired_but_operating;
            
            // Si hay un aviso de término anticipado, calcular la fecha de término efectivo
            const hasTerminationNotice = contract.termination_notices && contract.termination_notices.length > 0;
            const terminationNotice = hasTerminationNotice 
              ? contract.termination_notices.find(n => n.required_exit_date) || contract.termination_notices[0]
              : null;
            let endDate = originalEndDate;
            
            if (terminationNotice) {
              // Si hay fecha de salida requerida, usarla directamente
              if (terminationNotice.required_exit_date) {
                endDate = parseISO(terminationNotice.required_exit_date);
              } else if (currentVersion) {
                // Fallback: calcular basado en fecha de aviso + meses de aviso
                const noticeDate = parseISO(terminationNotice.notice_date);
                const noticeMonths = currentVersion.notice_type === "meses" 
                  ? parseInt(currentVersion.notice_value) || 0 
                  : 0;
                if (noticeMonths > 0) {
                  endDate = addMonths(noticeDate, noticeMonths);
                }
              }
            }

            // Get alerts for this contract
            const alerts = contractAlerts[contract.id] || [];
            const pendingAlerts = alerts.filter(a => {
              const dueDate = parseISO(a.due_date);
              return dueDate <= new Date() || differenceInDays(dueDate, new Date()) <= 30;
            });

            return (
              <TableRow
                key={contract.id}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() =>
                  navigate(`/contracts/${contract.id}`, {
                    state: { backTo: `${location.pathname}${location.search}` },
                  })
                }
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <CompanyLogo 
                      companyNames={getCompanyNames(contract.contract_companies)} 
                      size="sm" 
                    />
                    <div className="flex-1">
                      <div className="font-medium text-sm">{contract.name}</div>
                      {(() => {
                        const cf = customFieldsByContract?.[contract.id];
                        const parts = [cf?.cebe, cf?.codigo].filter(Boolean);
                        return parts.length > 0 ? (
                          <div className="text-[10px] text-muted-foreground/70 font-mono">
                            {parts.join(" · ")}
                          </div>
                        ) : null;
                      })()}
                      {contract.contract_companies && contract.contract_companies.length > 0 && (
                        <div className="text-[10px] text-muted-foreground">
                          {contract.contract_companies.map(cc => cc.companies?.name).filter(Boolean).join(", ")}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {getStatusBadge(isExpiredOperating ? "firmado" : contract.status)}
                        {isExpiredOperating && (
                          <Badge variant="destructive" className="text-[10px] px-1 py-0 gap-0.5">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            VENCIDO
                          </Badge>
                        )}
                        {contract.requires_special_attention && (
                          <Badge className="bg-orange-500 hover:bg-orange-600 text-white text-[10px] px-1 py-0 gap-0.5">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            Atención Especial
                          </Badge>
                        )}
                        {/* Termination notice indicator */}
                        {hasTerminationNotice && (
                          <Badge className="bg-red-600 hover:bg-red-700 text-white text-[10px] px-1 py-0 gap-0.5 border border-red-400">
                            <FileWarning className="h-2.5 w-2.5" />
                            Aviso Término
                          </Badge>
                        )}
                        {/* Pending alerts indicator */}
                        {pendingAlerts.length > 0 && (
                          <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[10px] px-1 py-0 gap-0.5">
                            <Bell className="h-2.5 w-2.5" />
                            {pendingAlerts.length} Alerta{pendingAlerts.length > 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-sm text-muted-foreground">{address ? `${address.commune}` : "-"}</span>
                    {address && (address.street || address.number) && (
                      <span className="text-xs text-muted-foreground/70">
                        {[address.street, address.number].filter(Boolean).join(" ")}
                      </span>
                    )}
                  </div>
                </TableCell>
                {isNegociacionView && (
                  contract.status === 'en_negociacion' ? (
                  <>
                    <TableCell className="text-center min-w-[120px]" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-center">
                      <Select
                        value={contract.comite_gp_status || ''}
                        onValueChange={(value) => handleComiteGPChange(contract.id, value)}
                      >
                        <SelectTrigger
                          className={`h-7 text-xs w-[110px] font-medium ${getComiteGPColor(contract.comite_gp_status || null)}`}
                        >
                          <SelectValue placeholder="Seleccionar" />
                        </SelectTrigger>
                        <SelectContent>
                          {comiteGPStatuses.map(s => (
                            <SelectItem key={s.id} value={s.name} className="text-xs">
                              <span className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full bg-${s.color}-500`} />
                                {s.name}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      </div>
                    </TableCell>
                    <TableCell className="text-center min-w-[130px]" onClick={(e) => e.stopPropagation()}>
                      <Select 
                        value={contract.negotiation_subcategory || 'negociacion_contrato'} 
                        onValueChange={(value) => {
                          const fakeEvent = { stopPropagation: () => {} } as React.MouseEvent;
                          handleSubcategoryChange(fakeEvent, contract.id, value);
                        }}
                      >
                        <SelectTrigger 
                          className={`h-7 text-xs w-[120px] font-medium ${
                            contract.negotiation_subcategory === 'ubicacion_preliminar' 
                              ? 'bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-200' 
                              : 'bg-green-100 text-green-800 border-green-300 hover:bg-green-200'
                          }`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="negociacion_contrato" className="text-xs">
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-green-500"></span>
                              Rev. Contrato
                            </span>
                          </SelectItem>
                          <SelectItem value="ubicacion_preliminar" className="text-xs">
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                              Preliminar
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-center min-w-[110px]" onClick={(e) => e.stopPropagation()}>
                      <Select 
                        value={contract.clasificacion || ''} 
                        onValueChange={(value) => handleClasificacionChange(contract.id, value)}
                      >
                        <SelectTrigger 
                          className={`h-7 text-xs w-[100px] font-medium ${
                            contract.clasificacion === 'nuevo' 
                              ? 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200' 
                              : contract.clasificacion === 'reemplazo'
                                ? 'bg-purple-100 text-purple-800 border-purple-300 hover:bg-purple-200'
                                : 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200'
                          }`}
                        >
                          <SelectValue placeholder="Seleccionar" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nuevo" className="text-xs">
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                              Nuevo
                            </span>
                          </SelectItem>
                          <SelectItem value="reemplazo" className="text-xs">
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                              Reemplazo
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-center min-w-[120px]" onClick={(e) => e.stopPropagation()}>
                      <Select 
                        value={contract.origen || ''} 
                        onValueChange={(value) => handleOrigenChange(contract.id, value)}
                      >
                        <SelectTrigger 
                          className={`h-7 text-xs w-[110px] font-medium ${
                            contract.origen === 'georesearch' 
                              ? 'bg-cyan-100 text-cyan-800 border-cyan-300 hover:bg-cyan-200' 
                              : contract.origen === 'broker'
                                ? 'bg-orange-100 text-orange-800 border-orange-300 hover:bg-orange-200'
                                : contract.origen === 'propio'
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
                                  : 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200'
                          }`}
                        >
                          <SelectValue placeholder="Seleccionar" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="georesearch" className="text-xs">
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-cyan-500"></span>
                              Georesearch
                            </span>
                          </SelectItem>
                          <SelectItem value="broker" className="text-xs">
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                              Broker
                            </span>
                          </SelectItem>
                          <SelectItem value="propio" className="text-xs">
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                              Propio
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </>
                  ) : (
                  <>
                    <TableCell />
                    <TableCell />
                    <TableCell />
                    <TableCell />
                  </>
                  )
                )}
                <TableCell className="text-center min-w-[126px]" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-center">
                  {editingVenta === contract.id ? (
                    <div className="flex items-center gap-1">
                      <Input
                        type="text"
                        value={ventaMinValue}
                        onChange={(e) => setVentaMinValue(e.target.value)}
                        placeholder="Min"
                        className="h-7 w-16 text-xs"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span className="text-xs text-muted-foreground">-</span>
                      <Input
                        type="text"
                        value={ventaMaxValue}
                        onChange={(e) => setVentaMaxValue(e.target.value)}
                        placeholder="Max"
                        className="h-7 w-16 text-xs"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => handleSaveVenta(e, contract.id)}>
                        <Check className="h-3 w-3 text-green-600" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleCancelVenta}>
                        <X className="h-3 w-3 text-red-600" />
                      </Button>
                    </div>
                  ) : (
                    <button
                      className="flex flex-col items-center text-center gap-0.5 text-xs hover:bg-muted/50 px-2 py-1 rounded"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingVenta(contract.id);
                        setVentaMinValue(contract.venta_estimada ? contract.venta_estimada.toLocaleString('es-CL') : "");
                        setVentaMaxValue(contract.venta_estimada_max ? contract.venta_estimada_max.toLocaleString('es-CL') : "");
                      }}
                    >
                      {contract.venta_estimada ? (
                        (() => {
                          const currentVersion = contract.contract_versions?.find(v => v.is_current);
                          const superficie = contract.superficie_edificada_local || 0;
                          const metrosFrente = contract.metros_lineales_frente || 0;
                          let arriendoTotalMensual = 0;
                          if (currentVersion) {
                            const { promedio } = calculateWeightedAverageTotalArriendo({
                              version: { ...currentVersion, duration_months: currentVersion.duration_months },
                              signedDate: contract.signed_date,
                              superficie,
                              metrosLinealesFrente: metrosFrente,
                            });
                            arriendoTotalMensual = promedio;
                          }
                          const ventaMin = contract.venta_estimada || 0;
                          const ventaMax = contract.venta_estimada_max || ventaMin;
                          const ventaMinUF = ufValue && ventaMin > 0 ? ventaMin / ufValue : 0;
                          const ventaMaxUF = ufValue && ventaMax > 0 ? ventaMax / ufValue : 0;
                          const arriendoAnual = arriendoTotalMensual * 12;
                          const ventaAvgUF = (ventaMinUF + ventaMaxUF) / 2;
                          const ventaAnualUF = ventaAvgUF * 12;
                          const ratioArrVta = ventaAnualUF > 0 ? (arriendoAnual / ventaAnualUF) * 100 : 0;
                          return (
                            <>
                              <div className="font-medium text-foreground">
                                {ventaMin.toLocaleString('es-CL')}{ventaMax > ventaMin ? `-${ventaMax.toLocaleString('es-CL')}` : ''} MM$
                              </div>
                              {ufValue && (
                                <div className="text-[10px] text-muted-foreground">
                                  {ventaMinUF.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                  {ventaMaxUF > ventaMinUF ? `-${ventaMaxUF.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : ''} UF
                                  {superficie > 0 && (
                                    <span> · {(ventaMinUF / superficie).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}{ventaMaxUF > ventaMinUF ? `-${(ventaMaxUF / superficie).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}` : ''} UF/m²</span>
                                  )}
                                </div>
                              )}
                              {ratioArrVta > 0 && (
                                <div className="text-[10px] font-medium text-amber-600">
                                  Arr/Vta: {ratioArrVta.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                                </div>
                              )}
                            </>
                          );
                        })()
                      ) : (
                        <span className="text-muted-foreground italic">Agregar</span>
                      )}
                    </button>
                  )}
                  </div>
                </TableCell>
                <TableCell className="text-center" style={getColStyle("capex")}>
                  {(() => {
                    const capexUF = capexByContract[contract.id] || 0;
                    if (capexUF <= 0) return <span className="text-muted-foreground">-</span>;
                    const capexCLP = convertUFToPesos(capexUF);
                    const superficie = contract.superficie_edificada_local || 0;
                    const perM2 = superficie > 0 ? capexUF / superficie : 0;
                    return (
                      <div className="flex flex-col items-center">
                        <span className="font-medium text-xs">
                          ${capexCLP.toLocaleString('es-CL', { maximumFractionDigits: 0 })}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {capexUF.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF
                        </span>
                        {perM2 > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            {perM2.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF/m²
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </TableCell>
                <TableCell className="text-center min-w-[140px]">
                  {currentVersion ? (() => {
                    const superficie = contract.superficie_edificada_local || 0;
                    const metrosFrente = contract.metros_lineales_frente || 0;
                    const hasExtended = currentVersion.has_extended_gastos_comunes ?? false;
                    const methodology = currentVersion.gastos_comunes_methodology || "uf_m2";
                    
                    // Gastos comunes: calculate based on methodology
                    let gastosComunesTotal = 0;
                    
                    if (methodology === "percentage") {
                      // Percentage methodology
                      const totalCentro = currentVersion.gastos_comunes_total_centro || 0;
                      const percentage = currentVersion.gastos_comunes_percentage || 0;
                      const topeValue = currentVersion.gastos_comunes_tope;
                      const topeType = currentVersion.gastos_comunes_tope_type || "fixed";
                      
                      // Calculate base amount (Total GGCC * Percentage)
                      const calculatedAmount = (totalCentro * percentage) / 100;
                      
                      // Apply cap if configured
                      if (topeValue && topeValue > 0) {
                        // Calculate effective cap based on type
                        const effectiveTope = topeType === "uf_m2" && superficie > 0
                          ? topeValue * superficie
                          : topeValue;
                        
                        // Apply the cap only if calculated amount exceeds it
                        gastosComunesTotal = Math.min(calculatedAmount, effectiveTope);
                      } else {
                        gastosComunesTotal = calculatedAmount;
                      }
                    } else {
                      // UF/m2 methodology
                      const gastosM2 = (currentVersion.gastos_comunes_uf_m2 || 0) * superficie;
                      const gastosMlFrente = hasExtended ? (currentVersion.gastos_comunes_uf_ml_frente || 0) * metrosFrente : 0;
                      const gastosKwhClima = hasExtended ? (currentVersion.gastos_comunes_prorrata_kwh_clima || 0) : 0;
                      const adicionalAdmin = hasExtended ? currentVersion.regime_rent * ((currentVersion.adicional_administracion_percentage || 0) / 100) : 0;
                      const fixedAdminUf = currentVersion.gastos_comunes_fixed_admin_uf || 0;
                      gastosComunesTotal = gastosM2 + gastosMlFrente + gastosKwhClima + adicionalAdmin + fixedAdminUf;
                    }
                    
                    // Calculate weighted average total arriendo
                    const { promedio, hasMultiplePeriods } = calculateWeightedAverageTotalArriendo({
                      version: { ...currentVersion, duration_months: currentVersion.duration_months },
                      signedDate: contract.signed_date,
                      superficie,
                      metrosLinealesFrente: metrosFrente,
                    });

                    // Calculate current rent for label purposes
                    const { hasEscalations, hasAdjustments, isContractNotStarted, currentRent: currentRentVal2 } = calculateCurrentRent(currentVersion, contract.signed_date, superficie);
                    const showCurrentLabel = !isContractNotStarted && (hasEscalations || hasAdjustments);

                    // Individual components for non-averaged display
                    const fondoPct = currentVersion.fondo_promocion_percentage ?? 0;
                    const fondoP = currentRentVal2 * (fondoPct / 100);
                    const otros = currentVersion.otros_egresos_amount || 0;

                    return (
                      <div className="flex flex-col items-center">
                        <span className="text-sm font-medium">{formatAmount(hasMultiplePeriods ? promedio : (currentRentVal2 + gastosComunesTotal + fondoP + otros), contract.display_currency)}</span>
                        {hasMultiplePeriods ? (
                          <div className="text-[9px] text-muted-foreground whitespace-nowrap">
                            <div className="font-medium">Promedio. Incluye GGCC, FP y Otros</div>
                          </div>
                        ) : (
                          <div className="text-[9px] text-muted-foreground whitespace-nowrap">
                            <div>Canon{showCurrentLabel ? " actual" : ""}: {formatAmount(currentRentVal2, contract.display_currency)}</div>
                            <div>GC: {formatAmount(gastosComunesTotal, contract.display_currency)}{methodology === "percentage" && currentVersion.gastos_comunes_tope && currentVersion.gastos_comunes_tope > 0 ? " (c/tope)" : ""}</div>
                            <div>F. Prom: {fondoPct > 0 ? formatAmount(fondoP, contract.display_currency) : "-"}</div>
                            {otros > 0 && <div>Otros: {formatAmount(otros, contract.display_currency)}</div>}
                          </div>
                        )}
                      </div>
                    );
                  })() : "-"}
                </TableCell>
                <TableCell className="text-center">
                  <span className="text-sm text-muted-foreground">
                    {currentVersion ? `${currentVersion.duration_months}m` : "-"}
                  </span>
                </TableCell>
                {isFirmadoView && (
                  <>
                    <TableCell className="text-center">
                      <div className="flex flex-col">
                        <span className={`text-sm ${hasTerminationNotice ? "text-amber-600 font-medium" : ""}`}>
                          {endDate ? formatDateShort(endDate) : "-"}
                        </span>
                        {hasTerminationNotice && terminationNotice && (
                          <span className="text-[9px] text-amber-600">
                            Por aviso {terminationNotice.notice_type === 'sent' ? 'enviado' : 'recibido'}
                          </span>
                        )}
                        {!hasTerminationNotice && endDate && currentVersion && (() => {
                          const startDate = currentVersion.effective_date
                            ? parseISO(currentVersion.effective_date)
                            : contract.signed_date
                              ? parseISO(contract.signed_date)
                              : null;
                          if (!startDate) return null;
                          const now = new Date();
                          const monthsElapsed = differenceInMonths(now, startDate);
                          const totalMonths = currentVersion.duration_months;
                          return <span className="text-[10px] text-muted-foreground">{monthsElapsed} de {totalMonths} meses</span>;
                        })()}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center">
                        <span className={`text-sm ${isPastNotice ? "text-destructive font-medium" : ""}`}>
                          {noticeDeadline ? formatDateShort(noticeDeadline) : "-"}
                        </span>
                        {noticeDeadline && (() => {
                          const now = new Date();
                          const monthsRemaining = differenceInMonths(noticeDeadline, now);
                          const daysRemaining = differenceInDays(noticeDeadline, now);
                          
                          // Check if we're inside a notice range
                          if (noticeRangeStatus.isInsideRange && noticeRangeStatus.rangeEndDate) {
                            const rangeEndDays = differenceInDays(noticeRangeStatus.rangeEndDate, now);
                            return (
                              <div className="flex flex-col items-center">
                                <span className="text-[10px] text-amber-600 font-medium">Posible Salida en Curso</span>
                                <span className="text-[9px] text-muted-foreground">
                                  Vence el {formatDateShort(noticeRangeStatus.rangeEndDate)}
                                  {rangeEndDays > 0 && ` (${rangeEndDays} días)`}
                                </span>
                              </div>
                            );
                          }
                          
                          // Only show "Vencido" if notice deadline passed but contract hasn't ended yet
                          if (daysRemaining < 0) {
                            if (endDate && endDate > now) {
                              return <span className="text-[10px] text-destructive font-medium">Vencido</span>;
                            }
                            return null; // Contract already ended, no need to show notice status
                          } else if (monthsRemaining < 1) {
                            return <span className="text-[10px] text-amber-600 font-medium">Faltan {daysRemaining} días</span>;
                          } else {
                            return <span className="text-[10px] text-muted-foreground">Faltan {monthsRemaining} meses</span>;
                          }
                        })()}
                        {/* Show termination notice if exists */}
                        {contract.termination_notices && contract.termination_notices.length > 0 && (
                          <div className="mt-1 flex flex-col gap-0.5">
                            {contract.termination_notices.map((notice) => (
                              <Badge 
                                key={notice.id} 
                                variant={notice.notice_type === 'sent' ? 'default' : 'secondary'}
                                className="text-[9px] px-1.5 py-0 gap-1"
                              >
                                {notice.notice_type === 'sent' ? (
                                  <><FilePlus className="h-2.5 w-2.5" /> Enviado {format(parseISO(notice.notice_date), "dd/MM/yy")}</>
                                ) : (
                                  <><FileCheck className="h-2.5 w-2.5" /> Recibido {format(parseISO(notice.notice_date), "dd/MM/yy")}</>
                                )}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-col gap-1.5 items-center">
                        {/* Row 1: Operación & Obra */}
                        <div className="flex items-center gap-1.5 justify-center">
                          <div className="flex flex-col">
                            <span className="text-[9px] text-muted-foreground font-medium mb-0.5">Operación</span>
                            <Select
                              value={contract.operation_status || "operando"}
                              onValueChange={(value) =>
                                onUpdateField(
                                  { stopPropagation: () => {} } as React.MouseEvent,
                                  contract.id,
                                  "operation_status",
                                  value,
                                )
                              }
                              disabled={!isAdmin}
                            >
                              <SelectTrigger className="h-6 text-[10px] px-1.5 w-[85px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="operando" className="text-xs">
                                  Operando
                                </SelectItem>
                                <SelectItem value="cerrado" className="text-xs">
                                  Cerrado
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="flex flex-col">
                            <span className="text-[9px] text-muted-foreground font-medium mb-0.5">Obra</span>
                            <Select
                              value={contract.obra_status || "terminada"}
                              onValueChange={(value) =>
                                onUpdateField(
                                  { stopPropagation: () => {} } as React.MouseEvent,
                                  contract.id,
                                  "obra_status",
                                  value,
                                )
                              }
                              disabled={!isAdmin}
                            >
                              <SelectTrigger className="h-6 text-[10px] px-1.5 w-[100px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="terminada" className="text-xs">
                                  Terminada
                                </SelectItem>
                                <SelectItem value="construccion" className="text-xs">
                                  Construcción
                                </SelectItem>
                                <SelectItem value="remodelacion" className="text-xs">
                                  Remodelación
                                </SelectItem>
                                <SelectItem value="ampliacion" className="text-xs">
                                  Ampliación
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* Row 2: Patente & Proyecto */}
                        <div className="flex items-center gap-1.5 justify-center">
                          <div className="flex flex-col">
                            <span className="text-[9px] text-muted-foreground font-medium mb-0.5">Patente</span>
                            <Button
                              variant="outline"
                              size="sm"
                              className={`h-6 text-[10px] px-1.5 w-[85px] justify-start font-normal ${
                                contract.patente_status === "definitiva" 
                                  ? "bg-green-100 text-green-700 border-green-300 hover:bg-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800" 
                                  : contract.patente_status === "provisoria" 
                                    ? "bg-yellow-100 text-yellow-700 border-yellow-300 hover:bg-yellow-200 dark:bg-yellow-950/30 dark:text-yellow-400 dark:border-yellow-800" 
                                    : "bg-red-100 text-red-700 border-red-300 hover:bg-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800"
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/patents?contractId=${contract.id}`);
                              }}
                            >
                              {contract.patente_status === "definitiva" ? "Definitiva" : 
                               contract.patente_status === "provisoria" ? "Provisoria" : "Sin Patente"}
                            </Button>
                          </div>

                          <div className="flex flex-col">
                            <span className="text-[9px] text-muted-foreground font-medium mb-0.5">Proyecto</span>
                            <Select
                              value={(contract as any).proyecto_status || "sin_proyecto"}
                              onValueChange={(value) =>
                                onUpdateField(
                                  { stopPropagation: () => {} } as React.MouseEvent,
                                  contract.id,
                                  "proyecto_status",
                                  value,
                                )
                              }
                              disabled={!isAdmin}
                            >
                              <SelectTrigger className="h-6 text-[10px] px-1.5 w-[100px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="sin_proyecto" className="text-xs">
                                  Sin Proyecto
                                </SelectItem>
                                <SelectItem value="en_curso" className="text-xs">
                                  En Curso
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    </TableCell>
                  </>
                )}
                {isAdmin && (
                  <TableCell className="w-2 p-0 px-0.5" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={(e) => onDelete(e, contract)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Comité GP confirmation dialog */}
      <AlertDialog open={!!comiteGPConfirm} onOpenChange={() => setComiteGPConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clasificar como "Aceptada" en Comité GP</AlertDialogTitle>
            <AlertDialogDescription>
              El contrato "{comiteGPConfirm?.contractName}" se marcó como "Rev. Contrato". ¿Desea clasificarlo como "Aceptada" en la columna Comité GP?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (comiteGPConfirm) {
                await handleComiteGPChange(comiteGPConfirm.contractId, "Aceptada");
              }
              setComiteGPConfirm(null);
            }}>
              Sí, Aceptada
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rechazada confirmation dialog - move to rejected list */}
      <AlertDialog open={!!rechazadaConfirm} onOpenChange={() => setRechazadaConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mover a listado de Rechazados</AlertDialogTitle>
            <AlertDialogDescription>
              El contrato "{rechazadaConfirm?.contractName}" fue marcado como "Rechazada" en Comité GP. ¿Desea moverlo al listado de Rechazados?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, mantener aquí</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              setRechazadaConfirm(null);
              navigate('/contracts?status=en_negociacion&rechazados=true');
            }}>
              Sí, ver Rechazados
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
