import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine, ReferenceArea, CartesianGrid } from "recharts";
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

  const { chartData, summaryPoints } = useMemo(() => {
    const sortedEscalations = [...escalations].sort((a, b) => a.month_number - b.month_number);
    const data: { month: number; rent: number; isGrace?: boolean; isAdjustment?: boolean }[] = [];
    const summary: { month: number; rent: number; isRegime: boolean }[] = [];
    
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
    
    // Determine the starting rent after grace period
    // NOTE: in this app, initialRent can be 0 when there are grace months; in that case,
    // we must fall back to regimeRent to match the edit visualization.
    const month1Escalation = sortedEscalations.find(e => e.month_number === firstPayingMonth);
    const startRent = month1Escalation?.amount || initialRent || regimeRent;
    rentChangePoints.set(firstPayingMonth, { rent: startRent });
    
    // Add escalation points
    sortedEscalations.forEach(e => {
      if (e.month_number > firstPayingMonth) {
        rentChangePoints.set(e.month_number, { rent: e.amount });
      }
    });
    
    // Add periodic adjustments
    if (hasPeriodicAdjustments && adjustmentValue > 0 && firstAdjustmentMonth > 0 && adjustmentPeriodicityMonths > 0) {
      let currentRent = regimeRent;
      let month = firstAdjustmentMonth;
      
      while (month <= durationMonths) {
        if (adjustmentType === "percentage") {
          currentRent = currentRent * (1 + adjustmentValue / 100);
        } else {
          currentRent = currentRent + adjustmentValue;
        }
        
        if (!rentChangePoints.has(month)) {
          rentChangePoints.set(month, { rent: currentRent, isAdjustment: true });
        }
        
        month += adjustmentPeriodicityMonths;
      }
    }
    
    // Convert map to sorted array of change points
    const changePointsSorted = Array.from(rentChangePoints.entries())
      .sort((a, b) => a[0] - b[0]);
    
    // Build data array with proper step visualization
    // For stepAfter to work correctly, we need the data points at change months
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
    
    // Build summary points - first few key points
    const sortedData = [...data].slice(0, 4);
    sortedData.forEach(d => {
      summary.push({ 
        month: d.month, 
        rent: d.rent, 
        isRegime: Math.abs(d.rent - regimeRent) < 0.01
      });
    });
    
    return { chartData: data, summaryPoints: summary };
  }, [escalations, initialRent, regimeRent, durationMonths, graceMonths, hasPeriodicAdjustments, adjustmentType, adjustmentValue, firstAdjustmentMonth, adjustmentPeriodicityMonths]);

  // Calculate notice month based on type
  const noticeMonthInfo = useMemo(() => {
    if (!effectiveDate) return null;
    
    const startDate = new Date(effectiveDate);
    
    if (noticeType === "meses" && noticeValue) {
      const noticeMonths = parseInt(noticeValue) || 0;
      const noticeMonth = durationMonths - noticeMonths;
      const noticeDate = addMonths(startDate, noticeMonth);
      return { month: noticeMonth, date: noticeDate, label: `${noticeValue} meses antes` };
    } else if (noticeType === "fecha" && noticeValue) {
      const noticeDate = new Date(noticeValue);
      const diffTime = noticeDate.getTime() - startDate.getTime();
      const noticeMonth = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30.44)) + 1;
      return { month: Math.max(1, Math.min(noticeMonth, durationMonths)), date: noticeDate, label: "fecha fija" };
    } else if (noticeType === "rangos" && noticeRanges.length > 0) {
      const sortedRanges = [...noticeRanges].sort((a, b) => a.start_month - b.start_month);
      return { ranges: sortedRanges };
    }
    return null;
  }, [effectiveDate, noticeType, noticeValue, noticeRanges, durationMonths]);

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
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => `M${v}`}
              scale="linear"
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
                key={idx}
                x1={range.start_month}
                x2={range.end_month}
                fill="hsl(var(--warning))"
                fillOpacity={0.2}
                stroke="hsl(var(--warning))"
                strokeDasharray="3 3"
              />
            ))}
            
            {/* Single notice line for meses/fecha type */}
            {noticeMonthInfo && 'month' in noticeMonthInfo && (
              <ReferenceLine 
                x={noticeMonthInfo.month} 
                stroke="hsl(var(--warning))" 
                strokeWidth={2}
                strokeDasharray="4 4"
                label={{ 
                  value: `Aviso`, 
                  fontSize: 10, 
                  fill: "hsl(var(--warning))",
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
            />
            
            {/* Regime rent reference line */}
            <ReferenceLine 
              y={regimeRent} 
              stroke="hsl(var(--muted-foreground))" 
              strokeDasharray="5 5"
              label={{ value: "Régimen", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            />
            
            {/* Current month red vertical line with month number */}
            {currentMonth && (
              <ReferenceLine 
                x={currentMonth} 
                stroke="hsl(var(--destructive))" 
                strokeWidth={2}
                label={{ 
                  value: `M${currentMonth}`, 
                  fontSize: 10, 
                  fill: "hsl(var(--destructive))",
                  position: "top"
                }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      {/* Summary text */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {currentMonth && (
          <span className="text-destructive font-medium">
            Mes actual: {currentMonth}
          </span>
        )}
        {noticeMonthInfo && 'month' in noticeMonthInfo && effectiveDate && (
          <span className="text-warning font-medium">
            Aviso: {format(noticeMonthInfo.date, "dd MMM yyyy", { locale: es })}
          </span>
        )}
        {noticeMonthInfo && 'ranges' in noticeMonthInfo && (
          <span className="text-warning font-medium">
            Avisos: {noticeMonthInfo.ranges?.map(r => `M${r.start_month}-${r.end_month}`).join(", ")}
          </span>
        )}
        {summaryPoints.slice(0, 3).map((point, idx) => (
          <span key={idx} className={point.isRegime ? "font-medium text-primary" : ""}>
            M{point.month}: {formatAmount(point.rent)}
            {point.isRegime && " (régimen)"}
          </span>
        ))}
      </div>
    </div>
  );
}
