import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine } from "recharts";

interface Escalation {
  month_number: number;
  amount: number;
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
}: CompactEscalationChartProps) {
  
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
    if (escalations.length === 0 && !hasPeriodicAdjustments) return { chartData: [], summaryPoints: [] };
    
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

  if (chartData.length === 0) return null;

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
      <div className="h-16 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
            <defs>
              <linearGradient id="rentGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <XAxis dataKey="month" hide />
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
            <Area 
              type="stepAfter" 
              dataKey="rent" 
              stroke="hsl(var(--primary))" 
              strokeWidth={1.5}
              fill="url(#rentGradient)" 
            />
            {/* Current month red vertical line */}
            {currentMonth && (
              <ReferenceLine 
                x={currentMonth} 
                stroke="hsl(var(--destructive))" 
                strokeWidth={2}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      
      {/* Summary text */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {summaryPoints.map((point, idx) => (
          <span key={idx} className={point.isRegime ? "font-medium text-primary" : ""}>
            Mes {point.month}: {formatUF(point.rent)} UF
            {point.isRegime && " (régimen)"}
          </span>
        ))}
      </div>
    </div>
  );
}