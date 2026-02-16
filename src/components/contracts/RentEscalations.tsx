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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Plus, Trash2, ChevronDown } from "lucide-react";
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

type DurationUnit = "months" | "years";

// Grace months input component with month/year selector
export const GraceMonthsInput = ({
  value,
  onChange,
  maxMonths,
}: {
  value: number;
  onChange: (months: number) => void;
  maxMonths: number;
}) => {
  const [unit, setUnit] = useState<DurationUnit>("months");
  
  const displayValue = unit === "years" ? (value / 12).toString() : value.toString();
  
  const handleValueChange = (newValue: string) => {
    const numValue = parseFloat(newValue) || 0;
    const months = unit === "years" ? Math.round(numValue * 12) : Math.round(numValue);
    onChange(Math.min(months, maxMonths));
  };

  const handleUnitChange = (newUnit: DurationUnit) => {
    setUnit(newUnit);
  };

  const equivalentText = (() => {
    if (value === 0) return null;
    if (unit === "months" && value >= 12) {
      const years = Math.floor(value / 12);
      const remainingMonths = value % 12;
      if (remainingMonths === 0) {
        return `= ${years} ${years === 1 ? "año" : "años"}`;
      }
      return `= ${years} ${years === 1 ? "año" : "años"} y ${remainingMonths} ${remainingMonths === 1 ? "mes" : "meses"}`;
    } else if (unit === "years") {
      return `= ${value} ${value === 1 ? "mes" : "meses"}`;
    }
    return null;
  })();

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={0}
          max={unit === "years" ? maxMonths / 12 : maxMonths}
          step={unit === "years" ? "0.5" : "1"}
          value={value === 0 ? "" : displayValue}
          onChange={(e) => handleValueChange(e.target.value)}
          className="w-24"
          placeholder="0"
        />
        <Select value={unit} onValueChange={(v) => handleUnitChange(v as DurationUnit)}>
          <SelectTrigger className="w-[90px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="months">Meses</SelectItem>
            <SelectItem value="years">Años</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">al inicio sin pago de arriendo</span>
      </div>
      {equivalentText && (
        <p className="text-xs text-primary font-medium">{equivalentText}</p>
      )}
    </div>
  );
};

