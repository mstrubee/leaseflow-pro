import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, AlertTriangle, FileCheck, FilePlus, Bell, FileWarning, DollarSign, Check, X } from "lucide-react";
import { ContractStatusActions } from "@/components/contracts/ContractStatusActions";
import { useEconomicIndicators } from "@/hooks/useEconomicIndicators";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { addMonths, format, subMonths, parseISO, differenceInMonths, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

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
}

interface ContractVersion {
  id?: string;
  regime_rent: number;
  initial_rent?: number | null;
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
  contract_companies?: ContractCompany[];
  contract_addresses: Array<{ region: string; commune: string; street?: string; number?: string }>;
  contract_versions: ContractVersion[];
  superficie_edificada_local: number | null;
  superficie_terreno: number | null;
  metros_lineales_frente?: number | null;
  termination_notices?: TerminationNotice[];
}

interface ContractsTableProps {
  contracts: Contract[];
  isFirmadoView: boolean;
  onDelete: (e: React.MouseEvent, contract: Contract) => void;
  onUpdateField: (e: React.MouseEvent, contractId: string, field: string, value: string) => void;
  onRefresh: () => void;
}

export function ContractsTable({ contracts, isFirmadoView, onDelete, onUpdateField, onRefresh }: ContractsTableProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { ufValue, convertUFToPesos } = useEconomicIndicators();
  const { isAdmin } = useAuth();
  const [contractAlerts, setContractAlerts] = useState<Record<string, ContractAlert[]>>({});
  const [editingVenta, setEditingVenta] = useState<string | null>(null);
  const [ventaValue, setVentaValue] = useState<string>("");

  const isNegociacionView = !isFirmadoView && contracts.some(c => c.status === 'en_negociacion');

  const handleSaveVenta = async (e: React.MouseEvent, contractId: string) => {
    e.stopPropagation();
    const numValue = ventaValue ? parseFloat(ventaValue.replace(/\./g, '').replace(',', '.')) : null;
    
    const { error } = await supabase
      .from('contracts')
      .update({ venta_estimada: numValue })
      .eq('id', contractId);

    if (error) {
      toast.error('Error al guardar la venta estimada');
    } else {
      toast.success('Venta estimada guardada');
      onRefresh();
    }
    setEditingVenta(null);
    setVentaValue("");
  };

  const handleCancelVenta = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingVenta(null);
    setVentaValue("");
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
  const calculateCurrentRent = (version: ContractVersion, signedDate: string | null): { currentRent: number; hasEscalations: boolean; hasAdjustments: boolean } => {
    const escalations = version.rent_escalations || [];
    const hasEscalations = escalations.length > 0;
    const hasAdjustments = version.has_periodic_adjustments && 
      (version.adjustment_value || 0) > 0 && 
      (version.first_adjustment_month || 0) > 0;
    
    // Calculate current month
    const startDate = version.effective_date
      ? parseISO(version.effective_date)
      : signedDate
        ? parseISO(signedDate)
        : null;
    
    if (!startDate) {
      return { currentRent: version.regime_rent, hasEscalations, hasAdjustments: !!hasAdjustments };
    }
    
    const today = new Date();
    const diffTime = today.getTime() - startDate.getTime();
    const currentMonth = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30.44)) + 1;
    
    // Check grace period
    const graceMonths = version.grace_months || 0;
    if (currentMonth <= graceMonths) {
      return { currentRent: 0, hasEscalations, hasAdjustments: !!hasAdjustments };
    }
    
    // If no escalations and no adjustments, return regime rent
    if (!hasEscalations && !hasAdjustments) {
      return { currentRent: version.regime_rent, hasEscalations: false, hasAdjustments: false };
    }
    
    // Start with base rent from escalations or regime rent
    let currentRent = version.regime_rent;
    
    if (hasEscalations) {
      // Find the applicable escalation for current month
      const sortedEscalations = [...escalations].sort((a, b) => a.month_number - b.month_number);
      
      currentRent = version.initial_rent || version.regime_rent;
      for (const esc of sortedEscalations) {
        if (esc.month_number <= currentMonth) {
          currentRent = esc.amount;
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
    
    return { currentRent, hasEscalations, hasAdjustments: !!hasAdjustments };
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

  return (
    <div className="rounded-md border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="font-semibold">Contrato</TableHead>
            <TableHead className="font-semibold">Ubicación</TableHead>
            {isNegociacionView && (
              <>
                <TableHead className="font-semibold text-center">Categoría</TableHead>
                <TableHead className="font-semibold text-center">Venta Est.</TableHead>
              </>
            )}
            <TableHead className="font-semibold text-center min-w-[140px]"><div className="leading-tight">Costo<br/>Arriendo</div></TableHead>
            <TableHead className="font-semibold text-center">Duración</TableHead>
            {isFirmadoView && (
              <>
                <TableHead className="font-semibold text-center">Término</TableHead>
                <TableHead className="font-semibold text-center">Aviso</TableHead>
                <TableHead className="font-semibold text-center">Estado</TableHead>
              </>
            )}
            {isAdmin && <TableHead className="w-[50px]"></TableHead>}
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
                    <div className="flex-1">
                      <div className="font-medium text-sm">{contract.name}</div>
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
                  <>
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
                    <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                      {editingVenta === contract.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            type="text"
                            value={ventaValue}
                            onChange={(e) => setVentaValue(e.target.value)}
                            placeholder="0"
                            className="h-7 w-24 text-xs"
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
                          className="flex items-center gap-1 text-xs hover:bg-muted/50 px-2 py-1 rounded"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingVenta(contract.id);
                            setVentaValue(contract.venta_estimada ? contract.venta_estimada.toLocaleString('es-CL') : "");
                          }}
                        >
                          <DollarSign className="h-3 w-3 text-muted-foreground" />
                          {contract.venta_estimada 
                            ? `$${contract.venta_estimada.toLocaleString('es-CL')}`
                            : <span className="text-muted-foreground italic">Agregar</span>
                          }
                        </button>
                      )}
                    </TableCell>
                  </>
                )}
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
                      gastosComunesTotal = gastosM2 + gastosMlFrente + gastosKwhClima + adicionalAdmin;
                    }
                    
                    // Calculate current rent (considering escalations and adjustments)
                    const { currentRent, hasEscalations, hasAdjustments } = calculateCurrentRent(currentVersion, contract.signed_date);
                    const showCurrentLabel = hasEscalations || hasAdjustments;
                    
                    // Fondo promoción - use currentRent for calculation
                    const fondoPromocionPct = currentVersion.fondo_promocion_percentage ?? 0;
                    const fondoPromocion = currentRent * (fondoPromocionPct / 100);
                    
                    // Otros egresos
                    const otrosEgresos = currentVersion.otros_egresos_amount || 0;
                    
                    const total = currentRent + gastosComunesTotal + fondoPromocion + otrosEgresos;
                    return (
                      <div className="flex flex-col items-center">
                        <span className="text-sm font-medium">{formatAmount(total, contract.display_currency)}</span>
                        <div className="text-[9px] text-muted-foreground whitespace-nowrap">
                          <div>Canon{showCurrentLabel ? " actual" : ""}: {formatAmount(currentRent, contract.display_currency)}</div>
                          <div>GC: {formatAmount(gastosComunesTotal, contract.display_currency)}{methodology === "percentage" && currentVersion.gastos_comunes_tope && currentVersion.gastos_comunes_tope > 0 ? " (c/tope)" : ""}</div>
                          <div>F. Prom: {fondoPromocionPct > 0 ? formatAmount(fondoPromocion, contract.display_currency) : "-"}</div>
                          {otrosEgresos > 0 && <div>Otros: {formatAmount(otrosEgresos, contract.display_currency)}</div>}
                        </div>
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
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
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
    </div>
  );
}
