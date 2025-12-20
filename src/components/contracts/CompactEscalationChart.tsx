import { useMemo, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine, ReferenceArea } from "recharts";
import { Button } from "@/components/ui/button";
import { Bell, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { addMonths, format } from "date-fns";
import { es } from "date-fns/locale";

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
  contractId?: string;
  contractName?: string;
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
  contractId,
  contractName,
}: CompactEscalationChartProps) {
  const { toast } = useToast();
  const [creatingAlert, setCreatingAlert] = useState(false);
  
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
    const data: { month: number; rent: number }[] = [];
    const summary: { month: number; rent: number; isRegime: boolean; isAdjustment?: boolean }[] = [];
    
    // Build a map of all rent changes
    const rentChanges = new Map<number, number>();
    
    // Add grace months at 0 rent
    if (graceMonths > 0) {
      rentChanges.set(1, 0);
    }
    
    // Determine the starting rent
    const firstPayingMonth = graceMonths + 1;
    const month1Escalation = sortedEscalations.find(e => e.month_number === firstPayingMonth);
    const startRent = month1Escalation?.amount || (initialRent ?? regimeRent);
    rentChanges.set(firstPayingMonth, startRent);
    
    // Add escalation points
    sortedEscalations.forEach(e => {
      if (e.month_number > firstPayingMonth) {
        rentChanges.set(e.month_number, e.amount);
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
        
        if (!rentChanges.has(month)) {
          rentChanges.set(month, currentRent);
        }
        
        month += adjustmentPeriodicityMonths;
      }
    }
    
    // Add final month if needed
    if (!rentChanges.has(durationMonths)) {
      const sortedMonths = Array.from(rentChanges.keys()).sort((a, b) => a - b);
      const lastRent = sortedMonths.length > 0 ? rentChanges.get(sortedMonths[sortedMonths.length - 1]) || regimeRent : regimeRent;
      rentChanges.set(durationMonths, lastRent);
    }
    
    // Convert to arrays
    rentChanges.forEach((rent, month) => {
      data.push({ month, rent });
    });
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

  // Show chart even with minimal data (just regime rent)
  if (chartData.length === 0) {
    // Create minimal chart data
    const minimalData = [
      { month: 1, rent: regimeRent },
      { month: durationMonths, rent: regimeRent }
    ];
    return (
      <div className="space-y-2">
        <div className="h-20 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={minimalData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
              <defs>
                <linearGradient id="rentGradientMin" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={(v) => `M${v}`} />
              <YAxis hide />
              <Area 
                type="stepAfter" 
                dataKey="rent" 
                stroke="hsl(var(--primary))" 
                strokeWidth={1.5}
                fill="url(#rentGradientMin)" 
              />
              {currentMonth && (
                <ReferenceLine 
                  x={currentMonth} 
                  stroke="hsl(var(--destructive))" 
                  strokeWidth={2}
                  label={{ value: `M${currentMonth}`, fontSize: 9, fill: "hsl(var(--destructive))", position: "top" }}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {currentMonth && (
          <div className="text-xs text-muted-foreground">
            <span className="text-destructive font-medium">Mes actual: {currentMonth}</span>
          </div>
        )}
      </div>
    );
  }

  const formatUF = (value: number) => {
    return `${value.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  };

  // Calculate the min value for Y axis (avoid 0 flattening issue)
  const minRent = Math.min(...chartData.map(d => d.rent));
  const maxRent = Math.max(...chartData.map(d => d.rent));
  const yMin = Math.max(0, minRent - (maxRent - minRent) * 0.1);
  const yMax = maxRent + (maxRent - minRent) * 0.1;

  return (
    <div className="space-y-2">
      <div className="h-24 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 16 }}>
            <defs>
              <linearGradient id="rentGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <XAxis 
              dataKey="month" 
              tick={{ fontSize: 9 }} 
              tickFormatter={(v) => `${v}`}
              interval="preserveStartEnd"
            />
            <YAxis hide domain={[yMin, yMax]} />
            <Tooltip 
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-popover border border-border rounded px-2 py-1 text-xs shadow-md">
                      <span className="text-muted-foreground">Mes {payload[0].payload.month}:</span>{" "}
                      <span className="font-semibold">{formatUF(payload[0].value as number)} UF</span>
                    </div>
                  );
                }
                return null;
              }}
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
                  fontSize: 9, 
                  fill: "hsl(var(--warning))",
                  position: "insideTopRight"
                }}
              />
            )}
            
            <Area 
              type="stepAfter" 
              dataKey="rent" 
              stroke="hsl(var(--primary))" 
              strokeWidth={1.5}
              fill="url(#rentGradient)" 
            />
            {/* Current month red vertical line with month number */}
            {currentMonth && (
              <ReferenceLine 
                x={currentMonth} 
                stroke="hsl(var(--destructive))" 
                strokeWidth={2}
                label={{ 
                  value: `M${currentMonth}`, 
                  fontSize: 9, 
                  fill: "hsl(var(--destructive))",
                  position: "top"
                }}
              />
            )}
          </AreaChart>
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
            M{point.month}: {formatUF(point.rent)} UF
            {point.isRegime && " (régimen)"}
          </span>
        ))}
      </div>
    </div>
  );
}