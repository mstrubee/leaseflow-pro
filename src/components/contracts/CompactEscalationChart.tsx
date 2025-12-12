import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

interface Escalation {
  month_number: number;
  amount: number;
}

interface CompactEscalationChartProps {
  escalations: Escalation[];
  initialRent?: number | null;
  regimeRent: number;
  durationMonths: number;
}

export function CompactEscalationChart({ 
  escalations, 
  initialRent, 
  regimeRent,
  durationMonths 
}: CompactEscalationChartProps) {
  const { chartData, summaryPoints } = useMemo(() => {
    if (escalations.length === 0) return { chartData: [], summaryPoints: [] };
    
    const sortedEscalations = [...escalations].sort((a, b) => a.month_number - b.month_number);
    const data: { month: number; rent: number }[] = [];
    const summary: { month: number; rent: number; isRegime: boolean }[] = [];
    
    // Build a map of escalations by month
    const escalationMap = new Map<number, number>();
    sortedEscalations.forEach(e => {
      escalationMap.set(e.month_number, e.amount);
    });
    
    // Determine the starting rent - use first escalation if month 1 exists, otherwise use initialRent
    let currentRent = escalationMap.has(1) 
      ? escalationMap.get(1)! 
      : (initialRent ?? regimeRent);
    
    // Track the actual first rent for summary
    const firstRent = currentRent;
    
    for (let month = 1; month <= durationMonths; month++) {
      // Check if there's an escalation for this month
      if (escalationMap.has(month) && month !== 1) {
        currentRent = escalationMap.get(month)!;
      }
      
      // Add to chart at key points
      if (month === 1 || 
          month === durationMonths || 
          escalationMap.has(month)) {
        data.push({ month, rent: currentRent });
      }
    }
    
    // Build summary points - month 1 first
    summary.push({ month: 1, rent: firstRent, isRegime: firstRent === regimeRent });
    
    // Add escalation months (excluding month 1 if already added)
    sortedEscalations.forEach(e => {
      if (e.month_number !== 1) {
        summary.push({ 
          month: e.month_number, 
          rent: e.amount, 
          isRegime: e.amount === regimeRent 
        });
      }
    });
    
    // Sort summary by month
    summary.sort((a, b) => a.month - b.month);
    
    return { chartData: data, summaryPoints: summary };
  }, [escalations, initialRent, regimeRent, durationMonths]);

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