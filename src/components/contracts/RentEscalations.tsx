import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, TrendingUp } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

export interface Escalation {
  id?: string;
  month_number: number;
  amount: number;
}

interface RentEscalationsProps {
  escalations: Escalation[];
  onChange: (escalations: Escalation[]) => void;
  initialRent: number;
  regimeRent: number;
  durationMonths: number;
  readOnly?: boolean;
  currency?: "UF" | "CLP";
}

export const RentEscalations = ({
  escalations,
  onChange,
  initialRent,
  regimeRent,
  durationMonths,
  readOnly = false,
  currency = "UF",
}: RentEscalationsProps) => {
  const [newMonth, setNewMonth] = useState("");
  const [newAmount, setNewAmount] = useState("");

  const formatCurrency = (amount: number) => {
    if (currency === "UF") {
      return `UF ${amount.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
    }).format(amount);
  };

  const handleAdd = () => {
    const month = parseInt(newMonth);
    const amount = parseFloat(newAmount);

    if (isNaN(month) || isNaN(amount) || month < 1 || month > durationMonths) {
      return;
    }

    // Check if month already exists
    if (escalations.some((e) => e.month_number === month)) {
      return;
    }

    const newEscalations = [...escalations, { month_number: month, amount }]
      .sort((a, b) => a.month_number - b.month_number);
    
    onChange(newEscalations);
    setNewMonth("");
    setNewAmount("");
  };

  const handleRemove = (monthNumber: number) => {
    onChange(escalations.filter((e) => e.month_number !== monthNumber));
  };

  // Generate chart data for entire contract period
  const getChartData = () => {
    const data: { month: number; rent: number; label: string }[] = [];
    
    // Start with initial rent at month 1
    let currentRent = initialRent || regimeRent;
    
    // Sort escalations
    const sortedEscalations = [...escalations].sort((a, b) => a.month_number - b.month_number);
    
    // Month 1 is always the first escalation (initial rent)
    data.push({ month: 1, rent: currentRent, label: `Mes 1` });
    
    // Add escalation points
    sortedEscalations.forEach((esc) => {
      if (esc.month_number > 1) {
        data.push({ month: esc.month_number, rent: esc.amount, label: `Mes ${esc.month_number}` });
        currentRent = esc.amount;
      }
    });
    
    // Add final month with regime rent if different
    if (durationMonths > 1) {
      const lastEscMonth = sortedEscalations.length > 0 
        ? Math.max(...sortedEscalations.map(e => e.month_number))
        : 1;
      
      if (lastEscMonth < durationMonths) {
        data.push({ month: durationMonths, rent: regimeRent, label: `Mes ${durationMonths}` });
      }
    }

    return data;
  };

  const chartData = getChartData();
  const sortedEscalations = [...escalations].sort((a, b) => a.month_number - b.month_number);

  // Only show chart if there are escalations or different initial/regime rents
  const showChart = sortedEscalations.length > 0 || initialRent !== regimeRent;

  return (
    <div className="space-y-4">
      {/* Current escalations */}
      {sortedEscalations.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Escalones definidos</Label>
          <div className="space-y-2">
            {sortedEscalations.map((escalation, idx) => (
              <div
                key={escalation.month_number}
                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-border"
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">
                    {idx + 1}
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Mes </span>
                    <span className="font-semibold">{escalation.month_number}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Canon: </span>
                    <span className="font-semibold text-primary">
                      {formatCurrency(escalation.amount)}
                    </span>
                  </div>
                </div>
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemove(escalation.month_number)}
                    className="h-8 w-8 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add new escalation */}
      {!readOnly && (
        <div className="space-y-3 pt-2">
          <Label className="text-sm font-medium">Agregar escalón</Label>
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                type="number"
                placeholder="Mes"
                value={newMonth}
                onChange={(e) => setNewMonth(e.target.value)}
                min={1}
                max={durationMonths}
              />
            </div>
            <div className="flex-1">
              <Input
                type="number"
                placeholder={currency === "UF" ? "Monto (UF)" : "Monto (CLP)"}
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                min={0}
                step={currency === "UF" ? "0.01" : "1"}
              />
            </div>
            <Button
              type="button"
              onClick={handleAdd}
              disabled={!newMonth || !newAmount}
              size="icon"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Mes 1 corresponde al canon inicial. Indica desde qué mes cambia el canon.
          </p>
        </div>
      )}

      {/* Rent trend chart */}
      {showChart && (
        <div className="pt-4 border-t border-border">
          <Label className="text-sm font-medium mb-2 block">Tendencia de arriendo</Label>
          <div className="h-48 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="month" 
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `M${v}`}
                />
                <YAxis 
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => currency === "UF" ? `${v}` : `${(v/1000000).toFixed(1)}M`}
                />
                <Tooltip 
                  formatter={(value: number) => [formatCurrency(value), "Canon"]}
                  labelFormatter={(label) => `Mes ${label}`}
                />
                <Line 
                  type="stepAfter" 
                  dataKey="rent" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  dot={{ fill: "hsl(var(--primary))", strokeWidth: 2, r: 4 }}
                />
                <ReferenceLine 
                  y={regimeRent} 
                  stroke="hsl(var(--muted-foreground))" 
                  strokeDasharray="5 5"
                  label={{ value: "Régimen", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
        <div>
          <p className="text-sm text-muted-foreground">Canon Inicial</p>
          <p className="text-lg font-semibold">{formatCurrency(initialRent || regimeRent)}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Canon en Régimen</p>
          <p className="text-lg font-semibold">{formatCurrency(regimeRent)}</p>
        </div>
      </div>
    </div>
  );
};
