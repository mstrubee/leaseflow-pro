import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Calendar, Bell, TrendingUp, Percent, Shield, Building2, Megaphone, Users, Receipt } from "lucide-react";
import { CompactEscalationChart } from "./CompactEscalationChart";
import { RenegotiationDialog } from "./RenegotiationDialog";
import { addMonths, format, subMonths, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { useEconomicIndicators } from "@/hooks/useEconomicIndicators";
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
  hasActiveRenegotiation?: boolean;
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
  hasActiveRenegotiation = false,
  onRenegotiationSuccess,
  displayCurrency = "UF"
}: CommercialConditionsSummaryProps) {
  const {
    ufValue,
    convertUFToPesos
  } = useEconomicIndicators();

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
      // Amount is in CLP, convert to UF for illustrative display
      const uf = amount / ufValue;
      return `${uf.toLocaleString("es-CL", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })} UF`;
    } else if (displayCurrency === "UF" && ufValue > 0) {
      // Amount is in UF, convert to CLP for illustrative display
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
      // Get the first non-expired range
      const today = new Date();
      const sortedRanges = [...noticeRanges].sort((a, b) => a.start_month - b.start_month);
      for (const range of sortedRanges) {
        const rangeStartDate = addMonths(startDate, range.start_month - 1);
        if (rangeStartDate > today) {
          noticeDate = rangeStartDate;
          noticeDateLabel = `rango: meses ${range.start_month}-${range.end_month}`;
          break;
        }
      }

      // If all ranges are expired, use the last one
      if (!noticeDate && sortedRanges.length > 0) {
        const lastRange = sortedRanges[sortedRanges.length - 1];
        noticeDate = addMonths(startDate, lastRange.start_month - 1);
        noticeDateLabel = `rango: meses ${lastRange.start_month}-${lastRange.end_month}`;
      }
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
  const guaranteeAmount = version.guarantee_multiplier ? version.guarantee_multiplier * version.regime_rent : null;

  // Canon per m2
  const canonPerM2 = superficieEdificadaLocal && superficieEdificadaLocal > 0 ? version.regime_rent / superficieEdificadaLocal : null;

  // Gastos comunes calculation - based on methodology
  const gastosComunesMethodology = (version as any).gastos_comunes_methodology || "uf_m2";
  
  // Calculate gastos comunes based on methodology
  const gastosComunesTotalUF = useMemo(() => {
    if (gastosComunesMethodology === "percentage") {
      // Percentage methodology
      const totalCentro = (version as any).gastos_comunes_total_centro || 0;
      const percentage = (version as any).gastos_comunes_percentage || 0;
      const topeValue = (version as any).gastos_comunes_tope || Infinity;
      const topeType = (version as any).gastos_comunes_tope_type || "fixed";
      
      // Calculate effective cap based on type
      const effectiveTope = topeType === "uf_m2" && superficieEdificadaLocal 
        ? topeValue * superficieEdificadaLocal 
        : topeValue;
      
      if (totalCentro && percentage) {
        const calculatedAmount = (totalCentro * percentage) / 100;
        return Math.min(calculatedAmount, effectiveTope);
      }
      return null;
    } else {
      // UF/m2 methodology
      const hasExtended = version.has_extended_gastos_comunes ?? false;
      const gastosM2 = version.gastos_comunes_uf_m2 && superficieEdificadaLocal ? version.gastos_comunes_uf_m2 * superficieEdificadaLocal : 0;
      const gastosMlFrente = hasExtended && version.gastos_comunes_uf_ml_frente && metrosLinealesFrente ? version.gastos_comunes_uf_ml_frente * metrosLinealesFrente : 0;
      const gastosKwhClima = hasExtended ? version.gastos_comunes_prorrata_kwh_clima || 0 : 0;
      const adicionalAdminAmount = hasExtended && version.adicional_administracion_percentage ? version.adicional_administracion_percentage / 100 * version.regime_rent : 0;
      
      const total = gastosM2 + gastosMlFrente + gastosKwhClima + adicionalAdminAmount;
      return total > 0 ? total : null;
    }
  }, [version, superficieEdificadaLocal, metrosLinealesFrente, gastosComunesMethodology]);

  // Fondo de promoción calculation
  const fondoPromocionAmount = version.fondo_promocion_percentage ? version.fondo_promocion_percentage / 100 * version.regime_rent : null;

  // Otros egresos
  const otrosEgresosAmount = version.otros_egresos_amount || 0;

  // Total arriendo calculation (Canon + GGCC + FP + Otros)
  const totalArriendo = version.regime_rent + (gastosComunesTotalUF || 0) + (fondoPromocionAmount || 0) + otrosEgresosAmount;

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
          {showRenegotiationButton && contractId && !hasActiveRenegotiation && <RenegotiationDialog contractId={contractId} currentVersion={{
          id: version.id,
          version_number: version.version_number,
          initial_rent: version.initial_rent,
          regime_rent: version.regime_rent,
          variable_rent_percentage: version.variable_rent_percentage,
          duration_months: version.duration_months,
          notice_type: version.notice_type,
          notice_value: version.notice_value
        }} hasActiveRenegotiation={false} onSuccess={onRenegotiationSuccess || (() => {})} />}
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
            <p className="text-sm font-medium">
              {dates?.noticeDate ? formatDateShort(dates.noticeDate) : "Sin definir"}
            </p>
            <p className="text-xs text-muted-foreground">
              ({dates?.noticeDateLabel || "sin especificar"})
            </p>
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
            <p className="text-xs text-muted-foreground">
              {formatSecondary(totalArriendo)}
            </p>
            {/* Composición - siempre mostrar todos los componentes */}
            <div className="text-[10px] text-muted-foreground space-y-0.5 pt-1 border-t border-border/50">
              <div className="flex justify-between">
                <span>Canon:</span>
                <span>{formatPrimary(version.regime_rent)}</span>
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
          </div>

          {/* Canon en Régimen */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <DollarSign className="h-3 w-3" />
              Canon en Régimen
            </div>
            <p className="text-sm font-semibold text-primary">
              {formatPrimary(version.regime_rent)}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatSecondary(version.regime_rent)}
            </p>
            {canonPerM2 !== null && <p className="text-xs text-muted-foreground">
                {displayCurrency === "CLP" ? `($${Math.round(canonPerM2).toLocaleString("es-CL")}/m²)` : `(${canonPerM2.toFixed(4)} UF/m²)`}
              </p>}
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
              </div>
              <p className="text-sm font-medium">
                {formatPrimary(guaranteeAmount)}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatSecondary(guaranteeAmount)}
              </p>
              <p className="text-xs text-muted-foreground">
                ({version.guarantee_multiplier}× canon)
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
        </div>

        {/* Escalonado - Compact Chart - Always show when we have dates */}
        {dates?.startDate && <div className="mt-4 pt-3 border-t border-border">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
              <TrendingUp className="h-3 w-3" />
              {hasEscalations ? "Escalonamiento de Renta" : "Tendencia de Renta"}
            </div>
            <CompactEscalationChart escalations={version.rent_escalations} initialRent={version.initial_rent} regimeRent={version.regime_rent} durationMonths={version.duration_months} effectiveDate={version.effective_date} graceMonths={version.grace_months || 0} hasPeriodicAdjustments={version.has_periodic_adjustments || false} adjustmentType={version.adjustment_type || "percentage"} adjustmentValue={version.adjustment_value || 0} firstAdjustmentMonth={version.first_adjustment_month || 0} adjustmentPeriodicityMonths={version.adjustment_periodicity_months || 0} noticeRanges={noticeRanges} noticeType={version.notice_type} noticeValue={version.notice_value} displayCurrency={displayCurrency} />
          </div>}
      </CardContent>
    </Card>;
}