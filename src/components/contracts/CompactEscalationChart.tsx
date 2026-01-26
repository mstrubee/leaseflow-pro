import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine, ReferenceArea, CartesianGrid, LabelList } from "recharts";
import { addMonths, format } from "date-fns";
import { es } from "date-fns/locale";
import { useEconomicIndicators } from "@/hooks/useEconomicIndicators";

interface Escalation {
  month_number: number;
  amount: number;
}

interface NoticeRange {
  start_month: number;
  end_month: number;
}

interface CompactEscalationChartProps {
  escalations: Escalation[];
  initialRent?: number | null;
  regimeRent: number;
  durationMonths: number;
  effectiveDate?: string | null;
  graceMonths?: number;
  hasPeriodicAdjustments?: boolean;
  adjustmentType?: string;
  adjustmentValue?: number;
  firstAdjustmentMonth?: number;
  adjustmentPeriodicityMonths?: number;
  noticeRanges?: NoticeRange[];
  noticeType?: string;
  noticeValue?: string;
  displayCurrency?: "UF" | "CLP";
  isUfM2Mode?: boolean;
  superficieM2?: number;
  // Contract end notice (for sin_termino type)
  contractEndNoticeMonths?: number;
}

export function CompactEscalationChart({ 
  escalations, 
  initialRent, 
  regimeRent,
  durationMonths,
  effectiveDate,
  graceMonths = 0,
  hasPeriodicAdjustments = false,
  adjustmentType = "percentage",
  adjustmentValue = 0,
  firstAdjustmentMonth = 0,
  adjustmentPeriodicityMonths = 0,
  noticeRanges = [],
  noticeType = "meses",
  noticeValue = "",
  displayCurrency = "UF",
  isUfM2Mode = false,
  superficieM2 = 0,
  contractEndNoticeMonths = 0,
}: CompactEscalationChartProps) {
  const { ufValue } = useEconomicIndicators();
  
  // Calculate current month based on effective date
  const currentMonth = useMemo(() => {
    if (!effectiveDate) return null;
    const startDate = new Date(effectiveDate);
    const today = new Date();
    const diffTime = today.getTime() - startDate.getTime();
    const diffMonths = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30.44)) + 1;
    if (diffMonths >= 1 && diffMonths <= durationMonths) {
      return diffMonths;
    }
    return null;
  }, [effectiveDate, durationMonths]);

  const { chartData, summaryPoints, showRegimeLine } = useMemo(() => {
    const sortedEscalations = [...escalations].sort((a, b) => a.month_number - b.month_number);
    const data: { month: number; rent: number; isGrace?: boolean; isAdjustment?: boolean }[] = [];
    const summary: { month: number; rent: number; isRegime: boolean }[] = [];
    
    // Multiplier for converting UF/m² to total UF
    const surfaceMultiplier = (isUfM2Mode && superficieM2 > 0) ? superficieM2 : 1;
    
    // Build a map of all rent change points
    const rentChangePoints = new Map<number, { rent: number; isGrace?: boolean; isAdjustment?: boolean }>();
    
    const firstPayingMonth = graceMonths + 1;
    
    // Add grace months at 0 rent
    if (graceMonths > 0) {
      rentChangePoints.set(1, { rent: 0, isGrace: true });
      if (graceMonths > 1) {
        rentChangePoints.set(graceMonths, { rent: 0, isGrace: true });
      }
    }
    
    // Determine the starting rent after grace period (convert to total if UF/m²)
    const month1Escalation = sortedEscalations.find(e => e.month_number === firstPayingMonth);
    const rawStartRent = month1Escalation?.amount || initialRent || regimeRent;
    const startRent = rawStartRent * surfaceMultiplier;
    rentChangePoints.set(firstPayingMonth, { rent: startRent });
    
    // Add escalation points (convert to total if UF/m²)
    sortedEscalations.forEach(e => {
      if (e.month_number > firstPayingMonth) {
        rentChangePoints.set(e.month_number, { rent: e.amount * surfaceMultiplier });
      }
    });
    
    // Add periodic adjustments
    // Note: if no periodicity, apply just once
    if (hasPeriodicAdjustments && adjustmentValue > 0 && firstAdjustmentMonth > 0) {
      const baseRent = (regimeRent || initialRent || 0) * surfaceMultiplier;
      let currentRent = baseRent;
      let month = firstAdjustmentMonth;
      
      const periodicity = adjustmentPeriodicityMonths > 0 ? adjustmentPeriodicityMonths : durationMonths + 1;
      
      while (month <= durationMonths) {
        if (adjustmentType === "percentage") {
          currentRent = currentRent * (1 + adjustmentValue / 100);
        } else {
          currentRent = currentRent + (adjustmentValue * surfaceMultiplier);
        }
        
        if (!rentChangePoints.has(month)) {
          rentChangePoints.set(month, { rent: currentRent, isAdjustment: true });
        }
        
        month += periodicity;
      }
    }
    
    // Convert map to sorted array of change points
    const changePointsSorted = Array.from(rentChangePoints.entries())
      .sort((a, b) => a[0] - b[0]);
    
    // Build data array with proper step visualization
    changePointsSorted.forEach(([month, value]) => {
      data.push({ month, ...value });
    });
    
    // Add final month to extend the line if not already present
    if (!rentChangePoints.has(durationMonths)) {
      const lastChange = changePointsSorted[changePointsSorted.length - 1];
      if (lastChange) {
        data.push({ month: durationMonths, rent: lastChange[1].rent });
      }
    }
    
    // Sort final data
    data.sort((a, b) => a.month - b.month);
    
    // Calculate total regime rent for reference line
    const totalRegimeRent = regimeRent * surfaceMultiplier;
    
    // Only show regime line if regimeRent > 0 (not for escalation-only contracts)
    const showRegime = regimeRent > 0;
    
    // Build summary points - first few key points
    const sortedData = [...data].slice(0, 4);
    sortedData.forEach(d => {
      summary.push({ 
        month: d.month, 
        rent: d.rent, 
        isRegime: showRegime && Math.abs(d.rent - totalRegimeRent) < 0.01
      });
    });
    
    return { chartData: data, summaryPoints: summary, showRegimeLine: showRegime, totalRegimeRent };
  }, [escalations, initialRent, regimeRent, durationMonths, graceMonths, hasPeriodicAdjustments, adjustmentType, adjustmentValue, firstAdjustmentMonth, adjustmentPeriodicityMonths, isUfM2Mode, superficieM2]);

  // Calculate notice month based on type
  const noticeMonthInfo = useMemo(() => {
    if (!effectiveDate) return null;
    
    const startDate = new Date(effectiveDate);
    
    if (noticeType === "sin_termino" && contractEndNoticeMonths > 0) {
      // Contract end notice - shown as a notice window before contract expiration
      const noticeMonth = durationMonths - contractEndNoticeMonths;
      const noticeDate = addMonths(startDate, noticeMonth);
      return { 
        month: noticeMonth, 
        date: noticeDate, 
        label: `Aviso de término ${contractEndNoticeMonths}m antes`, 
        deadlineMonth: noticeMonth,
        isContractEndNotice: true 
      };
    } else if (noticeType === "meses" && noticeValue) {
      const noticeMonths = parseInt(noticeValue) || 0;
      const noticeMonth = durationMonths - noticeMonths;
      const noticeDate = addMonths(startDate, noticeMonth);
      return { month: noticeMonth, date: noticeDate, label: `${noticeValue} meses antes`, deadlineMonth: noticeMonth };
    } else if (noticeType === "fecha" && noticeValue) {
      const noticeDate = new Date(noticeValue);
      const diffTime = noticeDate.getTime() - startDate.getTime();
      const noticeMonth = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30.44)) + 1;
      return { month: Math.max(1, Math.min(noticeMonth, durationMonths)), date: noticeDate, label: "fecha fija", deadlineMonth: noticeMonth };
    } else if (noticeType === "rangos" && noticeRanges.length > 0) {
      const sortedRanges = [...noticeRanges].sort((a, b) => a.start_month - b.start_month);
      // The deadline is the last end_month of the ranges
      const lastRange = sortedRanges[sortedRanges.length - 1];
      return { ranges: sortedRanges, deadlineMonth: lastRange?.end_month };
    } else if (noticeType === "desde_mes" && noticeValue) {
      // "Desde mes en específico" - range from specified month to end of contract
      const startMonth = parseInt(noticeValue) || 1;
      const range: NoticeRange = { start_month: startMonth, end_month: durationMonths };
      return { ranges: [range], deadlineMonth: durationMonths, isFromSpecificMonth: true };
    }
    return null;
  }, [effectiveDate, noticeType, noticeValue, noticeRanges, durationMonths, contractEndNoticeMonths]);

  // Format amount based on display currency
  const formatAmount = (value: number) => {
    if (displayCurrency === "CLP") {
      return `$${Math.round(value).toLocaleString("es-CL")}`;
    }
    return `${value.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} UF`;
  };

  // Format secondary (illustrative)
  const formatSecondary = (value: number) => {
    if (displayCurrency === "CLP" && ufValue > 0) {
      const uf = value / ufValue;
      return `${uf.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF`;
    } else if (displayCurrency === "UF" && ufValue > 0) {
      const clp = value * ufValue;
      return `$${Math.round(clp).toLocaleString("es-CL")}`;
    }
    return "";
  };

  // If no chart data, show minimal chart with regime rent
  const displayData = chartData.length > 0 ? chartData : [
    { month: 1, rent: regimeRent },
    { month: durationMonths, rent: regimeRent }
  ];

  // Calculate domain
  const xDomain: [number, number] = [1, durationMonths];

  return (
    <div className="space-y-2">
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={displayData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="month" 
              type="number"
              domain={xDomain}
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => {
                if (effectiveDate) {
                  const date = addMonths(new Date(effectiveDate), v - 1);
                  return format(date, "MMM yy", { locale: es });
                }
                return `M${v}`;
              }}
              scale="linear"
              interval="preserveStartEnd"
            />
            <YAxis 
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => `${v}`}
            />
            <Tooltip 
              formatter={(value: number, name: string, props: any) => {
                const point = props.payload;
                let label = "Canon";
                if (point?.isGrace) label = "Gracia";
                if (point?.isAdjustment) label = "Reajuste";
                return [formatAmount(value), label];
              }}
              labelFormatter={(label) => `Mes ${label}`}
            />
            
            {/* Notice ranges as shaded areas */}
            {noticeMonthInfo && 'ranges' in noticeMonthInfo && noticeMonthInfo.ranges?.map((range, idx) => (
              <ReferenceArea
                key={`area-${idx}`}
                x1={range.start_month}
                x2={range.end_month}
                fill="hsl(var(--warning))"
                fillOpacity={0.15}
                stroke="none"
                label={{
                  value: noticeMonthInfo.isFromSpecificMonth 
                    ? `Término Anticipado desde M${range.start_month}`
                    : noticeMonthInfo.ranges && noticeMonthInfo.ranges.length > 1 
                      ? `Rango ${idx + 1}` 
                      : "Rango Aviso Salida",
                  fontSize: 12,
                  fontWeight: 600,
                  fill: "hsl(var(--warning))",
                  position: "center"
                }}
              />
            ))}
            {/* Vertical lines at range boundaries - start in warning, end in red (deadline) */}
            {noticeMonthInfo && 'ranges' in noticeMonthInfo && noticeMonthInfo.ranges?.flatMap((range, idx) => {
              // Calculate deadline month (notice period before end of range)
              // We need to get months_before from somewhere - for now use a default or passed prop
              const deadlineMonth = range.start_month; // The deadline is at the start of the range window
              const deadlineDateStr = effectiveDate 
                ? format(addMonths(new Date(effectiveDate), deadlineMonth - 1), "MMM yy", { locale: es })
                : `M${deadlineMonth}`;
              
              return [
                <ReferenceLine
                  key={`start-${idx}`}
                  x={range.start_month}
                  stroke="hsl(var(--warning))"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                />,
                <ReferenceLine
                  key={`end-${idx}`}
                  x={range.end_month}
                  stroke="hsl(var(--destructive))"
                  strokeWidth={3}
                  strokeDasharray="8 4"
                  label={{
                    value: effectiveDate 
                      ? format(addMonths(new Date(effectiveDate), range.end_month - 1), "MMM yy", { locale: es })
                      : `M${range.end_month}`,
                    fontSize: 9,
                    fontWeight: 600,
                    fill: "hsl(var(--destructive))",
                    position: "top"
                  }}
                />
              ];
            })}
            
            {/* Single notice deadline line for meses/fecha type or contract end notice - red dotted line */}
            {noticeMonthInfo && 'month' in noticeMonthInfo && (
              <ReferenceLine 
                x={noticeMonthInfo.month} 
                stroke={noticeMonthInfo.isContractEndNotice ? "hsl(var(--primary))" : "hsl(var(--destructive))"}
                strokeWidth={3}
                strokeDasharray="8 4"
                label={{ 
                  value: noticeMonthInfo.isContractEndNotice 
                    ? `Aviso Término ${contractEndNoticeMonths}m` 
                    : "Límite Aviso", 
                  fontSize: 11, 
                  fontWeight: 600,
                  fill: noticeMonthInfo.isContractEndNotice ? "hsl(var(--primary))" : "hsl(var(--destructive))",
                  position: "insideTopRight"
                }}
              />
            )}
            
            <Line 
              type="stepAfter" 
              dataKey="rent" 
              stroke="hsl(var(--primary))" 
              strokeWidth={2}
              dot={{ r: 4, fill: "hsl(var(--primary))", stroke: "hsl(var(--background))", strokeWidth: 2 }}
              activeDot={{ r: 6, fill: "hsl(var(--primary))" }}
            >
              <LabelList 
                dataKey="rent" 
                position="top" 
                offset={8}
                formatter={(value: number) => displayCurrency === "CLP" 
                  ? `$${Math.round(value / 1000)}k` 
                  : `${value.toLocaleString("es-CL", { maximumFractionDigits: 1 })}`
                }
                style={{ 
                  fontSize: 10, 
                  fontWeight: 600,
                  fill: "hsl(var(--primary))"
                }}
              />
            </Line>
            
            {/* Regime rent reference line - only show if regime rent exists */}
            {showRegimeLine && (
              <ReferenceLine 
                y={(isUfM2Mode && superficieM2 > 0) ? regimeRent * superficieM2 : regimeRent} 
                stroke="hsl(var(--muted-foreground))" 
                strokeDasharray="5 5"
                label={{ value: "Régimen", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              />
            )}
            
            {/* Current month - green vertical line with clear label */}
            {currentMonth && (
              <ReferenceLine 
                x={currentMonth} 
                stroke="hsl(142 76% 36%)" 
                strokeWidth={2}
                label={{ 
                  value: "HOY", 
                  fontSize: 10, 
                  fontWeight: 700,
                  fill: "hsl(142 76% 36%)",
                  position: "insideTopRight"
                }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs border-t pt-2 mt-2">
        {currentMonth && effectiveDate && (
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-[hsl(142_76%_36%)]" />
            <span className="text-[hsl(142_76%_36%)] font-semibold">
              Hoy: {format(addMonths(new Date(effectiveDate), currentMonth - 1), "dd MMM yyyy", { locale: es })} (M{currentMonth})
            </span>
          </div>
        )}
        {noticeMonthInfo && 'month' in noticeMonthInfo && effectiveDate && (
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-destructive" style={{ borderStyle: 'dashed' }} />
            <span className="text-destructive font-medium">
              Límite aviso: {format(noticeMonthInfo.date, "dd MMM yyyy", { locale: es })}
            </span>
          </div>
        )}
        {noticeMonthInfo && 'ranges' in noticeMonthInfo && effectiveDate && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-2 bg-warning/20 border border-warning" />
              <span className="text-muted-foreground">Ventanas de término</span>
            </div>
            <div className="flex flex-wrap gap-2 ml-4">
              {noticeMonthInfo.ranges?.map((range, idx) => {
                const endDate = addMonths(new Date(effectiveDate), range.end_month - 1);
                return (
                  <span key={idx} className="text-destructive font-medium">
                    Venc. {idx + 1}: {format(endDate, "MMM yyyy", { locale: es })}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
