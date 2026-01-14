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
  // New props for UF/m² mode
  showUfM2Mode?: boolean;
  isUfM2Mode?: boolean;
  onUfM2ModeChange?: (isUfM2: boolean) => void;
  superficieM2?: number;
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
  showUfM2Mode = false,
  isUfM2Mode = false,
  onUfM2ModeChange,
  superficieM2 = 0
}: CurrencyInputProps) => {
  const {
    ufValue,
    convertPesosToUF,
    convertUFToPesos,
    loading
  } = useEconomicIndicators();
  const numericValue = parseFloat(value) || 0;
  const formatUF = (amount: number) => {
    return `UF ${amount.toLocaleString("es-CL", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 3
    })}`
  };
  const formatCLP = (amount: number) => {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      maximumFractionDigits: 0
    }).format(amount);
  };
  const equivalentValue = currency === "CLP" ? convertPesosToUF(numericValue) : convertUFToPesos(numericValue);

  // Calculate total or UF/m² based on mode
  const calculatedTotal = isUfM2Mode && superficieM2 > 0 ? numericValue * superficieM2 : 0;
  const calculatedUfM2 = !isUfM2Mode && superficieM2 > 0 && numericValue > 0 ? numericValue / superficieM2 : 0;
  return <div className="space-y-2">
      <Label htmlFor={id}>{label} {required && "*"}</Label>
      <div className="flex items-center gap-2">
        {showUfM2Mode && superficieM2 > 0 && <Select value={isUfM2Mode ? "uf_m2" : "fixed"} onValueChange={v => onUfM2ModeChange?.(v === "uf_m2")}>
            <SelectTrigger className="w-24 h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed">Monto Fijo</SelectItem>
              <SelectItem value="uf_m2">UF/m²</SelectItem>
            </SelectContent>
          </Select>}
        <Input id={id} type="number" step={currency === "UF" || isUfM2Mode ? "0.001" : "1"} value={value} onChange={e => onChange(e.target.value)} onFocus={e => e.target.select()} required={required} className="w-28" placeholder="0" />
        {isUfM2Mode && <span className="flex items-center text-sm text-muted-foreground whitespace-nowrap">UF/m²</span>}
        {showCurrencySelector && !isUfM2Mode && <Select value={currency} onValueChange={v => onCurrencyChange(v as "UF" | "CLP")}>
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="UF">UF</SelectItem>
              <SelectItem value="CLP">CLP</SelectItem>
            </SelectContent>
          </Select>}
      </div>
      
      {/* Show equivalences */}
      <div className="space-y-0.5">
        {!loading && ufValue > 0 && numericValue > 0 && !isUfM2Mode && <p className="text-xs text-muted-foreground">
            Equivalente: {currency === "CLP" ? formatUF(equivalentValue) : formatCLP(equivalentValue)}
          </p>}
        
        {/* UF/m² mode: show calculated total */}
        {isUfM2Mode && superficieM2 > 0 && numericValue > 0 && <p className="text-xs text-muted-foreground">
            Canon Total: {formatUF(calculatedTotal)} ({superficieM2.toLocaleString("es-CL")} m² × {numericValue.toLocaleString("es-CL", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 3
        })} UF/m²)
          </p>}
        
        {/* Fixed mode: show UF/m² equivalent */}
        {!isUfM2Mode && showUfM2Mode && superficieM2 > 0 && numericValue > 0 && currency === "UF" && <p className="text-xs text-muted-foreground">
            Equivale a: {calculatedUfM2.toLocaleString("es-CL", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 3
        })} UF/m²
          </p>}
        
        {showUfM2Mode && superficieM2 === 0 && <p className="text-xs text-amber-600">
            Superficie no definida. Ingrese datos de superficie para habilitar cálculo UF/m².
          </p>}
      </div>
    </div>;
};