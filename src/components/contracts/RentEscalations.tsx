import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
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
  graceMonths?: number;
  onGraceMonthsChange?: (months: number) => void;
  effectiveDate?: string;
  hasPeriodicAdjustments?: boolean;
  adjustmentType?: "percentage" | "fixed";
  adjustmentValue?: number;
  firstAdjustmentMonth?: number;
  adjustmentPeriodicityMonths?: number;
}

interface CustomDotProps {
  cx?: number;
  cy?: number;
  payload?: { month: number; rent: number; isEditable: boolean };
  onDotClick: (month: number, amount: number) => void;
}

const CustomDot = ({ cx, cy, payload, onDotClick }: CustomDotProps) => {
  if (!cx || !cy || !payload) return null;
  
  return (
    <circle
      cx={cx}
      cy={cy}
      r={payload.isEditable ? 8 : 4}
      fill={payload.isEditable ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}
      stroke="hsl(var(--background))"
      strokeWidth={2}
      style={{ cursor: payload.isEditable ? "pointer" : "default" }}
      onClick={() => {
        if (payload.isEditable) {
          onDotClick(payload.month, payload.rent);
        }
      }}
    />
  );
};

export const RentEscalations = ({
  escalations,
  onChange,
  initialRent,
  regimeRent,
  durationMonths,
  readOnly = false,
  currency = "UF",
  graceMonths = 0,
  onGraceMonthsChange,
  effectiveDate,
  hasPeriodicAdjustments = false,
  adjustmentType = "percentage",
  adjustmentValue = 0,
  firstAdjustmentMonth = 0,
  adjustmentPeriodicityMonths = 0,
}: RentEscalationsProps) => {
  const [newMonth, setNewMonth] = useState("");
  const [newAmount, setNewAmount] = useState("");
  
  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editMonth, setEditMonth] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState("");

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

    // Validate month is greater than grace months
    if (isNaN(month) || isNaN(amount) || month <= graceMonths || month > durationMonths) {
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
  
  // Calculate current month based on effective date
  const getCurrentMonth = (): number | null => {
    if (!effectiveDate) return null;
    const startDate = new Date(effectiveDate);
    const today = new Date();
    const diffTime = today.getTime() - startDate.getTime();
    const diffMonths = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30.44)) + 1;
    if (diffMonths >= 1 && diffMonths <= durationMonths) {
      return diffMonths;
    }
    return null;
  };
  
  const currentMonth = getCurrentMonth();

  const handleRemove = (monthNumber: number) => {
    onChange(escalations.filter((e) => e.month_number !== monthNumber));
  };

  const handleDotClick = (month: number, amount: number) => {
    if (readOnly) return;
    setEditMonth(month);
    setEditAmount(amount.toString());
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (editMonth === null) return;
    
    const amount = parseFloat(editAmount);
    if (isNaN(amount)) return;

    const newEscalations = escalations.map(e => 
      e.month_number === editMonth ? { ...e, amount } : e
    );
    
    onChange(newEscalations);
    setEditDialogOpen(false);
    setEditMonth(null);
    setEditAmount("");
  };

  // Generate chart data with real duration spacing including periodic adjustments
  const getChartData = () => {
    const data: { month: number; rent: number; isEditable: boolean; isGrace?: boolean; isAdjustment?: boolean }[] = [];
    const sortedEscalations = [...escalations].sort((a, b) => a.month_number - b.month_number);
    
    // Build a map of all rent changes
    const rentChanges = new Map<number, { rent: number; isEditable: boolean; isGrace?: boolean; isAdjustment?: boolean }>();
    
    // Add grace months at 0 rent
    if (graceMonths > 0) {
      rentChanges.set(1, { rent: 0, isEditable: false, isGrace: true });
      if (graceMonths > 1) {
        rentChanges.set(graceMonths, { rent: 0, isEditable: false, isGrace: true });
      }
    }
    
    // Start with initial rent at first paying month
    const firstPayingMonth = graceMonths + 1;
    const month1Escalation = sortedEscalations.find(e => e.month_number === firstPayingMonth);
    const startRent = month1Escalation?.amount || initialRent || regimeRent;
    rentChanges.set(firstPayingMonth, { rent: startRent, isEditable: !!month1Escalation });
    
    // Add all defined escalation points
    sortedEscalations.forEach((esc) => {
      if (esc.month_number > firstPayingMonth) {
        rentChanges.set(esc.month_number, { rent: esc.amount, isEditable: true });
      }
    });
    
    // Add periodic adjustments if enabled
    if (hasPeriodicAdjustments && adjustmentValue > 0 && firstAdjustmentMonth > 0 && adjustmentPeriodicityMonths > 0) {
      let currentRent = regimeRent;
      let month = firstAdjustmentMonth;
      
      while (month <= durationMonths) {
        // Calculate adjusted rent
        if (adjustmentType === "percentage") {
          currentRent = currentRent * (1 + adjustmentValue / 100);
        } else {
          currentRent = currentRent + adjustmentValue;
        }
        
        // Only add if not already defined by an escalation
        if (!rentChanges.has(month) || !rentChanges.get(month)?.isEditable) {
          rentChanges.set(month, { rent: currentRent, isEditable: false, isAdjustment: true });
        }
        
        month += adjustmentPeriodicityMonths;
      }
    }
    
    // Add final month if not already defined
    if (!rentChanges.has(durationMonths)) {
      // Get the last known rent
      const sortedMonths = Array.from(rentChanges.keys()).sort((a, b) => a - b);
      const lastRent = sortedMonths.length > 0 ? rentChanges.get(sortedMonths[sortedMonths.length - 1])?.rent || regimeRent : regimeRent;
      rentChanges.set(durationMonths, { rent: lastRent, isEditable: false });
    }
    
    // Convert to array and sort
    rentChanges.forEach((value, month) => {
      data.push({ month, ...value });
    });
    
    return data.sort((a, b) => a.month - b.month);
  };

  const chartData = getChartData();
  const sortedEscalations = [...escalations].sort((a, b) => a.month_number - b.month_number);

  // Only show chart if there are escalations or different initial/regime rents
  const showChart = sortedEscalations.length > 0 || initialRent !== regimeRent;

  // Calculate domain for X axis to show real proportions
  const xDomain = [1, durationMonths];

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

      {/* Grace months */}
      {!readOnly && onGraceMonthsChange && (
        <div className="space-y-2 pb-4 border-b border-border">
          <Label className="text-sm font-medium">Meses de gracia (sin pago)</Label>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={0}
              max={durationMonths - 1}
              value={graceMonths || ''}
              onChange={(e) => onGraceMonthsChange(parseInt(e.target.value) || 0)}
              className="w-24"
              placeholder="0"
            />
            <span className="text-sm text-muted-foreground">meses al inicio sin pago de arriendo</span>
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
                min={graceMonths + 1}
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
            {graceMonths > 0 
              ? `Los primeros ${graceMonths} meses son de gracia. El mes ${graceMonths + 1} es el primer mes con pago.`
              : "Mes 1 corresponde al canon inicial. Indica desde qué mes cambia el canon."
            }
          </p>
        </div>
      )}

      {/* Rent trend chart with real duration spacing */}
      {showChart && (
        <div className="pt-4 border-t border-border">
          <Label className="text-sm font-medium mb-2 block">
            Tendencia de arriendo
            {!readOnly && <span className="text-xs text-muted-foreground ml-2">(clic en los puntos para editar)</span>}
          </Label>
          <div className="h-48 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
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
                  tickFormatter={(v) => currency === "UF" ? `${v}` : `${(v/1000000).toFixed(1)}M`}
                />
                <Tooltip 
                  formatter={(value: number, name: string, props: any) => {
                    const point = props.payload;
                    let label = "Canon";
                    if (point?.isGrace) label = "Gracia";
                    if (point?.isAdjustment) label = "Reajuste";
                    return [formatCurrency(value), label];
                  }}
                  labelFormatter={(label) => `Mes ${label}`}
                />
                <Line 
                  type="stepAfter" 
                  dataKey="rent" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  dot={(props) => (
                    <CustomDot 
                      {...props} 
                      onDotClick={handleDotClick}
                    />
                  )}
                  activeDot={{ r: 6, fill: "hsl(var(--primary))" }}
                />
                <ReferenceLine 
                  y={regimeRent} 
                  stroke="hsl(var(--muted-foreground))" 
                  strokeDasharray="5 5"
                  label={{ value: "Régimen", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                />
                {/* Current month red vertical line */}
                {currentMonth && (
                  <ReferenceLine 
                    x={currentMonth} 
                    stroke="hsl(var(--destructive))" 
                    strokeWidth={2}
                    label={{ 
                      value: "Hoy", 
                      fontSize: 10, 
                      fill: "hsl(var(--destructive))",
                      position: "top"
                    }}
                  />
                )}
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

      {/* Edit dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Escalón - Mes {editMonth}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editAmount">Nuevo Monto ({currency})</Label>
              <Input
                id="editAmount"
                type="number"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                step={currency === "UF" ? "0.01" : "1"}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
