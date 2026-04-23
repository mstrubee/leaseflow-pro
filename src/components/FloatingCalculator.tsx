import { useState, useCallback, useRef, useEffect, KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { Calculator, ChevronDown, ChevronUp, ArrowRightLeft, Trash2, X, RotateCcw } from "lucide-react";
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

const STORAGE_KEY = "floating-calc-state";

const parseNum = (s: string): number => {
  if (s === "" || s == null) return NaN;
  const cleaned = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? NaN : n;
};

const fmtNum = (n: number): string => {
  if (isNaN(n)) return "—";
  const str = parseFloat(n.toFixed(8)).toString();
  return str.replace(".", ",");
};

const fmtCLP = (n: number): string => {
  if (isNaN(n)) return "—";
  return n.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const applyOp = (a: number, b: number, op: string): number => {
  if (isNaN(a) || isNaN(b)) return NaN;
  switch (op) {
    case "+": return a + b;
    case "-": return a - b;
    case "×": return a * b;
    case "÷": return b !== 0 ? a / b : NaN;
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
  const [entries, setEntries] = useState<HistoryEntry[]>(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.entries)) {
          // Ensure nextId is past any restored ids
          parsed.entries.forEach((e: HistoryEntry) => { if (e.id >= nextId) nextId = e.id + 1; });
          return parsed.entries;
        }
      }
    } catch { /* ignore */ }
    return [];
  });
  const [currentInput, setCurrentInput] = useState<string>(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.currentInput === "string") return parsed.currentInput;
      }
    } catch { /* ignore */ }
    return "0";
  });
  const [pendingOp, setPendingOp] = useState<string | null>(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.pendingOp === null || typeof parsed.pendingOp === "string") return parsed.pendingOp;
      }
    } catch { /* ignore */ }
    return null;
  });
  const [justPushed, setJustPushed] = useState(false);

  const [ufInput, setUfInput] = useState("");
  const [clpInput, setClpInput] = useState("");

  // Persist calculator state across navigations
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ entries, currentInput, pendingOp }));
    } catch { /* ignore */ }
  }, [entries, currentInput, pendingOp]);

  // Drag state
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const draggedRef = useRef(false);

  const { ufValue, convertUFToPesos, convertPesosToUF } = useEconomicIndicators();

  const calcRef = useRef<HTMLDivElement>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  // Drag handlers
  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    setIsDragging(true);
    dragStart.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [offset]);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragStart.current || !isDragging) return;
    const dx = e.clientX - dragStart.current.px;
    const dy = e.clientY - dragStart.current.py;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) draggedRef.current = true;
    setOffset({ x: dragStart.current.ox + dx, y: dragStart.current.oy + dy });
  }, [isDragging]);

  const onPointerUp = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    dragStart.current = null;
  }, [isDragging]);

  // Push current value + operator into history, prepare for next input
  const pushEntry = useCallback((op: string) => {
    const val = currentInput;
    if (entries.length === 0 && !pendingOp) {
      // First entry — preserve incoming operator as pendingOp
      const entry: HistoryEntry = { id: nextId++, value: val, operator: "", result: parseNum(val) };
      setEntries([entry]);
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
    // Nothing to do: no operator pending and no history → just keep current input
    if (!pendingOp && entries.length === 0) return;
    if (currentInput === "0" && justPushed && !pendingOp) return;

    const val = currentInput;
    const op = pendingOp || "+";
    const entry: HistoryEntry = { id: nextId++, value: val, operator: op, result: 0 };
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
    setCurrentInput(fmtNum((isNaN(n) ? 0 : n) / 100));
  }, [currentInput]);

  const handleToggleSign = useCallback(() => {
    const n = parseNum(currentInput);
    setCurrentInput(fmtNum(-(isNaN(n) ? 0 : n)));
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
      if (idx === 0 && updated.length > 0) {
        updated[0] = { ...updated[0], operator: "" };
      }
      return recalcAll(updated);
    });
  }, []);

  // Keyboard support — ignore events originating from inner inputs/textareas
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const tag = target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;

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

  const ufNumeric = parseNum(ufInput);
  const clpNumeric = parseNum(clpInput);
  const showUfToCLP = !isNaN(ufNumeric) && ufNumeric > 0;
  const showCLPToUF = !isNaN(clpNumeric) && clpNumeric > 0;
  const ufToCLP = showUfToCLP ? fmtCLP(convertUFToPesos(ufNumeric)) : "";
  const clpToUF = showCLPToUF ? convertPesosToUF(clpNumeric).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : "";

  const btnBase = "h-9 w-full text-sm font-medium rounded-md";
  const ops = ["+", "-", "×", "÷"];
  const finalResult = entries.length > 0 ? entries[entries.length - 1].result : null;
  const isMoved = offset.x !== 0 || offset.y !== 0;

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
                UF hoy: ${ufValue ? fmtCLP(ufValue) : "…"}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">UF → Pesos</label>
                <Input placeholder="Ej: 100" value={ufInput} onChange={e => setUfInput(e.target.value)} className="h-8 text-sm" />
                {showUfToCLP && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ArrowRightLeft className="h-3 w-3" />
                    <span className="font-medium text-foreground">$ {ufToCLP}</span>
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Pesos → UF</label>
                <Input placeholder="Ej: 3.500.000" value={clpInput} onChange={e => setClpInput(e.target.value)} className="h-8 text-sm" />
                {showCLPToUF && (
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
        <Button
          variant="outline"
          size="sm"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onClick={(e) => {
            if (!draggedRef.current) {
              setIsOpen(!isOpen);
              setTimeout(() => calcRef.current?.focus(), 100);
            }
            draggedRef.current = false;
          }}
          className="h-9 gap-1.5 rounded-full shadow-lg bg-card hover:bg-accent border-border px-3 cursor-grab active:cursor-grabbing touch-none"
        >
          <Calculator className="h-4 w-4" />
          <span className="text-xs font-medium">Calc</span>
          {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
        </Button>
        {isMoved && (
          <Button
            variant="outline"
            size="icon"
            onClick={() => setOffset({ x: 0, y: 0 })}
            className="h-7 w-7 rounded-full shadow-lg bg-card hover:bg-accent border-border"
            title="Volver a la posición original"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
