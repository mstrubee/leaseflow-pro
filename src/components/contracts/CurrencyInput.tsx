import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEconomicIndicators } from "@/hooks/useEconomicIndicators";

interface CurrencyInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  currency: "UF" | "CLP";
  onCurrencyChange: (currency: "UF" | "CLP") => void;
  required?: boolean;
  showCurrencySelector?: boolean;
}

export const CurrencyInput = ({
  id,
  label,
  value,
  onChange,
  currency,
  onCurrencyChange,
  required = false,
  showCurrencySelector = true,
}: CurrencyInputProps) => {
  const { ufValue, convertPesosToUF, convertUFToPesos, loading } = useEconomicIndicators();

  const numericValue = parseFloat(value) || 0;
  
  const formatUF = (amount: number) => {
    return `UF ${amount.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatCLP = (amount: number) => {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const equivalentValue = currency === "CLP" 
    ? convertPesosToUF(numericValue)
    : convertUFToPesos(numericValue);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label} {required && "*"}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          type="number"
          step={currency === "UF" ? "0.01" : "1"}
          value={value === "0" ? "" : value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => e.target.select()}
          required={required}
          className="flex-1"
          placeholder="0"
        />
        {showCurrencySelector && (
          <Select value={currency} onValueChange={(v) => onCurrencyChange(v as "UF" | "CLP")}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="UF">UF</SelectItem>
              <SelectItem value="CLP">CLP</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>
      {!loading && ufValue > 0 && numericValue > 0 && (
        <p className="text-xs text-muted-foreground">
          Equivalente: {currency === "CLP" ? formatUF(equivalentValue) : formatCLP(equivalentValue)}
        </p>
      )}
    </div>
  );
};
