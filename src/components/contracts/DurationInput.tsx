import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useEffect } from "react";

interface DurationInputProps {
  id: string;
  label: string;
  /** Value in months (always stored as months) */
  value: string;
  /** Callback with value in months */
  onChange: (months: string) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  required?: boolean;
  description?: string;
  className?: string;
  /** Show the equivalent in the other unit */
  showEquivalent?: boolean;
}

type DurationUnit = "months" | "years";

export const DurationInput = ({
  id,
  label,
  value,
  onChange,
  placeholder = "Ej: 12",
  min = 1,
  max,
  required = false,
  description,
  className = "",
  showEquivalent = true,
}: DurationInputProps) => {
  const [unit, setUnit] = useState<DurationUnit>("months");
  const [displayValue, setDisplayValue] = useState("");

  // Initialize display value based on the value in months
  useEffect(() => {
    const months = parseInt(value) || 0;
    if (months > 0) {
      if (unit === "years") {
        setDisplayValue((months / 12).toString());
      } else {
        setDisplayValue(months.toString());
      }
    } else {
      // Clear display when value is 0 or empty - don't show "0"
      setDisplayValue("");
    }
  }, [value, unit]);

  const handleValueChange = (newValue: string) => {
    // Allow user to clear the field completely
    if (newValue === "" || newValue === undefined) {
      setDisplayValue("");
      onChange("");
      return;
    }

    // If input is "0", allow it but clear the parent value (will be replaced when user types)
    if (newValue === "0") {
      setDisplayValue("");
      onChange("");
      return;
    }

    setDisplayValue(newValue);

    const numValue = parseFloat(newValue);
    if (isNaN(numValue) || numValue <= 0) {
      onChange("");
      return;
    }

    // Convert to months
    const months = unit === "years" ? Math.round(numValue * 12) : Math.round(numValue);
    onChange(months.toString());
  };

  const handleUnitChange = (newUnit: DurationUnit) => {
    const currentMonths = parseInt(value) || 0;
    setUnit(newUnit);
    
    if (currentMonths > 0) {
      if (newUnit === "years") {
        setDisplayValue((currentMonths / 12).toString());
      } else {
        setDisplayValue(currentMonths.toString());
      }
    }
  };

  const months = parseInt(value) || 0;
  const equivalentText = (() => {
    if (!showEquivalent || months === 0) return null;
    
    if (unit === "months" && months >= 12) {
      const years = months / 12;
      const fullYears = Math.floor(years);
      const remainingMonths = months % 12;
      
      if (remainingMonths === 0) {
        return `= ${fullYears} ${fullYears === 1 ? "año" : "años"}`;
      } else {
        return `= ${fullYears} ${fullYears === 1 ? "año" : "años"} y ${remainingMonths} ${remainingMonths === 1 ? "mes" : "meses"}`;
      }
    } else if (unit === "years") {
      return `= ${months} ${months === 1 ? "mes" : "meses"}`;
    }
    return null;
  })();

  return (
    <div className={`space-y-2 ${className}`}>
      <Label htmlFor={id}>
        {label} {required && "*"}
      </Label>
      <div className="flex gap-2">
        <Input
          id={id}
          type="number"
          step={unit === "years" ? "0.5" : "1"}
          min={unit === "years" ? min / 12 : min}
          max={max ? (unit === "years" ? max / 12 : max) : undefined}
          placeholder={unit === "years" ? "Ej: 5" : placeholder}
          value={displayValue}
          onChange={(e) => handleValueChange(e.target.value)}
          className="flex-1"
        />
        <Select value={unit} onValueChange={(v) => handleUnitChange(v as DurationUnit)}>
          <SelectTrigger className="w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="months">Meses</SelectItem>
            <SelectItem value="years">Años</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {(description || equivalentText) && (
        <div className="space-y-1">
          {equivalentText && (
            <p className="text-xs text-primary font-medium">{equivalentText}</p>
          )}
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      )}
    </div>
  );
};
