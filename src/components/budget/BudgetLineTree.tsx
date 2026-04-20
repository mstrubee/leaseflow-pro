import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { ChevronRight, ChevronDown, Plus, Trash2, ArrowRight, FileText, Receipt, ClipboardList, AlertTriangle, Percent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useBudgetContext } from "./BudgetContext";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SupplierSelect } from "@/components/suppliers/SupplierSelect";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface BudgetLine {
  id: string;
  budget_id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  amount_uf: number;
  status: "autorizado" | "no_autorizado";
  display_order: number;
  quantity?: number;
  unit_type?: string;
  currency?: string;
  unit_price?: number;
  template_line_id?: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  category_id?: string | null;
  calc_type?: string | null;
  calc_source_line_id?: string | null;
  calc_percentage?: number | null;
  children?: BudgetLine[];
}

const EMPTY_LINES_MAP = new Map<string, BudgetLine>();

interface BudgetLineTreeProps {
  lines: BudgetLine[];
  onAddLine: (parentId: string | null) => void;
  onUpdateLine: (id: string, data: Partial<BudgetLine>) => void;
  onDeleteLine: (id: string) => void;
  onCreateOC?: (budgetLineId: string, lineName: string) => void;
  onCreateOCRequest?: (budgetLineId: string, lineName: string) => void;
  onCreateInvoice?: (budgetLineId: string, lineName: string) => void;
  onViewLineDetails?: (budgetLineId: string, lineName: string) => void;
  level?: number;
  readOnly?: boolean;
  compactView?: boolean;
  parentCategoryId?: string | null;
  globalExpandState?: "expanded" | "collapsed" | null;
  templatePricesMap?: Record<string, number>;
  collapsedIds?: Set<string>;
  onToggleExpand?: (id: string) => void;
  linesMap?: Map<string, BudgetLine>;
  superficieEdificada?: number;
  /** Set of supplier IDs that represent internal transfers — these lines are
   *  shown as informational only and excluded from totals. */
  internalTransferSupplierIds?: Set<string>;
}
export const BudgetLineTree = ({
  lines,
  onAddLine,
  onUpdateLine,
  onDeleteLine,
  onCreateOC,
  onCreateOCRequest,
  onCreateInvoice,
  onViewLineDetails,
  level = 0,
  readOnly = false,
  compactView = false,
  parentCategoryId = null,
  globalExpandState = null,
  templatePricesMap = {},
  collapsedIds,
  onToggleExpand,
  linesMap: externalLinesMap,
  superficieEdificada = 0,
  internalTransferSupplierIds,
}: BudgetLineTreeProps) => {
  // Build linesMap only at root level (level === 0), pass down to children
  const rootLinesMap = useMemo(() => {
    if (level > 0) return null; // Don't compute for nested trees
    const map = new Map<string, BudgetLine>();
    const addToMap = (items: BudgetLine[]) => {
      items.forEach(item => {
        map.set(item.id, item);
        if (item.children?.length) addToMap(item.children);
      });
    };
    addToMap(lines);
    return map;
  }, [lines, level]);

  const effectiveLinesMap = externalLinesMap || rootLinesMap || EMPTY_LINES_MAP;

  const sortedLines = useMemo(() => {
    return [...lines].sort((a, b) => {
      // "Proyectos" always first (only in compact view)
      if (compactView) {
        const aIsProyectos = a.name.toLowerCase() === "proyectos";
        const bIsProyectos = b.name.toLowerCase() === "proyectos";
        if (aIsProyectos && !bIsProyectos) return -1;
        if (!aIsProyectos && bIsProyectos) return 1;
      }
      // "No Autorizado" always at end within each parent
      if (a.status !== b.status) {
        if (a.status === "no_autorizado") return 1;
        if (b.status === "no_autorizado") return -1;
      }
      // In compact view, sort alphabetically; otherwise preserve display_order
      if (compactView) return a.name.localeCompare(b.name, "es");
      return (a.display_order ?? 0) - (b.display_order ?? 0);
    });
  }, [lines, compactView]);

  return <div className={cn("space-y-1", level > 0 && "ml-6 border-l border-border pl-4")}>
    {sortedLines.map(line => <BudgetLineItem
        key={line.id} 
        line={line} 
        level={level} 
        linesMap={effectiveLinesMap}
        onAddLine={onAddLine} 
        onUpdateLine={onUpdateLine} 
        onDeleteLine={onDeleteLine} 
        onCreateOC={onCreateOC} 
        onCreateOCRequest={onCreateOCRequest}
        onCreateInvoice={onCreateInvoice} 
        onViewLineDetails={onViewLineDetails} 
        readOnly={readOnly}
        compactView={compactView}
        parentCategoryId={line.category_id || parentCategoryId}
        globalExpandState={globalExpandState}
        templatePricesMap={templatePricesMap}
        collapsedIds={collapsedIds}
        onToggleExpand={onToggleExpand}
        superficieEdificada={superficieEdificada}
      />)}
      {level === 0 && !readOnly && <Button variant="ghost" size="sm" onClick={() => onAddLine(null)} className="text-muted-foreground hover:text-foreground">
          <Plus className="h-4 w-4 mr-1" />
          Agregar línea madre
        </Button>}
    </div>;
};
interface BudgetLineItemProps {
  line: BudgetLine;
  level: number;
  linesMap: Map<string, BudgetLine>;
  onAddLine: (parentId: string | null) => void;
  onUpdateLine: (id: string, data: Partial<BudgetLine>) => void;
  onDeleteLine: (id: string) => void;
  onCreateOC?: (budgetLineId: string, lineName: string) => void;
  onCreateOCRequest?: (budgetLineId: string, lineName: string) => void;
  onCreateInvoice?: (budgetLineId: string, lineName: string) => void;
  onViewLineDetails?: (budgetLineId: string, lineName: string) => void;
  readOnly?: boolean;
  compactView?: boolean;
  parentCategoryId?: string | null;
  globalExpandState?: "expanded" | "collapsed" | null;
  templatePricesMap?: Record<string, number>;
  collapsedIds?: Set<string>;
  onToggleExpand?: (id: string) => void;
  superficieEdificada?: number;
  internalTransferSupplierIds?: Set<string>;
}

