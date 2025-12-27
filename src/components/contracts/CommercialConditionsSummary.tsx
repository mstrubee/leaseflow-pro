import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Calendar, Bell, TrendingUp, Percent, Shield, Building2, Megaphone, Users } from "lucide-react";
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
  fondo_promocion_percentage?: number | null;
  adicional_administracion_percentage?: number | null;
  grace_months?: number | null;
  notice_bilaterality?: string | null;
  rent_escalations: Escalation[];
}

interface CommercialConditionsSummaryProps {
  version: ContractVersion;
  signedDate: string | null;
  allVersions: ContractVersion[];
  superficieEdificadaLocal?: number | null;
  metrosLinealesFrente?: number | null;
  noticeRanges?: Array<{ start_month: number; end_month: number }>;
  contractId?: string;
  showRenegotiationButton?: boolean;
  hasActiveRenegotiation?: boolean;
  onRenegotiationSuccess?: () => void;
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
  onRenegotiationSuccess
}: CommercialConditionsSummaryProps) {
  const { ufValue } = useEconomicIndicators();
  
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
    
    return { startDate, endDate, noticeDate, noticeDateLabel };
  }, [version, signedDate, noticeRanges]);

  const formatCurrency = (amount: number) => {
    return `${amount.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF`;
  };

  const formatCLP = (amount: number) => {
    return `$${Math.round(amount).toLocaleString("es-CL")}`;
  };

  const formatDateShort = (date: Date) => {
    return format(date, "dd MMM yyyy", { locale: es });
  };

  const hasEscalations = version.rent_escalations && version.rent_escalations.length > 0;
  const guaranteeAmount = version.guarantee_multiplier 
    ? version.guarantee_multiplier * version.regime_rent 
    : null;

  // Canon per m2
  const canonPerM2 = superficieEdificadaLocal && superficieEdificadaLocal > 0
    ? version.regime_rent / superficieEdificadaLocal
    : null;

  // Gastos comunes calculation - sum of all factors including adicional admin
  const gastosM2 = version.gastos_comunes_uf_m2 && superficieEdificadaLocal
    ? version.gastos_comunes_uf_m2 * superficieEdificadaLocal
    : 0;
  const gastosMlFrente = version.gastos_comunes_uf_ml_frente && metrosLinealesFrente
    ? version.gastos_comunes_uf_ml_frente * metrosLinealesFrente
    : 0;
  const gastosKwhClima = version.gastos_comunes_prorrata_kwh_clima || 0;
  
  // Adicional por administración is now part of gastos comunes
  const adicionalAdminAmount = version.adicional_administracion_percentage
    ? (version.adicional_administracion_percentage / 100) * version.regime_rent
    : 0;
  
  const gastosComunesTotalUF = gastosM2 + gastosMlFrente + gastosKwhClima + adicionalAdminAmount > 0
    ? gastosM2 + gastosMlFrente + gastosKwhClima + adicionalAdminAmount
    : null;
  const gastosComunesTotalCLP = gastosComunesTotalUF && ufValue
    ? gastosComunesTotalUF * ufValue
    : null;

  // Fondo de promoción calculation
  const fondoPromocionAmount = version.fondo_promocion_percentage
    ? (version.fondo_promocion_percentage / 100) * version.regime_rent
    : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-4 w-4" />
            Condiciones Comerciales
          </CardTitle>
          {showRenegotiationButton && contractId && !hasActiveRenegotiation && (
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
              }}
              hasActiveRenegotiation={false}
              onSuccess={onRenegotiationSuccess || (() => {})}
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

          {/* Canon en Régimen */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <DollarSign className="h-3 w-3" />
              Canon en Régimen
            </div>
            <p className="text-sm font-semibold text-primary">
              {formatCurrency(version.regime_rent)}
            </p>
            {canonPerM2 !== null && (
              <p className="text-xs text-muted-foreground">
                ({canonPerM2.toFixed(4)} UF/m²)
              </p>
            )}
          </div>

          {/* % Variable */}
          {version.variable_rent_percentage !== null && version.variable_rent_percentage > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Percent className="h-3 w-3" />
                % Variable
              </div>
              <p className="text-sm font-medium">
                {version.variable_rent_percentage}%
              </p>
            </div>
          )}

          {/* Garantía */}
          {guaranteeAmount !== null && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Shield className="h-3 w-3" />
                Garantía
              </div>
              <p className="text-sm font-medium">
                {formatCurrency(guaranteeAmount)}
              </p>
              <p className="text-xs text-muted-foreground">
                ({version.guarantee_multiplier}× canon)
              </p>
            </div>
          )}

          {/* Gastos Comunes */}
          {gastosComunesTotalUF !== null && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Building2 className="h-3 w-3" />
                Gastos Comunes
              </div>
              <p className="text-sm font-medium">
                {formatCurrency(gastosComunesTotalUF)}
              </p>
              <div className="text-xs text-muted-foreground">
                {gastosComunesTotalCLP && (
                  <span className="block">{formatCLP(gastosComunesTotalCLP)}</span>
                )}
                {adicionalAdminAmount > 0 && (
                  <span className="block text-[10px]">(incl. {version.adicional_administracion_percentage}% adm.)</span>
                )}
              </div>
            </div>
          )}

          {/* Fondo de Promoción */}
          {fondoPromocionAmount !== null && fondoPromocionAmount > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Megaphone className="h-3 w-3" />
                Fondo Promoción
              </div>
              <p className="text-sm font-medium">
                {formatCurrency(fondoPromocionAmount)}
              </p>
              <p className="text-xs text-muted-foreground">
                ({version.fondo_promocion_percentage}% del canon)
              </p>
            </div>
          )}
        </div>

        {/* Escalonado - Compact Chart - Always show when we have dates */}
        {dates?.startDate && (
          <div className="mt-4 pt-3 border-t border-border">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
              <TrendingUp className="h-3 w-3" />
              {hasEscalations ? "Escalonamiento de Renta" : "Tendencia de Renta"}
            </div>
            <CompactEscalationChart
              escalations={version.rent_escalations}
              initialRent={version.initial_rent}
              regimeRent={version.regime_rent}
              durationMonths={version.duration_months}
              effectiveDate={version.effective_date}
              graceMonths={version.grace_months || 0}
              hasPeriodicAdjustments={version.has_periodic_adjustments || false}
              adjustmentType={version.adjustment_type || "percentage"}
              adjustmentValue={version.adjustment_value || 0}
              firstAdjustmentMonth={version.first_adjustment_month || 0}
              adjustmentPeriodicityMonths={version.adjustment_periodicity_months || 0}
              noticeRanges={noticeRanges}
              noticeType={version.notice_type}
              noticeValue={version.notice_value}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}