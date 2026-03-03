import { useState, useCallback, useRef, useEffect, KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { Calculator, ChevronDown, ChevronUp, ArrowRightLeft, Trash2, X, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEconomicIndicators } from "@/hooks/useEconomicIndicators";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface HistoryEntry {
  id: number;
  value: string;
  operator: string; // "+", "-", "×", "÷", or "" for first entry
  result: number;
}

let nextId = 1;

const parseNum = (s: string): number => {
  const cleaned = s.replace(/\./g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
};

const fmtNum = (n: number): string => {
  const str = parseFloat(n.toFixed(8)).toString();
  return str.replace(".", ",");
};

const applyOp = (a: number, b: number, op: string): number => {
  switch (op) {
    case "+": return a + b;
    case "-": return a - b;
    case "×": return a * b;
    case "÷": return b !== 0 ? a / b : 0;
    default: return b;
  }
};

const recalcAll = (entries: HistoryEntry[]): HistoryEntry[] => {
  if (entries.length === 0) return [];
  const updated = [...entries];
  updated[0] = { ...updated[0], result: parseNum(updated[0].value) };
  for (let i = 1; i < updated.length; i++) {
    const prev = updated[i - 1].result;
    const val = parseNum(updated[i].value);
    updated[i] = { ...updated[i], result: applyOp(prev, val, updated[i].operator) };
  }
  return updated;
};

export function FloatingCalculator() {
  const [isOpen, setIsOpen] = useState(false);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [currentInput, setCurrentInput] = useState("0");
  const [pendingOp, setPendingOp] = useState<string | null>(null);
  const [justPushed, setJustPushed] = useState(false);

  const [ufInput, setUfInput] = useState("");
  const [clpInput, setClpInput] = useState("");

  // Drag state
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const returnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { ufValue, convertUFToPesos, convertPesosToUF } = useEconomicIndicators();

  const calcRef = useRef<HTMLDivElement>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  // Drag handlers
  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (returnTimer.current) clearTimeout(returnTimer.current);
  }, [offset]);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragStart.current || !isDragging) return;
    const dx = e.clientX - dragStart.current.px;
    const dy = e.clientY - dragStart.current.py;
    setOffset({ x: dragStart.current.ox + dx, y: dragStart.current.oy + dy });
  }, [isDragging]);

  const onPointerUp = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    dragStart.current = null;
    // Return to original position after 5 seconds
    if (offset.x !== 0 || offset.y !== 0) {
      returnTimer.current = setTimeout(() => {
        setOffset({ x: 0, y: 0 });
      }, 5000);
    }
  }, [isDragging, offset]);

  useEffect(() => {
    return () => { if (returnTimer.current) clearTimeout(returnTimer.current); };
  }, []);

  // Push current value + operator into history, prepare for next input
  const pushEntry = useCallback((op: string) => {
    const val = currentInput;
    if (entries.length === 0 && !pendingOp) {
      // First entry
      const entry: HistoryEntry = { id: nextId++, value: val, operator: "", result: parseNum(val) };
      const newEntries = [entry];
      setEntries(newEntries);
    } else if (!justPushed) {
      const entry: HistoryEntry = { id: nextId++, value: val, operator: pendingOp || "+", result: 0 };
      const newEntries = recalcAll([...entries, entry]);
      setEntries(newEntries);
    }
    setPendingOp(op);
    setCurrentInput("0");
    setJustPushed(true);
  }, [currentInput, entries, pendingOp, justPushed]);

  const handleNumber = useCallback((num: string) => {
    setJustPushed(false);
    setCurrentInput(prev => (prev === "0" ? num : prev + num));
  }, []);

  const handleDecimal = useCallback(() => {
    setJustPushed(false);
    setCurrentInput(prev => (prev.includes(",") ? prev : prev + ","));
  }, []);

  const handleOperation = useCallback((op: string) => {
    pushEntry(op);
  }, [pushEntry]);

  const handleEquals = useCallback(() => {
    if (currentInput === "0" && justPushed) return;
    const val = currentInput;
    const op = pendingOp || (entries.length === 0 ? "" : "+");
    const entry: HistoryEntry = { id: nextId++, value: val, operator: entries.length === 0 && !pendingOp ? "" : op, result: 0 };
    const newEntries = recalcAll([...entries, entry]);
    setEntries(newEntries);
    const finalResult = newEntries[newEntries.length - 1].result;
    setCurrentInput(fmtNum(finalResult));
    setPendingOp(null);
    setJustPushed(true);
  }, [currentInput, entries, pendingOp, justPushed]);

  const handleClear = useCallback(() => {
    setEntries([]);
    setCurrentInput("0");
    setPendingOp(null);
    setJustPushed(false);
  }, []);

  const handleBackspace = useCallback(() => {
    setCurrentInput(prev => (prev.length <= 1 ? "0" : prev.slice(0, -1)));
  }, []);

  const handlePercent = useCallback(() => {
    const n = parseNum(currentInput);
    setCurrentInput(fmtNum(n / 100));
  }, [currentInput]);

  const handleToggleSign = useCallback(() => {
    const n = parseNum(currentInput);
    setCurrentInput(fmtNum(-n));
  }, [currentInput]);

  // Edit a history entry's value
  const updateEntryValue = useCallback((id: number, newValue: string) => {
    setEntries(prev => {
      const updated = prev.map(e => e.id === id ? { ...e, value: newValue } : e);
      return recalcAll(updated);
    });
  }, []);

  // Edit a history entry's operator
  const updateEntryOp = useCallback((id: number, newOp: string) => {
    setEntries(prev => {
      const updated = prev.map(e => e.id === id ? { ...e, operator: newOp } : e);
      return recalcAll(updated);
    });
  }, []);

  // Remove a history entry
  const removeEntry = useCallback((id: number) => {
    setEntries(prev => {
      const idx = prev.findIndex(e => e.id === id);
      if (idx === -1) return prev;
      const updated = prev.filter(e => e.id !== id);
      // If we removed the first entry, clear the operator of the new first
      if (idx === 0 && updated.length > 0) {
        updated[0] = { ...updated[0], operator: "" };
      }
      return recalcAll(updated);
    });
  }, []);

  // Keyboard support
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    const key = e.key;
    if (key >= "0" && key <= "9") { handleNumber(key); e.preventDefault(); }
    else if (key === "," || key === ".") { handleDecimal(); e.preventDefault(); }
    else if (key === "+") { handleOperation("+"); e.preventDefault(); }
    else if (key === "-") { handleOperation("-"); e.preventDefault(); }
    else if (key === "*") { handleOperation("×"); e.preventDefault(); }
    else if (key === "/") { handleOperation("÷"); e.preventDefault(); }
    else if (key === "Enter" || key === "=") { handleEquals(); e.preventDefault(); }
    else if (key === "Escape") { handleClear(); e.preventDefault(); }
    else if (key === "Backspace") { handleBackspace(); e.preventDefault(); }
    else if (key === "%") { handlePercent(); e.preventDefault(); }
  }, [handleNumber, handleDecimal, handleOperation, handleEquals, handleClear, handleBackspace, handlePercent]);

  const ufToCLP = ufInput ? Math.round(convertUFToPesos(parseFloat(ufInput.replace(",", ".")) || 0)).toLocaleString("es-CL") : "";
  const clpToUF = clpInput ? convertPesosToUF(parseFloat(clpInput.replace(/\./g, "").replace(",", ".")) || 0).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : "";

  const btnBase = "h-9 w-full text-sm font-medium rounded-md";
  const ops = ["+", "-", "×", "÷"];
  const finalResult = entries.length > 0 ? entries[entries.length - 1].result : null;

  return (
    <div
      ref={containerRef}
      className="fixed bottom-4 left-4 z-50"
      style={{
        transform: `translate(${offset.x}px, ${offset.y}px)`,
        transition: isDragging ? 'none' : 'transform 0.4s ease-out',
      }}
    >
      {isOpen && (
        <div
          ref={calcRef}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          className="mb-2 w-72 bg-card border border-border rounded-xl shadow-xl overflow-hidden animate-fade-in outline-none focus:ring-1 focus:ring-ring"
        >
          <Tabs defaultValue="calc" className="w-full">
            <TabsList className="w-full grid grid-cols-2 h-8 rounded-none">
              <TabsTrigger value="calc" className="text-xs h-7">Calculadora</TabsTrigger>
              <TabsTrigger value="convert" className="text-xs h-7">UF ↔ $</TabsTrigger>
            </TabsList>

            <TabsContent value="calc" className="p-2 pt-1 m-0" onClick={() => calcRef.current?.focus()}>
              {/* History */}
              {entries.length > 0 && (
                <ScrollArea className="max-h-32 mb-1.5">
                  <div className="space-y-0.5 pr-2">
                    {entries.map((entry, idx) => (
                      <div key={entry.id} className="flex items-center gap-1 group text-xs">
                        {idx === 0 ? (
                          <span className="w-5 text-center text-muted-foreground">=</span>
                        ) : (
                          <button
                            className="w-5 text-center font-semibold text-primary hover:text-primary/80 cursor-pointer"
                            onClick={() => {
                              const nextOp = ops[(ops.indexOf(entry.operator) + 1) % ops.length];
                              updateEntryOp(entry.id, nextOp);
                            }}
                            title="Click para cambiar operador"
                          >
                            {entry.operator}
                          </button>
                        )}
                        <input
                          className="flex-1 bg-muted/50 rounded px-1.5 py-0.5 text-xs font-mono text-foreground border-none outline-none focus:ring-1 focus:ring-ring w-0 min-w-0"
                          value={entry.value}
                          onChange={e => updateEntryValue(entry.id, e.target.value)}
                          onKeyDown={e => e.stopPropagation()}
                        />
                        <span className="text-muted-foreground font-mono min-w-[60px] text-right">
                          = {fmtNum(entry.result)}
                        </span>
                        <button
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                          onClick={() => removeEntry(entry.id)}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    <div ref={historyEndRef} />
                  </div>
                </ScrollArea>
              )}

              {/* Current display */}
              <div className="bg-muted rounded-md px-3 py-2 mb-2">
                {pendingOp && (
                  <div className="text-[10px] text-muted-foreground text-right">
                    {finalResult !== null ? fmtNum(finalResult) : ""} {pendingOp}
                  </div>
                )}
                <div className="text-lg font-mono font-semibold text-foreground text-right truncate">{currentInput}</div>
              </div>

              {/* Buttons */}
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

              {entries.length > 0 && (
                <div className="mt-1.5 flex justify-end">
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground gap-1" onClick={handleClear}>
                    <Trash2 className="h-3 w-3" /> Limpiar historial
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="convert" className="p-3 pt-2 m-0 space-y-3">
              <div className="text-[10px] text-muted-foreground text-center">
                UF hoy: ${ufValue ? ufValue.toLocaleString("es-CL") : "…"}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">UF → Pesos</label>
                <Input placeholder="Ej: 100" value={ufInput} onChange={e => setUfInput(e.target.value)} className="h-8 text-sm" />
                {ufToCLP && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ArrowRightLeft className="h-3 w-3" />
                    <span className="font-medium text-foreground">$ {ufToCLP}</span>
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Pesos → UF</label>
                <Input placeholder="Ej: 3.500.000" value={clpInput} onChange={e => setClpInput(e.target.value)} className="h-8 text-sm" />
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

      <div className="flex items-center gap-1">
        <button
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="h-9 w-7 flex items-center justify-center rounded-full bg-card border border-border shadow-lg cursor-grab active:cursor-grabbing hover:bg-accent touch-none"
        >
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setIsOpen(!isOpen);
            setTimeout(() => calcRef.current?.focus(), 100);
          }}
          className="h-9 gap-1.5 rounded-full shadow-lg bg-card hover:bg-accent border-border px-3"
        >
          <Calculator className="h-4 w-4" />
          <span className="text-xs font-medium">Calc</span>
          {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
        </Button>
      </div>
    </div>
  );
}
