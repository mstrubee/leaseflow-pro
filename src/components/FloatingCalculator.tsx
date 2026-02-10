import { useState, useCallback } from "react";
import { Calculator, ChevronDown, ChevronUp, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEconomicIndicators } from "@/hooks/useEconomicIndicators";
import { cn } from "@/lib/utils";

export function FloatingCalculator() {
  const [isOpen, setIsOpen] = useState(false);
  const [display, setDisplay] = useState("0");
  const [previousValue, setPreviousValue] = useState<number | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [resetNext, setResetNext] = useState(false);

  const [ufInput, setUfInput] = useState("");
  const [clpInput, setClpInput] = useState("");

  const { ufValue, convertUFToPesos, convertPesosToUF } = useEconomicIndicators();

  const handleNumber = useCallback((num: string) => {
    setDisplay(prev => {
      if (resetNext || prev === "0") {
        setResetNext(false);
        return num;
      }
      return prev + num;
    });
  }, [resetNext]);

  const handleDecimal = useCallback(() => {
    setDisplay(prev => {
      if (resetNext) {
        setResetNext(false);
        return "0,";
      }
      if (prev.includes(",")) return prev;
      return prev + ",";
    });
  }, [resetNext]);

  const handleOperation = useCallback((op: string) => {
    const current = parseFloat(display.replace(",", "."));
    if (previousValue !== null && operation && !resetNext) {
      const result = calculate(previousValue, current, operation);
      setDisplay(formatCalcResult(result));
      setPreviousValue(result);
    } else {
      setPreviousValue(current);
    }
    setOperation(op);
    setResetNext(true);
  }, [display, previousValue, operation, resetNext]);

  const calculate = (a: number, b: number, op: string): number => {
    switch (op) {
      case "+": return a + b;
      case "-": return a - b;
      case "×": return a * b;
      case "÷": return b !== 0 ? a / b : 0;
      default: return b;
    }
  };

  const formatCalcResult = (n: number): string => {
    const str = parseFloat(n.toFixed(8)).toString();
    return str.replace(".", ",");
  };

  const handleEquals = useCallback(() => {
    if (previousValue === null || !operation) return;
    const current = parseFloat(display.replace(",", "."));
    const result = calculate(previousValue, current, operation);
    setDisplay(formatCalcResult(result));
    setPreviousValue(null);
    setOperation(null);
    setResetNext(true);
  }, [display, previousValue, operation]);

  const handleClear = useCallback(() => {
    setDisplay("0");
    setPreviousValue(null);
    setOperation(null);
    setResetNext(false);
  }, []);

  const handlePercent = useCallback(() => {
    const current = parseFloat(display.replace(",", "."));
    setDisplay(formatCalcResult(current / 100));
    setResetNext(true);
  }, [display]);

  const handleToggleSign = useCallback(() => {
    setDisplay(prev => {
      const n = parseFloat(prev.replace(",", "."));
      return formatCalcResult(-n);
    });
  }, []);

  const ufToCLP = ufInput ? Math.round(convertUFToPesos(parseFloat(ufInput.replace(",", ".")) || 0)).toLocaleString("es-CL") : "";
  const clpToUF = clpInput ? convertPesosToUF(parseFloat(clpInput.replace(/\./g, "").replace(",", ".")) || 0).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : "";

  const btnBase = "h-9 w-full text-sm font-medium rounded-md";

  return (
    <div className="fixed bottom-4 left-4 z-50">
      {isOpen && (
        <div className="mb-2 w-64 bg-card border border-border rounded-xl shadow-xl overflow-hidden animate-fade-in">
          <Tabs defaultValue="calc" className="w-full">
            <TabsList className="w-full grid grid-cols-2 h-8 rounded-none">
              <TabsTrigger value="calc" className="text-xs h-7">Calculadora</TabsTrigger>
              <TabsTrigger value="convert" className="text-xs h-7">UF ↔ $</TabsTrigger>
            </TabsList>

            <TabsContent value="calc" className="p-2 pt-1 m-0">
              <div className="bg-muted rounded-md px-3 py-2 mb-2 text-right">
                {operation && previousValue !== null && (
                  <div className="text-[10px] text-muted-foreground truncate">
                    {formatCalcResult(previousValue)} {operation}
                  </div>
                )}
                <div className="text-lg font-mono font-semibold text-foreground truncate">{display}</div>
              </div>
              <div className="grid grid-cols-4 gap-1">
                <Button variant="secondary" className={btnBase} onClick={handleClear}>C</Button>
                <Button variant="secondary" className={btnBase} onClick={handleToggleSign}>±</Button>
                <Button variant="secondary" className={btnBase} onClick={handlePercent}>%</Button>
                <Button variant="default" className={btnBase} onClick={() => handleOperation("÷")}>÷</Button>

                {["7","8","9"].map(n => <Button key={n} variant="outline" className={btnBase} onClick={() => handleNumber(n)}>{n}</Button>)}
                <Button variant="default" className={btnBase} onClick={() => handleOperation("×")}>×</Button>

                {["4","5","6"].map(n => <Button key={n} variant="outline" className={btnBase} onClick={() => handleNumber(n)}>{n}</Button>)}
                <Button variant="default" className={btnBase} onClick={() => handleOperation("-")}>−</Button>

                {["1","2","3"].map(n => <Button key={n} variant="outline" className={btnBase} onClick={() => handleNumber(n)}>{n}</Button>)}
                <Button variant="default" className={btnBase} onClick={() => handleOperation("+")}>+</Button>

                <Button variant="outline" className={cn(btnBase, "col-span-2")} onClick={() => handleNumber("0")}>0</Button>
                <Button variant="outline" className={btnBase} onClick={handleDecimal}>,</Button>
                <Button variant="default" className={btnBase} onClick={handleEquals}>=</Button>
              </div>
            </TabsContent>

            <TabsContent value="convert" className="p-3 pt-2 m-0 space-y-3">
              <div className="text-[10px] text-muted-foreground text-center">
                UF hoy: ${ufValue ? ufValue.toLocaleString("es-CL") : "…"}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">UF → Pesos</label>
                <Input
                  placeholder="Ej: 100"
                  value={ufInput}
                  onChange={e => setUfInput(e.target.value)}
                  className="h-8 text-sm"
                />
                {ufToCLP && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ArrowRightLeft className="h-3 w-3" />
                    <span className="font-medium text-foreground">$ {ufToCLP}</span>
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Pesos → UF</label>
                <Input
                  placeholder="Ej: 3.500.000"
                  value={clpInput}
                  onChange={e => setClpInput(e.target.value)}
                  className="h-8 text-sm"
                />
                {clpToUF && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ArrowRightLeft className="h-3 w-3" />
                    <span className="font-medium text-foreground">UF {clpToUF}</span>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="h-9 gap-1.5 rounded-full shadow-lg bg-card hover:bg-accent border-border px-3"
      >
        <Calculator className="h-4 w-4" />
        <span className="text-xs font-medium">Calc</span>
        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
      </Button>
    </div>
  );
}
