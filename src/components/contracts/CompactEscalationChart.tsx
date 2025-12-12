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
  const chartData = useMemo(() => {
    if (escalations.length === 0) return [];
    
    const sortedEscalations = [...escalations].sort((a, b) => a.month_number - b.month_number);
    const data: { month: number; rent: number }[] = [];
    
    // Start with initial rent or regime rent
    const startRent = initialRent || regimeRent;
    let currentRent = startRent;
    let escIdx = 0;
    
    for (let month = 1; month <= durationMonths; month++) {
      // Check if there's an escalation for this month
      if (escIdx < sortedEscalations.length && sortedEscalations[escIdx].month_number === month) {
        currentRent = sortedEscalations[escIdx].amount;
        escIdx++;
      }
      
      // Add key points only
      if (month === 1 || 
          month === durationMonths || 
          (escIdx > 0 && sortedEscalations[escIdx - 1]?.month_number === month)) {
        data.push({ month, rent: currentRent });
      }
    }
    
    return data;
  }, [escalations, initialRent, regimeRent, durationMonths]);

  if (chartData.length === 0) return null;

  const formatUF = (value: number) => {
    return `${value.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  return (
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
          <YAxis hide domain={['dataMin - 10', 'dataMax + 10']} />
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
  );
}
