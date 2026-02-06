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

// Notice deadline: calculated as end_month - months_before for each range
interface NoticeDeadline {
  rangeIndex: number;
  rangeStart: number;
  rangeEnd: number;
  monthsBefore: number;
  deadlineMonth: number; // rangeEnd - monthsBefore
  bilaterality?: "unilateral_gp" | "unilateral_arrendador" | "bilateral";
}

interface TerminationNoticeForChart {
  id: string;
  notice_type: string; // "sent" | "received"
  notice_date: string;
  required_exit_date: string | null;
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
  // Notice deadlines for ranges (calculated as range.end_month - months_before)
  noticeDeadlines?: NoticeDeadline[];
  // Contract end notice (for sin_termino type)
  contractEndNoticeMonths?: number;
  // Auto-renewal info
  autoRenewal?: boolean;
  autoRenewalMonths?: number;
  terminationNotices?: TerminationNoticeForChart[];
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
  noticeDeadlines = [],
  contractEndNoticeMonths = 0,
  autoRenewal = false,
  autoRenewalMonths = 0,
  terminationNotices = [],
}: CompactEscalationChartProps) {
  const { ufValue } = useEconomicIndicators();
  
  // Calculate auto-renewal status
  const autoRenewalInfo = useMemo(() => {
    if (!effectiveDate || !autoRenewal || autoRenewalMonths <= 0) return null;
    
    const startDate = new Date(effectiveDate);
    const originalEndDate = addMonths(startDate, durationMonths);
    const today = new Date();
    
    if (today > originalEndDate) {
      const monthsPastOriginalEnd = Math.floor(
        (today.getTime() - originalEndDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
      );
      const currentRenewalNumber = Math.floor(monthsPastOriginalEnd / autoRenewalMonths) + 1;
      const currentRenewalEndDate = addMonths(originalEndDate, currentRenewalNumber * autoRenewalMonths);
      
      return {
        isInAutoRenewal: true,
        originalEndMonth: durationMonths,
        currentRenewalNumber,
        currentRenewalEndDate,
        extendedDurationMonths: durationMonths + (currentRenewalNumber * autoRenewalMonths)
      };
    }
    
    return null;
  }, [effectiveDate, durationMonths, autoRenewal, autoRenewalMonths]);
  
  // Effective duration considering auto-renewal
  const effectiveDurationMonths = autoRenewalInfo?.extendedDurationMonths || durationMonths;
  
  // Calculate current month based on effective date - extend to include auto-renewal period
  const currentMonth = useMemo(() => {
    if (!effectiveDate) return null;
    const startDate = new Date(effectiveDate);
    const today = new Date();
    const diffTime = today.getTime() - startDate.getTime();
    const diffMonths = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30.44)) + 1;
    // Allow current month to extend into auto-renewal period
    if (diffMonths >= 1 && diffMonths <= effectiveDurationMonths) {
      return diffMonths;
    }
    return null;
  }, [effectiveDate, effectiveDurationMonths]);

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
    // Use effectiveDurationMonths to include auto-renewal period
    const finalMonth = autoRenewalInfo ? effectiveDurationMonths : durationMonths;
    if (!rentChangePoints.has(finalMonth)) {
      const lastChange = changePointsSorted[changePointsSorted.length - 1];
      if (lastChange) {
        data.push({ month: finalMonth, rent: lastChange[1].rent });
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
  }, [escalations, initialRent, regimeRent, durationMonths, graceMonths, hasPeriodicAdjustments, adjustmentType, adjustmentValue, firstAdjustmentMonth, adjustmentPeriodicityMonths, isUfM2Mode, superficieM2, autoRenewalInfo, effectiveDurationMonths]);

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

  // Compute termination notice positions on chart
  const terminationNoticeMarkers = useMemo(() => {
    if (!effectiveDate || terminationNotices.length === 0) return [];
    const startDate = new Date(effectiveDate);
    return terminationNotices.map(notice => {
      const noticeDate = new Date(notice.notice_date);
      const diffTime = noticeDate.getTime() - startDate.getTime();
      const noticeMonth = Math.max(1, Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30.44)) + 1);
      
      let exitMonth: number | null = null;
      if (notice.required_exit_date) {
        const exitDate = new Date(notice.required_exit_date);
        const exitDiff = exitDate.getTime() - startDate.getTime();
        exitMonth = Math.max(1, Math.floor(exitDiff / (1000 * 60 * 60 * 24 * 30.44)) + 1);
      }
      
      return {
        id: notice.id,
        type: notice.notice_type, // "sent" | "received"
        noticeMonth,
        exitMonth,
        noticeDate: notice.notice_date,
        exitDate: notice.required_exit_date,
      };
    });
  }, [effectiveDate, terminationNotices]);

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
    { month: effectiveDurationMonths, rent: regimeRent }
  ];

  // Calculate domain - extend to include auto-renewal period if active
  const xDomain: [number, number] = [1, effectiveDurationMonths];

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
                    ? `Salida desde M${range.start_month}`
                    : noticeMonthInfo.ranges && noticeMonthInfo.ranges.length > 1 
                      ? `Rango ${idx + 1}` 
                      : "Rango Salida",
                  fontSize: 12,
                  fontWeight: 600,
                  fill: "hsl(var(--warning))",
                  position: "center"
                }}
              />
            ))}
            {/* Vertical lines at range boundaries - end of range as vencimiento */}
            {noticeMonthInfo && 'ranges' in noticeMonthInfo && noticeMonthInfo.ranges?.map((range, idx) => (
              <ReferenceLine
                key={`end-${idx}`}
                x={range.end_month}
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            ))}
            
            {/* Notice deadline lines - calculated from noticeDeadlines prop */}
            {noticeDeadlines.length > 0 && noticeDeadlines.map((deadline, idx) => {
              const deadlineDateStr = effectiveDate 
                ? format(addMonths(new Date(effectiveDate), deadline.deadlineMonth - 1), "dd MMM yy", { locale: es })
                : `M${deadline.deadlineMonth}`;
              
              // Use red for "unilateral_arrendador", destructive for others
              const isArrendador = deadline.bilaterality === "unilateral_arrendador";
              const strokeColor = isArrendador ? "#dc2626" : "hsl(var(--destructive))";
              const labelText = isArrendador 
                ? `Tope Arrendador: ${deadlineDateStr}` 
                : `Tope Aviso: ${deadlineDateStr}`;
              
              return (
                <ReferenceLine
                  key={`deadline-${idx}`}
                  x={deadline.deadlineMonth}
                  stroke={strokeColor}
                  strokeWidth={isArrendador ? 3 : 2}
                  strokeDasharray={isArrendador ? "4 2" : "6 3"}
                  label={{
                    value: labelText,
                    fontSize: 9,
                    fontWeight: 600,
                    fill: strokeColor,
                    position: "insideTopLeft"
                  }}
                />
              );
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
            
            {/* Original contract end - orange dashed line when in auto-renewal */}
            {autoRenewalInfo?.isInAutoRenewal && effectiveDate && (
              <ReferenceLine 
                x={durationMonths} 
                stroke="hsl(var(--warning))" 
                strokeWidth={2}
                strokeDasharray="6 4"
                label={{ 
                  value: `Término Original M${durationMonths}`, 
                  fontSize: 9, 
                  fontWeight: 600,
                  fill: "hsl(var(--warning))",
                  position: "insideTopLeft"
                }}
              />
            )}
            
            {/* Auto-renewal period shaded area */}
            {autoRenewalInfo?.isInAutoRenewal && (
              <ReferenceArea
                x1={durationMonths}
                x2={effectiveDurationMonths}
                fill="hsl(var(--warning))"
                fillOpacity={0.1}
                stroke="none"
              />
            )}
            
            {/* Current month - green vertical line with clear label */}
            {currentMonth && (
              <ReferenceLine 
                x={currentMonth} 
                stroke="hsl(142 76% 36%)" 
                strokeWidth={2}
                label={{ 
                  value: autoRenewalInfo?.isInAutoRenewal ? `HOY (Ren. #${autoRenewalInfo.currentRenewalNumber})` : "HOY", 
                  fontSize: 10, 
                  fontWeight: 700,
                  fill: "hsl(142 76% 36%)",
                  position: "insideTopRight"
                }}
              />
            )}
            
            {/* Termination notices - sent/received */}
            {terminationNoticeMarkers.map((marker) => {
              const isSent = marker.type === "sent";
              const markerColor = isSent ? "hsl(262 83% 58%)" : "hsl(25 95% 53%)";
              const typeLabel = isSent ? "Enviado" : "Recibido";
              const noticeDateStr = format(new Date(marker.noticeDate), "dd MMM yy", { locale: es });
              
              return [
                // Notice date line
                <ReferenceLine
                  key={`tn-notice-${marker.id}`}
                  x={marker.noticeMonth}
                  stroke={markerColor}
                  strokeWidth={2}
                  strokeDasharray="3 3"
                  label={{
                    value: `${isSent ? "✉" : "📩"} ${typeLabel}: ${noticeDateStr}`,
                    fontSize: 9,
                    fontWeight: 600,
                    fill: markerColor,
                    position: "insideBottomLeft"
                  }}
                />,
                // Expected exit date line (if exists)
                marker.exitMonth && marker.exitDate ? (
                  <ReferenceLine
                    key={`tn-exit-${marker.id}`}
                    x={marker.exitMonth}
                    stroke={markerColor}
                    strokeWidth={3}
                    strokeDasharray="8 4"
                    label={{
                      value: `Salida Esperada: ${format(new Date(marker.exitDate), "dd MMM yy", { locale: es })}`,
                      fontSize: 9,
                      fontWeight: 700,
                      fill: markerColor,
                      position: "insideTopLeft"
                    }}
                  />
                ) : null,
                // Shaded area between notice and exit
                marker.exitMonth ? (
                  <ReferenceArea
                    key={`tn-area-${marker.id}`}
                    x1={marker.noticeMonth}
                    x2={marker.exitMonth}
                    fill={markerColor}
                    fillOpacity={0.08}
                    stroke="none"
                  />
                ) : null,
              ];
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs border-t pt-2 mt-2">
        {/* Auto-renewal indicator */}
        {autoRenewalInfo?.isInAutoRenewal && effectiveDate && (
          <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            <div className="w-3 h-2 bg-warning/20 border border-warning" />
            <span className="text-amber-800 font-semibold">
              Renovación #{autoRenewalInfo.currentRenewalNumber} - hasta {format(autoRenewalInfo.currentRenewalEndDate, "dd MMM yyyy", { locale: es })}
            </span>
          </div>
        )}
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
              <span className="text-muted-foreground">Rango de salida (término anticipado)</span>
            </div>
            {noticeDeadlines.length > 0 && (
              <div className="flex flex-wrap gap-3 ml-4">
                {noticeDeadlines.map((deadline, idx) => {
                  const deadlineDate = addMonths(new Date(effectiveDate), deadline.deadlineMonth - 1);
                  const rangeEndDate = addMonths(new Date(effectiveDate), deadline.rangeEnd - 1);
                  const isArrendador = deadline.bilaterality === "unilateral_arrendador";
                  return (
                    <div key={idx} className="text-xs">
                      <span className={isArrendador ? "text-[#dc2626] font-bold" : "text-destructive font-semibold"}>
                        {isArrendador ? "Tope aviso (Arrendador)" : "Tope aviso término anticipado"}: {format(deadlineDate, "dd MMM yyyy", { locale: es })}
                      </span>
                      <span className="text-muted-foreground ml-1">
                        ({deadline.monthsBefore}m antes del fin de rango: {format(rangeEndDate, "dd MMM yyyy", { locale: es })})
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {/* Termination notices legend */}
        {terminationNoticeMarkers.length > 0 && effectiveDate && (
          <div className="flex flex-col gap-1 mt-1">
            {terminationNoticeMarkers.map((marker) => {
              const isSent = marker.type === "sent";
              return (
                <div key={marker.id} className="flex items-center gap-1.5">
                  <span className="text-sm">{isSent ? "✉️" : "📩"}</span>
                  <span className="font-semibold" style={{ color: isSent ? "hsl(262 83% 58%)" : "hsl(25 95% 53%)" }}>
                    Aviso {isSent ? "Enviado" : "Recibido"}: {format(new Date(marker.noticeDate), "dd MMM yyyy", { locale: es })}
                  </span>
                  {marker.exitDate && (
                    <span className="text-muted-foreground">
                      → Salida esperada: {format(new Date(marker.exitDate), "dd MMM yyyy", { locale: es })}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