const countDescendants = (line: BudgetLine): number => {
  if (!line.children || line.children.length === 0) return 0;
  return line.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
};

const BudgetLineItemInner = ({
  line,
  level,
  linesMap,
  onAddLine,
  onUpdateLine,
  onDeleteLine,
  onCreateOC,
  onCreateOCRequest,
  onCreateInvoice,
  onViewLineDetails,
  readOnly = false,
  compactView = false,
  parentCategoryId = null,
  globalExpandState = null,
  templatePricesMap: externalTemplatePricesMap = {},
  collapsedIds,
  onToggleExpand,
  superficieEdificada = 0,
  internalTransferSupplierIds,
}: BudgetLineItemProps) => {
  const isInternalTransfer = !!(line.supplier_id && internalTransferSupplierIds?.has(line.supplier_id));
  const { isAdmin } = useAuth();
  // Use centralized expansion state if provided, otherwise fall back to local state
  const [localExpanded, setLocalExpanded] = useState(true);
  const isExpanded = collapsedIds ? !collapsedIds.has(line.id) : localExpanded;
  const setIsExpanded = (val: boolean) => {
    if (onToggleExpand) {
      onToggleExpand(line.id);
    } else {
      setLocalExpanded(val);
    }
  };
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingQuantity, setIsEditingQuantity] = useState(false);
  const [isEditingUnit, setIsEditingUnit] = useState(false);
  const [isEditingPrice, setIsEditingPrice] = useState(false);
  const [isEditingCurrency, setIsEditingCurrency] = useState(false);
  const [isEditingTotal, setIsEditingTotal] = useState(false);
  const [isEditingPercentage, setIsEditingPercentage] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editName, setEditName] = useState(line.name);
  const [editQuantity, setEditQuantity] = useState((line.quantity || 0).toString());
  const [editUnitPrice, setEditUnitPrice] = useState((line.unit_price || 0).toString());
  const [editCurrency, setEditCurrency] = useState(line.currency || "UF");
  const [editUnit, setEditUnit] = useState(line.unit_type || "m2");
  const [editTotal, setEditTotal] = useState("");
  const [editPercentage, setEditPercentage] = useState((line.calc_percentage || 0).toString());
  const [editTotalCurrency, setEditTotalCurrency] = useState<"UF" | "CLP">("UF");
  const {
    formatUF,
    formatCLP,
    convertUFToPesos,
    ufValue
  } = useBudgetContext();
  
  // Use template prices from parent prop instead of fetching individually
  const templateUnitPrice = line.template_line_id ? (externalTemplatePricesMap[line.id] ?? null) : null;
  const templatePricesMap = externalTemplatePricesMap;

  const descendantCount = countDescendants(line);

  const hasChildren = line.children && line.children.length > 0;
  const isParent = hasChildren;
  const isCalcPercentage = line.calc_type === "percentage";

  // For percentage lines, find source line name from allLines
  const calcSourceName = useMemo(() => {
    if (!isCalcPercentage || !line.calc_source_line_id) return null;
    const source = linesMap.get(line.calc_source_line_id);
    return source ? source.name : null;
  }, [isCalcPercentage, line.calc_source_line_id, linesMap]);

  // Calculate subtotal of children recursively (for parent lines) using template prices when available
  const calculateChildrenSubtotal = (children: BudgetLine[]): number => {
    return children.reduce((sum, child) => {
      if (child.children && child.children.length > 0) {
        const childSubtotal = calculateChildrenSubtotal(child.children);
        const childMultiplier = child.quantity || 1;
        return sum + (childSubtotal * childMultiplier);
      }
      // Leaf: qty * price (prefer local unit_price, fallback to template)
      const qty = child.quantity || 0;
      const localPrice = child.unit_price || 0;
      const tplPrice = templatePricesMap[child.id] ?? 0;
      const price = localPrice > 0 ? localPrice : tplPrice;
      if (qty <= 0 || price <= 0) return sum;
      const leafTotal = qty * price;
      // Convert CLP to UF if needed
      if (child.currency === "CLP" && ufValue > 0) {
        return sum + (leafTotal / ufValue);
      }
      return sum + leafTotal;
    }, 0);
  };

  // For leaf lines: use amount_uf (already = qty * unit_price)
  const getLeafAmount = (): number => {
    const qty = line.quantity || 0;
    const localPrice = line.unit_price || 0;
    const price = localPrice > 0 ? localPrice : (templateUnitPrice ?? 0);
    if (qty <= 0 || price <= 0) return 0;
    return qty * price;
  };

  // Calculate subtotal from a line's children using their stored amount_uf (for cross-line calculations)
  const calculateStoredSubtotal = (children: BudgetLine[]): number => {
    return children.reduce((sum, child) => {
      if (child.children && child.children.length > 0) {
        const childSub = calculateStoredSubtotal(child.children);
        const mult = child.quantity || 1;
        return sum + (childSub * mult);
      }
      return sum + (child.amount_uf || 0);
    }, 0);
  };

  // For parents: subtotal * multiplier
  const childrenSubtotal = isParent ? calculateChildrenSubtotal(line.children!) : 0;
  const multiplier = line.quantity || 1;
  const parentTotal = childrenSubtotal * multiplier;

  // For percentage lines (Gastos Generales, Utilidades): compute live from source line's children sum,
  // so the displayed amount stays in sync with edits to children — NOT based on source's totalized display.
  const livePercentageAmount = useMemo(() => {
    if (!isCalcPercentage) return 0;
    const pct = line.calc_percentage || 0;
    if (!line.calc_source_line_id) return line.amount_uf || 0;
    const sourceLine = linesMap.get(line.calc_source_line_id);
    if (!sourceLine) return line.amount_uf || 0;
    let sourceBase = 0;
    if (sourceLine.children && sourceLine.children.length > 0) {
      const sub = calculateStoredSubtotal(sourceLine.children);
      const srcMult = sourceLine.quantity || 1;
      sourceBase = sub * srcMult;
    } else {
      sourceBase = sourceLine.amount_uf || 0;
    }
    return (sourceBase * pct) / 100;
  }, [isCalcPercentage, line.calc_source_line_id, line.calc_percentage, line.amount_uf, linesMap]);

  const calculatedAmount = isCalcPercentage ? livePercentageAmount : (isParent ? parentTotal : getLeafAmount());

  // For parent lines: include percentage surcharges (Gastos Generales, Utilidades) that reference this line
  // Always compute live when surcharge has a source — including pct === 0 → contributes 0
  const calculatedAmountWithSurcharges = useMemo(() => {
    if (!isParent || !linesMap) return calculatedAmount;
    let surcharges = 0;
    linesMap.forEach((l) => {
      if (l.calc_type === "percentage" && l.calc_source_line_id === line.id) {
        const pct = l.calc_percentage || 0;
        surcharges += (calculatedAmount * pct) / 100;
      }
    });
    return calculatedAmount + surcharges;
  }, [isParent, linesMap, line.id, calculatedAmount]);

  // Calculate amount only if both quantity and price are > 0
  const calculateLineAmount = (qty: number, price: number, currency: string): number => {
    if (qty <= 0 || price <= 0) return 0;
    let amountUf = qty * price;
    if (currency === "CLP" && ufValue > 0) {
      amountUf = amountUf / ufValue;
    }
    return amountUf;
  };

  // Save quantity on blur or Enter
  const handleSaveQuantity = () => {
    if (readOnly) return;
    const qty = parseFloat(editQuantity) || 0;
    if (qty === (line.quantity || 0)) {
      setIsEditingQuantity(false);
      return;
    }
    // Use effective price: local if set, else template
    const localPrice = line.unit_price || 0;
    const effectivePrice = localPrice > 0 ? localPrice : (templateUnitPrice ?? 0);
    const currency = line.currency || "UF";
    const amountUf = calculateLineAmount(qty, effectivePrice, currency);
    onUpdateLine(line.id, {
      quantity: qty,
      amount_uf: amountUf
    });
    setIsEditingQuantity(false);
  };

  const handleSaveUnit = (newUnit: string) => {
    if (readOnly) return;
    if (newUnit !== line.unit_type) {
      onUpdateLine(line.id, { unit_type: newUnit });
    }
    setEditUnit(newUnit);
    setIsEditingUnit(false);
  };

  const handleSavePrice = () => {
    if (readOnly) return;
    const qty = line.quantity || 0;
    const price = parseFloat(editUnitPrice) || 0;
    const amountUf = calculateLineAmount(qty, price, editCurrency);
    onUpdateLine(line.id, {
      unit_price: price,
      currency: editCurrency,
      amount_uf: amountUf
    });
    setIsEditingPrice(false);
  };

  const handleSaveCurrency = (newCurrency: string) => {
    if (readOnly) return;
    if (newCurrency !== line.currency) {
      const qty = line.quantity || 0;
      const price = line.unit_price || 0;
      const amountUf = calculateLineAmount(qty, price, newCurrency);
      onUpdateLine(line.id, { currency: newCurrency, amount_uf: amountUf });
    }
    setEditCurrency(newCurrency);
    setIsEditingCurrency(false);
  };

  // Save total amount: back-calculate unit_price from total
  const handleSaveTotal = () => {
    if (readOnly) return;
    const totalVal = parseFloat(editTotal) || 0;
    const qty = line.quantity || 0;
    if (totalVal <= 0 || qty <= 0) {
      setIsEditingTotal(false);
      return;
    }
    // Convert total to same currency as line currency, then calc unit price
    const lineCurrency = line.currency || "UF";
    let totalInLineCurrency = totalVal;
    if (editTotalCurrency !== lineCurrency) {
      if (editTotalCurrency === "CLP" && lineCurrency === "UF" && ufValue > 0) {
        totalInLineCurrency = totalVal / ufValue;
      } else if (editTotalCurrency === "UF" && lineCurrency === "CLP" && ufValue > 0) {
        totalInLineCurrency = totalVal * ufValue;
      }
    }
    const newUnitPrice = totalInLineCurrency / qty;
    const amountUf = calculateLineAmount(qty, newUnitPrice, lineCurrency);
    onUpdateLine(line.id, {
      unit_price: newUnitPrice,
      amount_uf: amountUf,
    });
    setEditUnitPrice(newUnitPrice.toString());
    setIsEditingTotal(false);
  };

  const handleTotalKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSaveTotal();
    else if (e.key === "Escape") setIsEditingTotal(false);
  };

  const handleSupplierChange = (supplierId: string | null, supplierName: string | null) => {
    if (readOnly) return;
    onUpdateLine(line.id, { 
      supplier_id: supplierId,
      supplier_name: supplierName 
    });
  };

  const handleQuantityKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSaveQuantity();
    else if (e.key === "Escape") {
      setEditQuantity((line.quantity || 0).toString());
      setIsEditingQuantity(false);
    }
  };

  const handlePriceKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSavePrice();
    else if (e.key === "Escape") {
      setEditUnitPrice((line.unit_price || 0).toString());
      setIsEditingPrice(false);
    }
  };


  // Save percentage on blur or Enter for calc_type=percentage lines
  const handleSavePercentage = () => {
    if (readOnly) return;
    const parsed = parseFloat(editPercentage) || 0;
    if (parsed === (line.calc_percentage || 0)) {
      setIsEditingPercentage(false);
      return;
    }
    // Find source line subtotal using stored amount_uf values
    let sourceSubtotal = 0;
    if (line.calc_source_line_id) {
      const sourceLine = linesMap.get(line.calc_source_line_id) || null;
      if (sourceLine) {
        if (sourceLine.children && sourceLine.children.length > 0) {
          sourceSubtotal = calculateStoredSubtotal(sourceLine.children);
          const srcMult = sourceLine.quantity || 1;
          sourceSubtotal = sourceSubtotal * srcMult;
        } else {
          sourceSubtotal = sourceLine.amount_uf || 0;
        }
      }
    }
    const newAmountUf = (sourceSubtotal * parsed) / 100;
    onUpdateLine(line.id, { calc_percentage: parsed, amount_uf: newAmountUf });
    setIsEditingPercentage(false);
  };

  const handlePercentageKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSavePercentage();
    else if (e.key === "Escape") {
      setEditPercentage((line.calc_percentage || 0).toString());
      setIsEditingPercentage(false);
    }
  };

  const toggleStatus = () => {
    if (readOnly || !isAdmin) return;
    onUpdateLine(line.id, {
      status: line.status === "autorizado" ? "no_autorizado" : "autorizado"
    });
  };
  const isNotAuthorized = line.status === "no_autorizado";
  return <div>
      <div className={cn(
        "flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-accent/50 group transition-all duration-200",
        // Color hierarchy: parents darker than children
        level === 0 && hasChildren && "bg-muted/60",
        level === 0 && !hasChildren && "bg-muted/20",
        level === 1 && hasChildren && "bg-muted/50",
        level === 1 && !hasChildren && "bg-muted/15",
        level === 2 && hasChildren && "bg-muted/40",
        level === 2 && !hasChildren && "bg-muted/10",
        level >= 3 && hasChildren && "bg-muted/35",
        level >= 3 && !hasChildren && "bg-muted/5",
        !hasChildren && isNotAuthorized && "opacity-70 bg-yellow-50 dark:bg-yellow-950/20"
      )}>
        <button onClick={() => { if (onToggleExpand) onToggleExpand(line.id); else setLocalExpanded(!localExpanded); }} className="p-0.5 hover:bg-accent rounded" disabled={!hasChildren}>
          {hasChildren ? isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" /> : <div className="h-3.5 w-3.5" />}
        </button>

        {/* Line name - editable on double click, click to view details */}
        {isEditingName && !readOnly ? (
          <Input 
            type="text" 
            value={editName} 
            onChange={e => setEditName(e.target.value)} 
            onBlur={() => {
              if (editName.trim() !== line.name) {
                onUpdateLine(line.id, { name: editName.trim() || "Sin nombre" });
              }
              setIsEditingName(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (editName.trim() !== line.name) {
                  onUpdateLine(line.id, { name: editName.trim() || "Sin nombre" });
                }
                setIsEditingName(false);
              } else if (e.key === "Escape") {
                setEditName(line.name);
                setIsEditingName(false);
              }
            }}
            className="h-6 w-[280px] text-sm" 
            autoFocus
          />
        ) : (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                 <span 
                   className={cn(
                     "text-sm flex-shrink-0 w-[280px] min-w-[280px] max-w-[280px] truncate", 
                     level === 0 ? "font-semibold" : "font-medium",
                     !readOnly && "cursor-text hover:bg-accent/30 px-1 py-0.5 rounded"
                   )}
                   onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (!readOnly) {
                      setEditName(line.name);
                      setIsEditingName(true);
                    }
                  }}
                >
                  {line.name}
                </span>
              </TooltipTrigger>
              {level === 0 && isParent && superficieEdificada > 0 && (
                <span className="text-[10px] text-muted-foreground ml-2 flex-shrink-0 whitespace-nowrap">
                  | {formatUF(calculatedAmountWithSurcharges / superficieEdificada)} /m²
                  {" · "}
                  {formatCLP(convertUFToPesos(calculatedAmountWithSurcharges) / superficieEdificada)} /m²
                </span>
              )}
              <TooltipContent side="top">
                {!isParent && onViewLineDetails 
                  ? <>{line.name}<br/><span className="text-[10px]">Click para ver Solicitudes, OC y Facturas</span></>
                  : line.name
                }
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Percentage-calculated line display */}
        {isCalcPercentage && (
          <div className="flex items-center gap-2 flex-1">
            {isEditingPercentage && !readOnly ? (
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  value={editPercentage}
                  onChange={e => setEditPercentage(e.target.value)}
                  onBlur={handleSavePercentage}
                  onKeyDown={handlePercentageKeyDown}
                  className="h-6 w-16 text-xs"
                  autoFocus
                  min="0"
                  step="0.1"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            ) : (
              <Badge 
                variant="outline" 
                className={cn(
                  "text-[10px] px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 border-amber-300 text-amber-700 dark:text-amber-300 whitespace-nowrap",
                  !readOnly && "cursor-text hover:bg-amber-200 dark:hover:bg-amber-900/50"
                )}
                onDoubleClick={() => {
                  if (!readOnly) {
                    setEditPercentage((line.calc_percentage || 0).toString());
                    setIsEditingPercentage(true);
                  }
                }}
                title={!readOnly ? "Doble clic para editar porcentaje" : undefined}
              >
                <Percent className="h-3 w-3 mr-0.5" />
                {line.calc_percentage || 0}%
              </Badge>
            )}
            {calcSourceName && (
              <span className="text-xs text-muted-foreground">
                de "{calcSourceName}"
              </span>
            )}
          </div>
        )}

        {/* For non-parent lines: show quantity/unit, ×, and price inputs */}
        {!isParent && !isCalcPercentage && <>
          {/* Quantity + Unit block */}
          <div className="flex items-center gap-1 w-[140px] min-w-[140px] max-w-[140px] justify-end">
            {/* Quantity - editable on double click */}
            {isEditingQuantity && !readOnly ? (
              <Input 
                type="number" 
                value={editQuantity} 
                onChange={e => setEditQuantity(e.target.value)} 
                onBlur={handleSaveQuantity}
                onKeyDown={handleQuantityKeyDown}
                className="h-6 w-20 text-xs" 
                autoFocus
                min="0"
              />
            ) : (
              <span 
                className="text-xs font-mono bg-muted/30 px-1.5 py-0.5 rounded min-w-[50px] text-right cursor-text hover:bg-accent/50"
                onDoubleClick={() => !readOnly && setIsEditingQuantity(true)}
                title="Doble clic para editar"
              >
                {line.quantity || 0}
              </span>
            )}

            {/* Unit type - editable on double click */}
            {isEditingUnit && !readOnly ? (
              <Select value={editUnit} onValueChange={handleSaveUnit} open={true}>
                <SelectTrigger className="h-6 w-14 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="m2">m²</SelectItem>
                  <SelectItem value="mL">mL</SelectItem>
                  <SelectItem value="Un">Un</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <span 
                className="text-xs text-muted-foreground min-w-[24px] cursor-pointer hover:bg-accent/50 px-1 py-0.5 rounded"
                onDoubleClick={() => !readOnly && setIsEditingUnit(true)}
                title="Doble clic para editar"
              >
                {line.unit_type === "m2" ? "m²" : line.unit_type || "m²"}
              </span>
            )}
          </div>

          {/* × separator - fixed width column for alignment */}
          <span className="text-xs text-muted-foreground w-[16px] min-w-[16px] text-center flex-shrink-0">×</span>

          {/* Currency + Price block */}
          <div className="flex items-center gap-1 w-[180px] min-w-[180px] max-w-[180px]">
            {/* Currency - editable on double click */}
            {isEditingCurrency && !readOnly ? (
              <Select value={editCurrency} onValueChange={handleSaveCurrency} open={true}>
                <SelectTrigger className="h-6 w-16 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UF">UF/{line.unit_type || "m2"}</SelectItem>
                  <SelectItem value="CLP">$/{line.unit_type || "m2"}</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <span 
                className="text-xs text-muted-foreground cursor-pointer hover:bg-accent/50 px-0.5 py-0.5 rounded"
                onDoubleClick={() => !readOnly && setIsEditingCurrency(true)}
                title="Doble clic para editar"
              >
                {line.currency === "CLP" ? "$" : "UF"}/{line.unit_type || "m2"}
              </span>
            )}

            {/* Price - editable on double click */}
            {isEditingPrice && !readOnly ? (
              <Input 
                type="number" 
                value={editUnitPrice} 
                onChange={e => setEditUnitPrice(e.target.value)} 
                onBlur={handleSavePrice}
                onKeyDown={handlePriceKeyDown}
                className="h-6 w-20 text-xs" 
                autoFocus
                min="0"
                step="0.01"
              />
            ) : (
              <div className="flex flex-col items-end ml-auto">
                <span 
                  className={cn(
                    "text-xs font-mono px-1.5 py-0.5 rounded min-w-[70px] text-right cursor-text hover:bg-accent/50",
                    templateUnitPrice !== null ? "bg-primary/10" : "bg-muted/50"
                  )}
                  onDoubleClick={() => {
                    if (readOnly) return;
                    const localP = line.unit_price || 0;
                    const dp = localP > 0 ? localP : (templateUnitPrice ?? 0);
                    setEditUnitPrice(dp.toString());
                    setIsEditingPrice(true);
                  }}
                  title={templateUnitPrice !== null ? "Valor desde plantilla — Doble clic para editar" : "Doble clic para editar"}
                >
                  {(() => {
                    const localP = line.unit_price || 0;
                    const displayPrice = localP > 0 ? localP : (templateUnitPrice ?? 0);
                    return line.currency === "CLP" 
                      ? Math.round(displayPrice).toLocaleString("es-CL")
                      : displayPrice.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
                  })()}
                </span>
                {(() => {
                  const localP = line.unit_price || 0;
                  const displayPrice = localP > 0 ? localP : (templateUnitPrice ?? 0);
                  if (displayPrice <= 0 || ufValue <= 0) return null;
                  const lineCurrency = line.currency || "UF";
                  if (lineCurrency === "UF") {
                    return <span className="text-[9px] text-muted-foreground text-right w-full">$ {Math.round(displayPrice * ufValue).toLocaleString("es-CL")}</span>;
                  }
                  return <span className="text-[9px] text-muted-foreground text-right w-full">UF {(displayPrice / ufValue).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</span>;
                })()}
              </div>
            )}
          </div>
        </>}

        {/* Parent line with children: show multiplier and subtotal - only for level 1+ */}
        {isParent && level >= 1 && (
          <>
            <div className="flex items-center gap-2 flex-1">
              {/* Multiplier - editable on double click */}
              <span className="text-xs text-muted-foreground">×</span>
              {isEditingQuantity && !readOnly ? (
                <Input 
                  type="number" 
                  value={editQuantity} 
                  onChange={e => setEditQuantity(e.target.value)} 
                  onBlur={handleSaveQuantity}
                  onKeyDown={handleQuantityKeyDown}
                  className="h-6 w-12 text-xs" 
                  autoFocus
                  min="1"
                />
              ) : (
                <span 
                  className="text-xs font-mono bg-muted/30 px-1.5 py-0.5 rounded min-w-[30px] text-center cursor-text hover:bg-accent/50"
                  onDoubleClick={() => !readOnly && setIsEditingQuantity(true)}
                  title="Doble clic para editar"
                >
                  {multiplier}
                </span>
              )}
              <span className="text-xs text-muted-foreground">unidades</span>
            </div>
            
            {/* Total with multiplier */}
            <div className="text-xs font-mono bg-primary/10 px-2 py-0.5 rounded font-semibold">
              = UF {parentTotal.toLocaleString("es-CL", { minimumFractionDigits: 2 })}
            </div>
            
            {/* Subtotal Unitario on two lines */}
            <div className="text-xs text-muted-foreground flex flex-col">
              <span>Subtotal Unitario:</span>
              <span>UF {childrenSubtotal.toLocaleString("es-CL", { minimumFractionDigits: 2 })}</span>
            </div>
          </>
        )}

        {/* Totals and status */}
        <div className="flex items-center mx-[3px] gap-[50px] text-destructive ml-auto flex-shrink-0">
          <span className="text-xs text-right font-sans font-medium whitespace-nowrap min-w-[80px]">
            {(() => {
              if (isCalcPercentage) return formatUF(calculatedAmount);
              const qty = line.quantity || 0;
              const localP = line.unit_price || 0;
              const price = localP > 0 ? localP : (templateUnitPrice ?? 0);
              const lineTotal = qty * price;
              return formatUF(isParent ? calculatedAmountWithSurcharges : (line.currency === "CLP" && ufValue > 0 ? lineTotal / ufValue : lineTotal));
            })()}
          </span>
          <span className="text-[12px] text-muted-foreground font-mono whitespace-nowrap min-w-[100px] text-right">
            {(() => {
              if (isCalcPercentage) return formatCLP(convertUFToPesos(calculatedAmount));
              if (!isParent && line.currency === "CLP") {
                const qty = line.quantity || 0;
                const localP = line.unit_price || 0;
                const price = localP > 0 ? localP : (templateUnitPrice ?? 0);
                return formatCLP(qty * price);
              }
              return formatCLP(convertUFToPesos(calculatedAmountWithSurcharges));
            })()}
          </span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant={line.status === "autorizado" ? "default" : "secondary"} className={cn("text-[10px] px-2.5 py-0 whitespace-nowrap", isAdmin && "cursor-pointer", line.status === "autorizado" && "bg-green-500 hover:bg-green-600", line.status === "no_autorizado" && "bg-yellow-500 hover:bg-yellow-600 text-white")} onClick={toggleStatus}>
                  {line.status === "autorizado" ? "Autorizado" : "No Autorizado"}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                {!isAdmin ? "Solo administradores pueden cambiar el estado" : line.status === "no_autorizado" ? "Este ítem se arrastrará al año siguiente hasta que sea autorizado o eliminado" : "Click para cambiar estado"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {isNotAuthorized && !compactView && <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <ArrowRight className="h-3 w-3 text-yellow-600" />
                </TooltipTrigger>
                <TooltipContent>Se arrastrará al próximo año</TooltipContent>
              </Tooltip>
            </TooltipProvider>}
          
          {/* View details button - for leaf lines */}
          {!isParent && !readOnly && onViewLineDetails && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onViewLineDetails(line.id, line.name)}
                    className="h-6 px-2 text-[10px] border-muted-foreground/30 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <FileText className="h-3 w-3 mr-1" />
                    Ver OC/Fact.
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Ver Órdenes de Compra y Facturas</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Supplier dropdown - for all lines (parent and leaf) */}
          {!readOnly && (
            <SupplierSelect
              value={line.supplier_id || null}
              onChange={handleSupplierChange}
              templateLineId={line.template_line_id}
              categoryId={line.category_id || parentCategoryId}
              disabled={readOnly}
            />
          )}
          {readOnly && !compactView && line.supplier_name && (
            <span className="text-xs bg-muted/30 px-1.5 py-0.5 rounded truncate max-w-[140px]">
              {line.supplier_name}
            </span>
          )}
          
          {/* OC Request, OC and Invoice buttons - only for authorized leaf lines */}
          {!isParent && line.status === "autorizado" && !readOnly && (
            <div className="flex items-center gap-1 ml-2">
              {onCreateOCRequest && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => onCreateOCRequest(line.id, line.name)} 
                        className="h-6 px-2 text-[10px] border-purple-300 text-purple-600 hover:bg-purple-50 hover:text-purple-700"
                      >
                        <ClipboardList className="h-3 w-3 mr-1" />
                        Solicitud
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Crear Solicitud de OC</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {onCreateOC && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => onCreateOC(line.id, line.name)} 
                        className="h-6 px-2 text-[10px] border-blue-300 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                      >
                        <FileText className="h-3 w-3 mr-1" />
                        OC
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Crear Orden de Compra</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {onCreateInvoice && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => onCreateInvoice(line.id, line.name)} 
                        className="h-6 px-2 text-[10px] border-green-300 text-green-600 hover:bg-green-50 hover:text-green-700"
                      >
                        <Receipt className="h-3 w-3 mr-1" />
                        Factura
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Registrar Factura</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          )}

          {!readOnly && <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5">
              <Button size="sm" variant="ghost" onClick={() => onAddLine(line.id)} className="h-6 w-6 p-0">
                <Plus className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowDeleteConfirm(true)} className="h-6 w-6 p-0 text-destructive">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>}
        </div>
      </div>

      {hasChildren && isExpanded && <BudgetLineTree lines={line.children!} level={level + 1} onAddLine={onAddLine} onUpdateLine={onUpdateLine} onDeleteLine={onDeleteLine} onCreateOC={onCreateOC} onCreateOCRequest={onCreateOCRequest} onCreateInvoice={onCreateInvoice} onViewLineDetails={onViewLineDetails} readOnly={readOnly} compactView={compactView} parentCategoryId={line.category_id || parentCategoryId} globalExpandState={globalExpandState} templatePricesMap={templatePricesMap} collapsedIds={collapsedIds} onToggleExpand={onToggleExpand} linesMap={linesMap} />}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirmar Eliminación
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>¿Estás seguro de que deseas eliminar la línea <strong>"{line.name}"</strong>?</p>
              {descendantCount > 0 && (
                <div className="mt-3 p-3 bg-destructive/10 border border-destructive/30 rounded-md">
                  <p className="text-destructive font-medium flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    ¡Atención! Esta línea tiene {descendantCount} sublínea{descendantCount > 1 ? 's' : ''} que también será{descendantCount > 1 ? 'n' : ''} eliminada{descendantCount > 1 ? 's' : ''}.
                  </p>
                </div>
              )}
              <p className="text-sm text-muted-foreground mt-2">
                Las líneas eliminadas se moverán a la papelera y podrás restaurarlas posteriormente.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDeleteLine(line.id);
                setShowDeleteConfirm(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Eliminar{descendantCount > 0 ? ` (${descendantCount + 1} líneas)` : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>;
};

const BudgetLineItem = React.memo(BudgetLineItemInner, (prev, next) => {
  if (prev.line !== next.line) return false;
  if (prev.level !== next.level) return false;
  if (prev.readOnly !== next.readOnly) return false;
  if (prev.globalExpandState !== next.globalExpandState) return false;
  // Compare only this item's collapsed state, not the full Set
  const prevCollapsed = prev.collapsedIds?.has(prev.line.id) ?? false;
  const nextCollapsed = next.collapsedIds?.has(next.line.id) ?? false;
  if (prevCollapsed !== nextCollapsed) return false;
  // For percentage lines and parent lines (which sum sibling surcharges), recalc when linesMap changes
  const isParentLine = !!(prev.line.children && prev.line.children.length > 0);
  if ((prev.line.calc_type === "percentage" || isParentLine) && prev.linesMap !== next.linesMap) return false;
  if (prev.parentCategoryId !== next.parentCategoryId) return false;
  if (prev.templatePricesMap !== next.templatePricesMap) return false;
  // Callbacks are stable (useCallback in parent), skip comparing
  return true;
});

// Helpers para cálculos
// Helper to get effective amount in UF - uses template price as fallback when unit_price is 0
const getEffectiveAmount = (item: BudgetLine, templatePricesMap?: Record<string, number>, ufValue?: number): number => {
  // Percentage-calculated lines use their stored amount_uf directly
  if (item.calc_type === "percentage") {
    return item.amount_uf || 0;
  }
  const qty = item.quantity || 0;
  const localPrice = item.unit_price || 0;
  const templatePrice = templatePricesMap && item.template_line_id ? (templatePricesMap[item.id] ?? 0) : 0;
  // Prefer local unit_price (user-edited), fallback to template price
  const price = localPrice > 0 ? localPrice : templatePrice;
  if (qty <= 0 || price <= 0) return 0;
  const total = qty * price;
  // Convert CLP to UF if needed
  if (item.currency === "CLP" && ufValue && ufValue > 0) {
    return total / ufValue;
  }
  return total;
};

export const calculateGrandTotal = (items: BudgetLine[], templatePricesMap?: Record<string, number>, ufValue?: number): number => {
  return items.reduce((sum, item) => {
    if (item.children && item.children.length > 0) {
      return sum + calculateGrandTotal(item.children, templatePricesMap, ufValue);
    }
    return sum + getEffectiveAmount(item, templatePricesMap, ufValue);
  }, 0);
};

export const calculateAuthorizedTotal = (items: BudgetLine[], templatePricesMap?: Record<string, number>, ufValue?: number): number => {
  return items.reduce((sum, item) => {
    if (item.children && item.children.length > 0) {
      return sum + calculateAuthorizedTotal(item.children, templatePricesMap, ufValue);
    }
    return item.status === "autorizado" ? sum + getEffectiveAmount(item, templatePricesMap, ufValue) : sum;
  }, 0);
};
export const calculateUnauthorizedTotal = (items: BudgetLine[], templatePricesMap?: Record<string, number>, ufValue?: number): number => {
  return items.reduce((sum, item) => {
    if (item.children && item.children.length > 0) {
      return sum + calculateUnauthorizedTotal(item.children, templatePricesMap, ufValue);
    }
    return item.status === "no_autorizado" ? sum + getEffectiveAmount(item, templatePricesMap, ufValue) : sum;
  }, 0);
};
export const getUnauthorizedLines = (items: BudgetLine[]): BudgetLine[] => {
  const result: BudgetLine[] = [];
  items.forEach(item => {
    if (item.status === "no_autorizado") {
      result.push(item);
    }
    if (item.children && item.children.length > 0) {
      result.push(...getUnauthorizedLines(item.children));
    }
  });
  return result;
};

// Obtener todos los IDs de descendientes (hijos, nietos, etc.)
export const getAllDescendantIds = (items: BudgetLine[], targetId: string): string[] => {
  const result: string[] = [];
  const findAndCollectDescendants = (children: BudgetLine[]): boolean => {
    for (const item of children) {
      if (item.id === targetId) {
        // Found the target, collect all its descendants
        collectAllIds(item.children || [], result);
        return true;
      }
      if (item.children && item.children.length > 0) {
        if (findAndCollectDescendants(item.children)) {
          return true;
        }
      }
    }
    return false;
  };
  const collectAllIds = (children: BudgetLine[], ids: string[]) => {
    children.forEach(child => {
      ids.push(child.id);
      if (child.children && child.children.length > 0) {
        collectAllIds(child.children, ids);
      }
    });
  };
  findAndCollectDescendants(items);
  return result;
};

// Verificar si una línea tiene hijos
export const hasDescendants = (items: BudgetLine[], targetId: string): boolean => {
  const findItem = (children: BudgetLine[]): BudgetLine | null => {
    for (const item of children) {
      if (item.id === targetId) {
        return item;
      }
      if (item.children && item.children.length > 0) {
        const found = findItem(item.children);
        if (found) return found;
      }
    }
    return null;
  };
  const item = findItem(items);
  return item !== null && item.children !== undefined && item.children.length > 0;
};