import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Calendar, Bell, TrendingUp, Percent, Shield, Building2, Megaphone, Users, Receipt, Wallet, ChevronDown, ChevronRight } from "lucide-react";
import { CompactEscalationChart } from "./CompactEscalationChart";
import { RenegotiationDialog } from "./RenegotiationDialog";
import { addMonths, format, subMonths, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { useEconomicIndicators } from "@/hooks/useEconomicIndicators";
import { supabase } from "@/integrations/supabase/client";
import { useSingleCollapsible } from "@/hooks/useCollapsibleState";

interface EntryExpense {
  id: string;
  name: string;
  amount_uf: number;
  description: string | null;
}
interface Escalation {
  id: string;
  month_number: number;
  amount: number;
}
interface ContractVersion {
  id: string;
  version_number: number;
  is_current: boolean;
  is_renegotiation: boolean;
  initial_rent: number | null;
  regime_rent: number;
  variable_rent_percentage: number | null;
  duration_months: number;
  notice_type: string;
  notice_value: string;
  effective_date: string | null;
  guarantee_multiplier?: number | null;
  guarantee_type?: string | null;
  guarantee_fixed_amount?: number | null;
  guarantee_fixed_currency?: string | null;
  has_periodic_adjustments?: boolean | null;
  first_adjustment_month?: number | null;
  adjustment_periodicity_months?: number | null;
  adjustment_type?: string | null;
  adjustment_value?: number | null;
  gastos_comunes_uf_m2?: number | null;
  gastos_comunes_uf_ml_frente?: number | null;
  gastos_comunes_prorrata_kwh_clima?: number | null;
  gastos_comunes_methodology?: string | null;
  gastos_comunes_percentage?: number | null;
  gastos_comunes_total_centro?: number | null;
  gastos_comunes_tope?: number | null;
  gastos_comunes_tope_type?: string | null;
  fondo_promocion_percentage?: number | null;
  adicional_administracion_percentage?: number | null;
  has_extended_gastos_comunes?: boolean | null;
  grace_months?: number | null;
  notice_bilaterality?: string | null;
  otros_egresos_amount?: number | null;
  otros_egresos_description?: string | null;
  regime_rent_is_uf_m2?: boolean | null;
  initial_rent_is_uf_m2?: boolean | null;
  rent_escalations: Escalation[];
}
interface CommercialConditionsSummaryProps {
  version: ContractVersion;
  signedDate: string | null;
  allVersions: ContractVersion[];
  superficieEdificadaLocal?: number | null;
  metrosLinealesFrente?: number | null;
  noticeRanges?: Array<{
    start_month: number;
    end_month: number;
  }>;
  contractId?: string;
  showRenegotiationButton?: boolean;
  onRenegotiationSuccess?: () => void;
  displayCurrency?: "UF" | "CLP";
}
export function CommercialConditionsSummary({
  version,
  signedDate,
  allVersions,
  superficieEdificadaLocal,
  metrosLinealesFrente,
  noticeRanges = [],
  contractId,
  showRenegotiationButton = false,
  onRenegotiationSuccess,
  displayCurrency = "UF"
}: CommercialConditionsSummaryProps) {
  const {
    ufValue,
    convertUFToPesos
  } = useEconomicIndicators();

  // Entry expenses state
  const [entryExpenses, setEntryExpenses] = useState<EntryExpense[]>([]);
  
  // Collapsible state for Total Arriendo detail - persisted
  const { isOpen: totalArriendoExpanded, toggle: toggleTotalArriendoExpanded } = useSingleCollapsible(
    `total_arriendo_expanded_${contractId || 'default'}`,
    false
  );
  
  useEffect(() => {
    if (contractId) {
      const loadEntryExpenses = async () => {
        const { data, error } = await supabase
          .from("entry_expenses")
          .select("id, name, amount_uf, description")
          .eq("contract_id", contractId)
          .order("display_order", { ascending: true });
        
        if (!error && data) {
          setEntryExpenses(data);
        }
      };
      loadEntryExpenses();
    }
  }, [contractId]);

  const entryExpensesTotal = useMemo(() => {
    return entryExpenses.reduce((sum, e) => sum + e.amount_uf, 0);
  }, [entryExpenses]);

  // Format functions based on display currency
  // Values are stored in the selected currency, so we display directly
  const formatPrimary = (amount: number) => {
    if (displayCurrency === "CLP") {
      return `$${Math.round(amount).toLocaleString("es-CL")}`;
    }
    return `${amount.toLocaleString("es-CL", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })} UF`;
  };

  // Secondary format shows the conversion (illustrative only)
  const formatSecondary = (amount: number) => {
    if (displayCurrency === "CLP" && ufValue > 0) {
      const uf = amount / ufValue;
      return `${uf.toLocaleString("es-CL", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })} UF`;
    } else if (displayCurrency === "UF" && ufValue > 0) {
      const clp = convertUFToPesos(amount);
      return clp > 0 ? `$${Math.round(clp).toLocaleString("es-CL")}` : "";
    }
    return "";
  };

  // Calculate dates
  const dates = useMemo(() => {
    // Find the start date: effective_date of current version, or signed_date for original
    let startDate: Date | null = null;
    if (version.effective_date) {
      startDate = parseISO(version.effective_date);
    } else if (signedDate) {
      startDate = parseISO(signedDate);
    }
    if (!startDate) return null;
    const endDate = addMonths(startDate, version.duration_months);

    // Calculate notice date based on type
    let noticeDate: Date | null = null;
    let noticeDateLabel = "";
    if (version.notice_type === "fecha" && version.notice_value) {
      noticeDate = parseISO(version.notice_value);
      noticeDateLabel = "fecha fija";
    } else if (version.notice_type === "meses" && version.notice_value) {
      const noticeMonths = parseInt(version.notice_value) || 0;
      noticeDate = subMonths(endDate, noticeMonths);
      noticeDateLabel = `${version.notice_value} meses antes`;
    } else if (version.notice_type === "rangos" && noticeRanges.length > 0) {
      // Get the first non-expired range (a range is only expired if today > end_month date)
      const today = new Date();
      const sortedRanges = [...noticeRanges].sort((a, b) => a.start_month - b.start_month);
      
      for (const range of sortedRanges) {
        const rangeStartDate = addMonths(startDate, range.start_month - 1);
        const rangeEndDate = addMonths(startDate, range.end_month - 1);
        
        // Check if we're currently within this range
        if (today >= rangeStartDate && today <= rangeEndDate) {
          noticeDate = rangeStartDate;
          noticeDateLabel = `En curso (vence ${format(rangeEndDate, "dd MMM yyyy", { locale: es })})`;
          break;
        }
        // Check if this range is still in the future
        else if (rangeStartDate > today) {
          noticeDate = rangeStartDate;
          noticeDateLabel = `${format(rangeStartDate, "dd MMM yyyy", { locale: es })} - ${format(rangeEndDate, "dd MMM yyyy", { locale: es })}`;
          break;
        }
        // If we're past the end date, continue to check next range
      }

      // If all ranges are expired (today > end_month of all ranges), use the last one and mark as expired
      if (!noticeDate && sortedRanges.length > 0) {
        const lastRange = sortedRanges[sortedRanges.length - 1];
        const rangeStartDate = addMonths(startDate, lastRange.start_month - 1);
        const rangeEndDate = addMonths(startDate, lastRange.end_month - 1);
        noticeDate = rangeStartDate;
        noticeDateLabel = `vencido (${format(rangeStartDate, "dd MMM yyyy", { locale: es })} - ${format(rangeEndDate, "dd MMM yyyy", { locale: es })})`;
      }
    }
    
    // Check if notice date is expired (for non-range types)
    const isNoticeExpired = noticeDate && noticeDate < new Date() && noticeDateLabel !== "vencido";
    if (isNoticeExpired && version.notice_type !== "rangos") {
      noticeDateLabel = "vencido";
    }
    
    return {
      startDate,
      endDate,
      noticeDate,
      noticeDateLabel
    };
  }, [version, signedDate, noticeRanges]);
  const formatDateShort = (date: Date) => {
    return format(date, "dd MMM yyyy", {
      locale: es
    });
  };
  const hasEscalations = version.rent_escalations && version.rent_escalations.length > 0;
  const hasAdjustments = version.has_periodic_adjustments && 
    (version.adjustment_value || 0) > 0 && 
    (version.first_adjustment_month || 0) > 0;
  
  // Calculate actual rents considering UF/m² mode - use full precision (3 decimals) for intermediate calculations
  const actualRegimeRent = version.regime_rent_is_uf_m2 && superficieEdificadaLocal 
    ? parseFloat((version.regime_rent * superficieEdificadaLocal).toFixed(3))
    : version.regime_rent;
  const actualInitialRent = version.initial_rent 
    ? (version.initial_rent_is_uf_m2 && superficieEdificadaLocal 
        ? parseFloat((version.initial_rent * superficieEdificadaLocal).toFixed(3))
        : version.initial_rent)
    : null;
  
  // Calculate guarantee amount based on type
  const guaranteeType = version.guarantee_type || 'multiplier';
  const guaranteeAmount = useMemo(() => {
    if (guaranteeType === 'multiplier' && version.guarantee_multiplier) {
      return version.guarantee_multiplier * actualRegimeRent;
    }
    if ((guaranteeType === 'fixed_uf' || guaranteeType === 'fixed_clp') && version.guarantee_fixed_amount) {
      // If fixed in CLP and display is UF, convert
      if (version.guarantee_fixed_currency === 'CLP' && displayCurrency === 'UF' && ufValue > 0) {
        return version.guarantee_fixed_amount / ufValue;
      }
      // If fixed in UF and display is CLP, convert
      if (version.guarantee_fixed_currency === 'UF' && displayCurrency === 'CLP' && ufValue > 0) {
        return version.guarantee_fixed_amount * ufValue;
      }
      return version.guarantee_fixed_amount;
    }
    return null;
  }, [guaranteeType, version.guarantee_multiplier, version.guarantee_fixed_amount, version.guarantee_fixed_currency, actualRegimeRent, displayCurrency, ufValue]);

  // Determine if contract has not started yet (in negotiation or future start date)
  const isContractNotStarted = useMemo(() => {
    const startDate = version.effective_date
      ? new Date(version.effective_date)
      : signedDate
        ? new Date(signedDate)
        : null;
    
    if (!startDate) return true;
    
    const today = new Date();
    return today < startDate;
  }, [version.effective_date, signedDate]);

  // Calculate current rent based on escalations, periodic adjustments, and current month
  // For contracts not started yet, we use the regime rent (projected rent)
  const currentRent = useMemo(() => {
    // Calculate current month
    const startDate = version.effective_date
      ? new Date(version.effective_date)
      : signedDate
        ? new Date(signedDate)
        : null;
    
    if (!startDate) {
      return actualRegimeRent;
    }
    
    const today = new Date();
    const diffTime = today.getTime() - startDate.getTime();
    const currentMonth = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30.44)) + 1;
    
    // For contracts that haven't started yet, return regime rent (projected)
    if (currentMonth < 1) {
      return actualRegimeRent;
    }
    
    // Check grace period - only apply for active contracts
    const graceMonths = version.grace_months || 0;
    if (currentMonth <= graceMonths && currentMonth >= 1) {
      return 0;
    }
    
    // If no escalations and no adjustments, return actual regime rent
    if (!hasEscalations && !hasAdjustments) {
      return actualRegimeRent;
    }
    
    // Start with base rent from escalations or regime rent
    let rent = actualRegimeRent;
    
    if (hasEscalations) {
      const escalations = version.rent_escalations || [];
      const sortedEscalations = [...escalations].sort((a, b) => a.month_number - b.month_number);
      
      rent = actualInitialRent || actualRegimeRent;
      for (const esc of sortedEscalations) {
        if (esc.month_number <= currentMonth) {
          // Escalations are stored as absolute values, but if regime_rent is UF/m², 
          // escalations are also in UF/m² and need to be multiplied by surface
          const escalationAmount = version.regime_rent_is_uf_m2 && superficieEdificadaLocal 
            ? esc.amount * superficieEdificadaLocal 
            : esc.amount;
          rent = escalationAmount;
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
            rent = rent * (1 + adjValue / 100);
          } else {
            rent = rent + adjValue;
          }
        }
      }
    }
    
    return rent;
  }, [version, signedDate, hasEscalations, hasAdjustments, actualRegimeRent, actualInitialRent, superficieEdificadaLocal]);

  // For contracts not started, always show "Canon en Régimen", not "Canon Actual"
  const showCurrentLabel = !isContractNotStarted && (hasEscalations || hasAdjustments);

  // Canon per m2 - use currentRent for escalated contracts
  const canonPerM2 = superficieEdificadaLocal && superficieEdificadaLocal > 0 ? currentRent / superficieEdificadaLocal : null;

  // Gastos comunes calculation - based on methodology
  const gastosComunesMethodology = version.gastos_comunes_methodology || "uf_m2";
  
  // Calculate gastos comunes based on methodology
  const gastosComunesTotalUF = useMemo(() => {
    const methodology = version.gastos_comunes_methodology || "uf_m2";
    
    if (methodology === "percentage") {
      // Percentage methodology
      const totalCentro = version.gastos_comunes_total_centro || 0;
      const percentage = version.gastos_comunes_percentage || 0;
      const topeValue = version.gastos_comunes_tope;
      const topeType = version.gastos_comunes_tope_type || "fixed";
      
      // Calculate base amount (Total GGCC * Percentage)
      const calculatedAmount = (totalCentro * percentage) / 100;
      
      // Apply cap if configured
      if (topeValue && topeValue > 0 && superficieEdificadaLocal) {
        // Calculate effective cap based on type
        const effectiveTope = topeType === "uf_m2"
          ? topeValue * superficieEdificadaLocal
          : topeValue;
        
        // Apply the cap only if calculated amount exceeds it
        return Math.min(calculatedAmount, effectiveTope);
      }
      
      return calculatedAmount > 0 ? calculatedAmount : null;
    } else {
      // UF/m2 methodology
      const hasExtended = version.has_extended_gastos_comunes ?? false;
      const gastosM2 = version.gastos_comunes_uf_m2 && superficieEdificadaLocal ? version.gastos_comunes_uf_m2 * superficieEdificadaLocal : 0;
      const gastosMlFrente = hasExtended && version.gastos_comunes_uf_ml_frente && metrosLinealesFrente ? version.gastos_comunes_uf_ml_frente * metrosLinealesFrente : 0;
      const gastosKwhClima = hasExtended ? version.gastos_comunes_prorrata_kwh_clima || 0 : 0;
      const adicionalAdminAmount = hasExtended && version.adicional_administracion_percentage ? version.adicional_administracion_percentage / 100 * actualRegimeRent : 0;
      
      const total = gastosM2 + gastosMlFrente + gastosKwhClima + adicionalAdminAmount;
      return total > 0 ? total : null;
    }
  }, [version, superficieEdificadaLocal, metrosLinealesFrente, actualRegimeRent]);

  // Fondo de promoción calculation - use currentRent for escalated contracts
  const fondoPromocionAmount = version.fondo_promocion_percentage ? version.fondo_promocion_percentage / 100 * currentRent : null;

  // Otros egresos
  const otrosEgresosAmount = version.otros_egresos_amount || 0;

  // Total arriendo calculation (Canon actual + GGCC + FP + Otros)
  const totalArriendo = currentRent + (gastosComunesTotalUF || 0) + (fondoPromocionAmount || 0) + otrosEgresosAmount;

  // Format adjustment value based on type
  const formatAdjustmentValue = () => {
    if (!version.has_periodic_adjustments || !version.adjustment_value) return null;
    if (version.adjustment_type === "percentage") {
      return `${version.adjustment_value}%`;
    } else {
      // Fixed amount - show in selected currency
      return formatPrimary(version.adjustment_value);
    }
  };
  const adjustmentValueFormatted = formatAdjustmentValue();
  return <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-4 w-4" />
            Condiciones Comerciales
          </CardTitle>
          {showRenegotiationButton && contractId && (
            <RenegotiationDialog
              contractId={contractId}
              currentVersion={{
                id: version.id,
                version_number: version.version_number,
                initial_rent: version.initial_rent,
                regime_rent: version.regime_rent,
                variable_rent_percentage: version.variable_rent_percentage,
                duration_months: version.duration_months,
                notice_type: version.notice_type,
                notice_value: version.notice_value,
                notice_bilaterality: version.notice_bilaterality,
                grace_months: version.grace_months,
                guarantee_multiplier: version.guarantee_multiplier,
                has_periodic_adjustments: version.has_periodic_adjustments,
                adjustment_type: version.adjustment_type,
                adjustment_value: version.adjustment_value,
                first_adjustment_month: version.first_adjustment_month,
                adjustment_periodicity_months: version.adjustment_periodicity_months,
                gastos_comunes_methodology: version.gastos_comunes_methodology,
                gastos_comunes_uf_m2: version.gastos_comunes_uf_m2,
                gastos_comunes_uf_ml_frente: version.gastos_comunes_uf_ml_frente,
                gastos_comunes_prorrata_kwh_clima: version.gastos_comunes_prorrata_kwh_clima,
                gastos_comunes_percentage: version.gastos_comunes_percentage,
                gastos_comunes_total_centro: version.gastos_comunes_total_centro,
                gastos_comunes_tope: version.gastos_comunes_tope,
                gastos_comunes_tope_type: version.gastos_comunes_tope_type,
                has_extended_gastos_comunes: version.has_extended_gastos_comunes,
                adicional_administracion_percentage: version.adicional_administracion_percentage,
                fondo_promocion_percentage: version.fondo_promocion_percentage,
                otros_egresos_amount: version.otros_egresos_amount,
                otros_egresos_description: version.otros_egresos_description,
                rent_escalations: (version.rent_escalations || []).map((e) => ({
                  month_number: e.month_number,
                  amount: e.amount,
                })),
                notice_ranges: noticeRanges,
              }}
              onSuccess={onRenegotiationSuccess || (() => {})}
              displayCurrency={displayCurrency}
            />
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {/* Fecha Inicio */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              Fecha Inicio
            </div>
            <p className="text-sm font-medium">
              {dates?.startDate ? formatDateShort(dates.startDate) : "Sin definir"}
            </p>
          </div>

          {/* Fecha Término */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              Fecha Término
            </div>
            <p className="text-sm font-medium">
              {dates?.endDate ? formatDateShort(dates.endDate) : "Sin definir"}
            </p>
            <p className="text-xs text-muted-foreground">
              ({version.duration_months} meses)
            </p>
          </div>

          {/* Fecha Aviso */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Bell className="h-3 w-3" />
              Fecha Aviso
            </div>
            {dates?.noticeDateLabel?.startsWith("vencido") ? (
              <>
                <Badge variant="destructive" className="text-xs">
                  Vencido
                </Badge>
                {version.notice_type === "rangos" && (
                  <p className="text-xs text-muted-foreground">
                    {dates.noticeDateLabel.replace("vencido ", "")}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-sm font-medium">
                  {dates?.noticeDateLabel || (dates?.noticeDate ? formatDateShort(dates.noticeDate) : "Sin definir")}
                </p>
                {version.notice_type !== "rangos" && dates?.noticeDateLabel && (
                  <p className="text-xs text-muted-foreground">
                    ({dates.noticeDateLabel})
                  </p>
                )}
              </>
            )}
          </div>

          {/* Tipo de Aviso (Bilateralidad) */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              Tipo de Aviso
            </div>
            <Badge variant={version.notice_bilaterality === "bilateral" ? "default" : "secondary"} className="text-xs">
              {version.notice_bilaterality === "bilateral" ? "Bilateral" : "Unilateral GP"}
            </Badge>
          </div>

          {/* Total Arriendo */}
          <div className="space-y-1 col-span-2 md:col-span-1 bg-primary/5 rounded-lg p-3 -m-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <DollarSign className="h-3 w-3" />
              Total Arriendo
            </div>
            <p className="text-lg font-bold text-primary">
              {formatPrimary(totalArriendo)}
            </p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{formatSecondary(totalArriendo)}</span>
              {superficieEdificadaLocal && superficieEdificadaLocal > 0 && (
                <span>
                  ({displayCurrency === "CLP" 
                    ? `$${Math.round(totalArriendo / superficieEdificadaLocal).toLocaleString("es-CL")}/m²` 
                    : `${(totalArriendo / superficieEdificadaLocal).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} UF/m²`})
                </span>
              )}
            </div>
            {/* Composición colapsable */}
            <div 
              className="flex items-center gap-1 cursor-pointer pt-1 border-t border-border/50 hover:text-foreground transition-colors"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleTotalArriendoExpanded();
              }}
            >
              {totalArriendoExpanded ? (
                <ChevronDown className="h-3 w-3 text-primary" />
              ) : (
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
              )}
              <span className="text-[10px] text-muted-foreground">
                {totalArriendoExpanded ? "Ocultar detalle" : "Ver detalle"}
              </span>
            </div>
            {totalArriendoExpanded && (
              <div className="text-[10px] text-muted-foreground space-y-0.5 animate-in slide-in-from-top-1 duration-200">
                <div className="flex justify-between">
                  <span>Canon{showCurrentLabel ? " actual" : ""}:</span>
                  <span>{formatPrimary(currentRent)}</span>
                </div>
                <div className="flex justify-between">
                  <span>GGCC:</span>
                  <span>{gastosComunesTotalUF ? formatPrimary(gastosComunesTotalUF) : "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span>F. Prom:</span>
                  <span>{fondoPromocionAmount ? formatPrimary(fondoPromocionAmount) : "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Otros:</span>
                  <span>{otrosEgresosAmount > 0 ? formatPrimary(otrosEgresosAmount) : "-"}</span>
                </div>
                <div className="flex justify-between text-primary font-medium">
                  <span>Variable:</span>
                  <span>{version.variable_rent_percentage !== null && version.variable_rent_percentage > 0 ? `${version.variable_rent_percentage}%` : "-"}</span>
                </div>
              </div>
            )}
          </div>

          {/* Canon actual o Canon en Régimen */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <DollarSign className="h-3 w-3" />
              {showCurrentLabel ? "Canon Actual" : "Canon de Arriendo"}
              {version.regime_rent_is_uf_m2 && (
                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">UF/m²</Badge>
              )}
            </div>
            <p className="text-sm font-semibold text-primary">
              {formatPrimary(currentRent)}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatSecondary(currentRent)}
            </p>
            {/* Show UF/m² breakdown when user entered value in UF/m² mode */}
            {version.regime_rent_is_uf_m2 && superficieEdificadaLocal && (
              <p className="text-xs text-muted-foreground">
                ({superficieEdificadaLocal.toLocaleString("es-CL", { maximumFractionDigits: 2 })} m² × {version.regime_rent.toLocaleString("es-CL", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} UF/m²)
              </p>
            )}
            {/* Show calculated UF/m² when NOT in UF/m² mode */}
            {!version.regime_rent_is_uf_m2 && canonPerM2 !== null && (
              <p className="text-xs text-muted-foreground">
                {displayCurrency === "CLP" ? `($${Math.round(canonPerM2).toLocaleString("es-CL")}/m²)` : `(${canonPerM2.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} UF/m²)`}
              </p>
            )}
          </div>

          {/* % Variable */}
          {version.variable_rent_percentage !== null && version.variable_rent_percentage > 0 && <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Percent className="h-3 w-3" />
                % Variable
              </div>
              <p className="text-sm font-medium">
                {version.variable_rent_percentage}%
              </p>
            </div>}

          {/* Garantía */}
          {guaranteeAmount !== null && <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Shield className="h-3 w-3" />
                Garantía
                {guaranteeType === 'multiplier' && version.regime_rent_is_uf_m2 && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">UF/m²</Badge>
                )}
                {(guaranteeType === 'fixed_uf' || guaranteeType === 'fixed_clp') && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                    {version.guarantee_fixed_currency === 'CLP' ? '$' : 'UF'}
                  </Badge>
                )}
              </div>
              <p className="text-sm font-medium">
                {formatPrimary(guaranteeAmount)}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatSecondary(guaranteeAmount)}
              </p>
              <p className="text-xs text-muted-foreground">
                {guaranteeType === 'multiplier' 
                  ? `(${version.guarantee_multiplier}× canon)`
                  : `(monto fijo en ${version.guarantee_fixed_currency})`
                }
              </p>
            </div>}

          {/* Reajuste Periódico */}
          {version.has_periodic_adjustments && adjustmentValueFormatted && <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <TrendingUp className="h-3 w-3" />
                Reajuste
              </div>
              <p className="text-sm font-medium">
                {adjustmentValueFormatted}
              </p>
              {version.adjustment_type === "fixed" && version.adjustment_value && <p className="text-xs text-muted-foreground">
                  {formatSecondary(version.adjustment_value)}
                </p>}
              <p className="text-xs text-muted-foreground">
                cada {version.adjustment_periodicity_months} meses
              </p>
            </div>}

          {/* Gastos Comunes */}
          {gastosComunesTotalUF !== null && <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Building2 className="h-3 w-3" />
                Gastos Comunes
              </div>
              <p className="text-sm font-medium">
                {formatPrimary(gastosComunesTotalUF)}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatSecondary(gastosComunesTotalUF)}
              </p>
              {gastosComunesMethodology === "uf_m2" && version.adicional_administracion_percentage && version.adicional_administracion_percentage > 0 && <p className="text-[10px] text-muted-foreground">
                  (incl. {version.adicional_administracion_percentage}% adm.)
                </p>}
              {gastosComunesMethodology === "percentage" && <p className="text-[10px] text-muted-foreground">
                  ({(version as any).gastos_comunes_percentage}% del total{(version as any).gastos_comunes_tope ? `, tope ${(version as any).gastos_comunes_tope} ${(version as any).gastos_comunes_tope_type === "uf_m2" ? "UF/m²" : "UF"}` : ""})
                </p>}
            </div>}

          {/* Fondo de Promoción */}
          {fondoPromocionAmount !== null && fondoPromocionAmount > 0 && <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Megaphone className="h-3 w-3" />
                Fondo Promoción
              </div>
              <p className="text-sm font-medium">
                {formatPrimary(fondoPromocionAmount)}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatSecondary(fondoPromocionAmount)}
              </p>
              <p className="text-xs text-muted-foreground">
                ({version.fondo_promocion_percentage}% del canon)
              </p>
            </div>}

          {/* Otros Egresos */}
          {version.otros_egresos_amount !== null && version.otros_egresos_amount !== undefined && version.otros_egresos_amount > 0 && <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Receipt className="h-3 w-3" />
                Otros Egresos (Arriendos) 
              </div>
              <p className="text-sm font-medium">
                {formatPrimary(version.otros_egresos_amount)}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatSecondary(version.otros_egresos_amount)}
              </p>
              {version.otros_egresos_description && <p className="text-xs text-muted-foreground">
                  {version.otros_egresos_description}
                </p>}
            </div>}

          {/* Gastos de Entrada */}
          {entryExpenses.length > 0 && (
            <div className="space-y-1 col-span-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Wallet className="h-3 w-3" />
                Gastos de Entrada
              </div>
              <p className="text-sm font-semibold text-primary">
                {formatPrimary(entryExpensesTotal)}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatSecondary(entryExpensesTotal)}
              </p>
              <div className="text-[10px] text-muted-foreground space-y-0.5 pt-1 border-t border-border/50">
                {entryExpenses.map((expense) => (
                  <div key={expense.id} className="flex justify-between">
                    <span>{expense.name}{expense.description ? ` (${expense.description})` : ''}</span>
                    <span>{formatPrimary(expense.amount_uf)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Escalonado - Compact Chart - Always show when we have dates */}
        {dates?.startDate && <div className="mt-4 pt-3 border-t border-border">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
              <TrendingUp className="h-3 w-3" />
              {hasEscalations ? "Escalonamiento de Renta" : "Tendencia de Renta"}
            </div>
            <CompactEscalationChart escalations={version.rent_escalations} initialRent={version.initial_rent} regimeRent={version.regime_rent} durationMonths={version.duration_months} effectiveDate={version.effective_date || signedDate || undefined} graceMonths={version.grace_months || 0} hasPeriodicAdjustments={version.has_periodic_adjustments || false} adjustmentType={version.adjustment_type || "percentage"} adjustmentValue={version.adjustment_value || 0} firstAdjustmentMonth={version.first_adjustment_month || 0} adjustmentPeriodicityMonths={version.adjustment_periodicity_months || 0} noticeRanges={noticeRanges} noticeType={version.notice_type} noticeValue={version.notice_value} displayCurrency={displayCurrency} isUfM2Mode={version.initial_rent_is_uf_m2 || version.regime_rent_is_uf_m2 || false} superficieM2={superficieEdificadaLocal || 0} />
          </div>}
      </CardContent>
    </Card>;
}