import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Calendar, Bell, TrendingUp, Percent, Shield } from "lucide-react";
import { CompactEscalationChart } from "./CompactEscalationChart";
import { addMonths, format, subMonths, parseISO } from "date-fns";
import { es } from "date-fns/locale";

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
  rent_escalations: Escalation[];
}

interface CommercialConditionsSummaryProps {
  version: ContractVersion;
  signedDate: string | null;
  allVersions: ContractVersion[];
}

export function CommercialConditionsSummary({ 
  version, 
  signedDate,
  allVersions
}: CommercialConditionsSummaryProps) {
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
    
    // Calculate notice date
    let noticeDate: Date;
    if (version.notice_type === "fecha") {
      noticeDate = parseISO(version.notice_value);
    } else {
      const noticeMonths = parseInt(version.notice_value) || 0;
      noticeDate = subMonths(endDate, noticeMonths);
    }
    
    return { startDate, endDate, noticeDate };
  }, [version, signedDate]);

  const formatCurrency = (amount: number) => {
    return `${amount.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF`;
  };

  const formatDateShort = (date: Date) => {
    return format(date, "dd MMM yyyy", { locale: es });
  };

  const hasEscalations = version.rent_escalations && version.rent_escalations.length > 0;
  const guaranteeAmount = version.guarantee_multiplier 
    ? version.guarantee_multiplier * version.regime_rent 
    : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <DollarSign className="h-4 w-4" />
          Condiciones Comerciales
        </CardTitle>
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
              ({version.notice_type === "meses" ? `${version.notice_value} meses antes` : "fecha fija"})
            </p>
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
        </div>

        {/* Escalonado - Compact Chart */}
        {hasEscalations && (
          <div className="mt-4 pt-3 border-t border-border">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
              <TrendingUp className="h-3 w-3" />
              Escalonamiento de Renta
            </div>
            <CompactEscalationChart
              escalations={version.rent_escalations}
              initialRent={version.initial_rent}
              regimeRent={version.regime_rent}
              durationMonths={version.duration_months}
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>
                Inicial: {formatCurrency(version.initial_rent || version.regime_rent)}
              </span>
              <span>
                Régimen: {formatCurrency(version.regime_rent)}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