// Escalation month input component with month/year selector
const EscalationMonthInput = ({
  startMonth,
  endMonth,
  amount,
  onStartMonthChange,
  onEndMonthChange,
  onAmountChange,
  onAdd,
  graceMonths,
  durationMonths,
  currency,
  isUfM2,
  onUfM2Change,
  superficieM2,
  showUfM2Toggle,
}: {
  startMonth: string;
  endMonth: string;
  amount: string;
  onStartMonthChange: (value: string) => void;
  onEndMonthChange: (value: string) => void;
  onAmountChange: (value: string) => void;
  onAdd: () => void;
  graceMonths: number;
  durationMonths: number;
  currency: "UF" | "CLP";
  isUfM2: boolean;
  onUfM2Change: (value: boolean) => void;
  superficieM2: number;
  showUfM2Toggle: boolean;
}) => {
  const [startUnit, setStartUnit] = useState<DurationUnit>("months");
  const [endUnit, setEndUnit] = useState<DurationUnit>("months");

  const handleStartChange = (value: string) => {
    const numValue = parseFloat(value) || 0;
    const months = startUnit === "years" ? Math.round(numValue * 12) : Math.round(numValue);
    onStartMonthChange(months.toString());
  };

  const handleEndChange = (value: string) => {
    const numValue = parseFloat(value) || 0;
    const months = endUnit === "years" ? Math.round(numValue * 12) : Math.round(numValue);
    onEndMonthChange(months.toString());
  };

  const startDisplayValue = startMonth 
    ? (startUnit === "years" ? (parseInt(startMonth) / 12).toString() : startMonth)
    : "";
  const endDisplayValue = endMonth 
    ? (endUnit === "years" ? (parseInt(endMonth) / 12).toString() : endMonth)
    : "";

  const startMonthNum = parseInt(startMonth) || 0;
  const endMonthNum = parseInt(endMonth) || 0;
  const numericAmount = parseFloat(amount) || 0;

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-end flex-wrap">
        <div className="flex-1 min-w-[140px]">
          <Label className="text-xs text-muted-foreground">Mes Inicio</Label>
          <div className="flex gap-1">
            <Input
              type="number"
              placeholder={startUnit === "years" ? "Año" : "Mes"}
              value={startDisplayValue}
              onChange={(e) => handleStartChange(e.target.value)}
              min={startUnit === "years" ? (graceMonths + 1) / 12 : graceMonths + 1}
              max={startUnit === "years" ? durationMonths / 12 : durationMonths}
              step={startUnit === "years" ? "0.5" : "1"}
              className="flex-1"
            />
            <Select value={startUnit} onValueChange={(v) => setStartUnit(v as DurationUnit)}>
              <SelectTrigger className="w-[70px] px-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="months">Mes</SelectItem>
                <SelectItem value="years">Año</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {startUnit === "years" && startMonthNum > 0 && (
            <p className="text-[10px] text-primary mt-0.5">= mes {startMonthNum}</p>
          )}
        </div>
        <div className="flex-1 min-w-[140px]">
          <Label className="text-xs text-muted-foreground">Mes Fin</Label>
          <div className="flex gap-1">
            <Input
              type="number"
              placeholder={endUnit === "years" ? "Año" : "Mes"}
              value={endDisplayValue}
              onChange={(e) => handleEndChange(e.target.value)}
              min={endUnit === "years" ? (parseInt(startMonth) || graceMonths + 1) / 12 : (parseInt(startMonth) || graceMonths + 1)}
              max={endUnit === "years" ? durationMonths / 12 : durationMonths}
              step={endUnit === "years" ? "0.5" : "1"}
              className="flex-1"
            />
            <Select value={endUnit} onValueChange={(v) => setEndUnit(v as DurationUnit)}>
              <SelectTrigger className="w-[70px] px-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="months">Mes</SelectItem>
                <SelectItem value="years">Año</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {endUnit === "years" && endMonthNum > 0 && (
            <p className="text-[10px] text-primary mt-0.5">= mes {endMonthNum}</p>
          )}
        </div>
        <div className="flex-1 min-w-[100px]">
          <Label className="text-xs text-muted-foreground">Monto</Label>
          <div className="flex gap-1 items-center">
            <Input
              type="number"
              placeholder={isUfM2 ? "UF/m²" : (currency === "UF" ? "UF" : "CLP")}
              value={amount}
              onChange={(e) => onAmountChange(e.target.value)}
              min={0}
              step="0.001"
            />
            {showUfM2Toggle && superficieM2 > 0 && (
              <Select value={isUfM2 ? "uf_m2" : "fixed"} onValueChange={(v) => onUfM2Change(v === "uf_m2")}>
                <SelectTrigger className="w-[80px] px-2 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fijo</SelectItem>
                  <SelectItem value="uf_m2">UF/m²</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          {isUfM2 && superficieM2 > 0 && numericAmount > 0 && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Total: {(numericAmount * superficieM2).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF
            </p>
          )}
        </div>
        <Button
          type="button"
          onClick={onAdd}
          disabled={!startMonth || !amount}
          size="icon"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export interface Escalation {
  id?: string;
  month_number: number;
  end_month?: number;
  amount: number;
  is_uf_m2?: boolean;
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
  isUfM2Mode?: boolean;
  superficieM2?: number;
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
  isUfM2Mode = false,
  superficieM2 = 0,
}: RentEscalationsProps) => {
  const [newStartMonth, setNewStartMonth] = useState("");
  const [newEndMonth, setNewEndMonth] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newIsUfM2, setNewIsUfM2] = useState(false);
  
  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editStartMonth, setEditStartMonth] = useState<number | null>(null);
  const [editEndMonth, setEditEndMonth] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState("");

  // Format currency: UF values with 2 decimals, UF/m² values with 3 decimals
  const formatCurrency = (amount: number, forceUfM2: boolean = false) => {
    if (currency === "UF") {
      const decimals = forceUfM2 ? 3 : 2;
      const suffix = forceUfM2 ? " UF/m²" : " UF";
      return `${amount.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: decimals })}${suffix}`;
    }
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
    }).format(amount);
  };

  // Format for chart tooltip - always show total values (already converted from UF/m²)
  const formatChartValue = (amount: number) => {
    if (currency === "UF") {
      return `${amount.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF`;
    }
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
    }).format(amount);
  };

  // Format total for display in escalation list
  const formatTotal = (amount: number, escIsUfM2: boolean) => {
    if (escIsUfM2 && superficieM2 > 0) {
      const total = amount * superficieM2;
      return `UF ${total.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `UF ${amount.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const handleAdd = () => {
    const startMonth = parseInt(newStartMonth);
    const endMonth = parseInt(newEndMonth) || startMonth;
    const amount = parseFloat(newAmount);

    // Validate months are greater than grace months
    if (isNaN(startMonth) || isNaN(amount) || startMonth <= graceMonths || startMonth > durationMonths) {
      return;
    }

    // Validate end month is >= start month
    if (endMonth < startMonth || endMonth > durationMonths) {
      return;
    }

    // Check if start month already exists
    if (escalations.some((e) => e.month_number === startMonth)) {
      return;
    }

    const newEscalations = [...escalations, { month_number: startMonth, end_month: endMonth, amount, is_uf_m2: newIsUfM2 }]
      .sort((a, b) => a.month_number - b.month_number);
    
    onChange(newEscalations);
    setNewStartMonth("");
    setNewEndMonth("");
    setNewAmount("");
    setNewIsUfM2(false);
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
    const escalation = escalations.find(e => e.month_number === month);
    setEditStartMonth(month);
    setEditEndMonth(escalation?.end_month || month);
    setEditAmount(amount.toString());
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (editStartMonth === null) return;
    
    const amount = parseFloat(editAmount);
    if (isNaN(amount)) return;

    const newEscalations = escalations.map(e => 
      e.month_number === editStartMonth ? { ...e, amount, end_month: editEndMonth || editStartMonth } : e
    );
    
    onChange(newEscalations);
    setEditDialogOpen(false);
    setEditStartMonth(null);
    setEditEndMonth(null);
    setEditAmount("");
  };

  // Generate chart data with real duration spacing including periodic adjustments
  // IMPORTANT: When in UF/m² mode, the chart should display TOTAL rent (amount × superficie),
  // not the UF/m² values, to show actual monthly cost
  const getChartData = () => {
    const data: { month: number; rent: number; isEditable: boolean; isGrace?: boolean; isAdjustment?: boolean }[] = [];
    const sortedEscalations = [...escalations].sort((a, b) => a.month_number - b.month_number);
    
    // Global multiplier for regime/initial rent UF/m² mode
    const surfaceMultiplier = (isUfM2Mode && superficieM2 > 0) ? superficieM2 : 1;
    
    // Build a map of all rent changes (always store as TOTAL rent for display)
    const rentChanges = new Map<number, { rent: number; isEditable: boolean; isGrace?: boolean; isAdjustment?: boolean }>();
    
    // Add grace months at 0 rent
    if (graceMonths > 0) {
      rentChanges.set(1, { rent: 0, isEditable: false, isGrace: true });
      if (graceMonths > 1) {
        rentChanges.set(graceMonths, { rent: 0, isEditable: false, isGrace: true });
      }
    }
    
    // Start with initial rent at first paying month (convert to total if UF/m²)
    const firstPayingMonth = graceMonths + 1;
    const month1Escalation = sortedEscalations.find(e => e.month_number === firstPayingMonth);
    if (month1Escalation) {
      const escMultiplier = (month1Escalation.is_uf_m2 && superficieM2 > 0) ? superficieM2 : 1;
      rentChanges.set(firstPayingMonth, { rent: month1Escalation.amount * escMultiplier, isEditable: true });
    } else {
      const rawStartRent = initialRent || regimeRent;
      const startRent = rawStartRent * surfaceMultiplier;
      rentChanges.set(firstPayingMonth, { rent: startRent, isEditable: false });
    }
    
    // Add all defined escalation points (per-escalation UF/m² handling)
    sortedEscalations.forEach((esc) => {
      if (esc.month_number > firstPayingMonth) {
        const escMultiplier = (esc.is_uf_m2 && superficieM2 > 0) ? superficieM2 : 1;
        rentChanges.set(esc.month_number, { rent: esc.amount * escMultiplier, isEditable: true });
      }
    });
    
    // Add periodic adjustments if enabled
    // Note: periodic adjustments are applied on the regime rent which may not exist with escalations
    if (hasPeriodicAdjustments && adjustmentValue > 0 && firstAdjustmentMonth > 0) {
      const baseRent = (regimeRent || initialRent) * surfaceMultiplier;
      let currentRent = baseRent;
      let month = firstAdjustmentMonth;
      
      // If no periodicity, apply just once at firstAdjustmentMonth
      const periodicity = adjustmentPeriodicityMonths > 0 ? adjustmentPeriodicityMonths : durationMonths + 1;
      
      while (month <= durationMonths) {
        // Calculate adjusted rent
        if (adjustmentType === "percentage") {
          currentRent = currentRent * (1 + adjustmentValue / 100);
        } else {
          currentRent = currentRent + (adjustmentValue * surfaceMultiplier);
        }
        
        // Only add if not already defined by an escalation
        if (!rentChanges.has(month) || !rentChanges.get(month)?.isEditable) {
          rentChanges.set(month, { rent: currentRent, isEditable: false, isAdjustment: true });
        }
        
        month += periodicity;
      }
    }
    
    // Add final month if not already defined
    if (!rentChanges.has(durationMonths)) {
      // Get the last known rent
      const sortedMonths = Array.from(rentChanges.keys()).sort((a, b) => a - b);
      const lastRent = sortedMonths.length > 0 ? rentChanges.get(sortedMonths[sortedMonths.length - 1])?.rent || (regimeRent * surfaceMultiplier) : (regimeRent * surfaceMultiplier);
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
                    <span className="font-semibold">
                      {escalation.month_number}
                      {escalation.end_month && escalation.end_month !== escalation.month_number && 
                        ` - ${escalation.end_month}`
                      }
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Canon: </span>
                    <span className="font-semibold text-primary">
                      {escalation.is_uf_m2 
                        ? formatCurrency(escalation.amount, true)
                        : formatCurrency(escalation.amount)}
                    </span>
                    {escalation.is_uf_m2 && superficieM2 > 0 && (
                      <span className="text-muted-foreground ml-2">
                        (Total: {formatTotal(escalation.amount, true)})
                      </span>
                    )}
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
          <Label className="text-sm font-medium">Período de gracia (sin pago)</Label>
          <GraceMonthsInput
            value={graceMonths}
            onChange={onGraceMonthsChange}
            maxMonths={durationMonths - 1}
          />
        </div>
      )}

      {/* Add new escalation */}
      {!readOnly && (
        <Collapsible defaultOpen={false} className="pt-2">
          <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors group w-full">
            <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
            Agregar Escalonado
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-3">
            <EscalationMonthInput
              startMonth={newStartMonth}
              endMonth={newEndMonth}
              amount={newAmount}
              onStartMonthChange={setNewStartMonth}
              onEndMonthChange={setNewEndMonth}
              onAmountChange={setNewAmount}
              onAdd={handleAdd}
              graceMonths={graceMonths}
              durationMonths={durationMonths}
              currency={currency}
              isUfM2={newIsUfM2}
              onUfM2Change={setNewIsUfM2}
              superficieM2={superficieM2}
              showUfM2Toggle={currency === "UF"}
            />
            <p className="text-xs text-muted-foreground">
              {graceMonths > 0 
                ? `Los primeros ${graceMonths} meses son de gracia. El mes ${graceMonths + 1} es el primer mes con pago.`
                : "Indica el mes inicial, mes final y el canon para ese período."
              }
            </p>
          </CollapsibleContent>
        </Collapsible>
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
                    return [formatChartValue(value), label];
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
                {/* Regime rent reference line - only if regimeRent exists */}
                {regimeRent > 0 && (
                  <ReferenceLine 
                    y={(isUfM2Mode && superficieM2 > 0) ? regimeRent * superficieM2 : regimeRent} 
                    stroke="hsl(var(--muted-foreground))" 
                    strokeDasharray="5 5"
                    label={{ value: "Régimen", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  />
                )}
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

      {/* Edit dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Editar Escalón - Mes {editStartMonth}
              {editEndMonth && editEndMonth !== editStartMonth && ` - ${editEndMonth}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="editStartMonth">Mes Inicio</Label>
                <Input
                  id="editStartMonth"
                  type="number"
                  value={editStartMonth || ''}
                  disabled
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editEndMonth">Mes Fin</Label>
                <Input
                  id="editEndMonth"
                  type="number"
                  value={editEndMonth || ''}
                  onChange={(e) => setEditEndMonth(parseInt(e.target.value) || editStartMonth)}
                  min={editStartMonth || 1}
                  max={durationMonths}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="editAmount">Monto ({currency})</Label>
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
