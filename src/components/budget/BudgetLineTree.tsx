import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { ChevronRight, ChevronDown, Plus, Trash2, ArrowRight, FileText, Receipt, ClipboardList, AlertTriangle, Percent, PlusCircle, MinusCircle, Check, CornerDownRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useBudgetContext } from "./BudgetContext";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SupplierSelect } from "@/components/suppliers/SupplierSelect";
import { useBudgetProgressStatuses, getProgressColorClass } from "@/hooks/useBudgetProgressStatuses";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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

/**
 * Parse a user-entered numeric string supporting Chilean and international formats.
 * Handles thousands separators (`.` or `,`) and decimal separators (`.` or `,`).
 * The LAST occurring separator is treated as decimal only when followed by 1–3 digits
 * AND it is the only separator of its type after a different separator (heuristic).
 *
 * Examples:
 *   "1.500.000"  -> 1500000     (Chilean thousands)
 *   "1,500,000"  -> 1500000     (international thousands)
 *   "1500,50"    -> 1500.5      (Chilean decimal)
 *   "1500.50"    -> 1500.5      (international decimal)
 *   "1.500,75"   -> 1500.75     (Chilean mixed)
 *   "1,500.75"   -> 1500.75     (international mixed)
 *   "0.123"      -> 0.123       (small decimal)
 */
export const parseLocalizedNumber = (input: string): number => {
  if (input == null) return NaN;
  const cleaned = String(input).trim().replace(/[^\d.,-]/g, "");
  if (!cleaned) return NaN;

  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");

  let normalized = cleaned;

  if (lastDot === -1 && lastComma === -1) {
    // pure integer
    normalized = cleaned;
  } else if (lastDot >= 0 && lastComma >= 0) {
    // both present: the rightmost is the decimal separator
    if (lastComma > lastDot) {
      // comma is decimal, dots are thousands
      normalized = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      // dot is decimal, commas are thousands
      normalized = cleaned.replace(/,/g, "");
    }
  } else {
    // only one type of separator
    const sep = lastDot >= 0 ? "." : ",";
    const occurrences = cleaned.split(sep).length - 1;
    const tail = cleaned.substring((lastDot >= 0 ? lastDot : lastComma) + 1);
    const isDecimal = occurrences === 1 && tail.length >= 1 && tail.length <= 3 && /^\d+$/.test(tail);
    if (isDecimal) {
      normalized = sep === "," ? cleaned.replace(",", ".") : cleaned;
    } else {
      // treat all as thousands
      normalized = cleaned.replace(new RegExp(`\\${sep}`, "g"), "");
    }
  }

  const n = parseFloat(normalized);
  return isNaN(n) ? NaN : n;
};

// Maximum sanity threshold for amounts in UF (anything above is treated as corrupt data).
export const MAX_REASONABLE_UF = 1e8;

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
  progress_status_id?: string | null;
  is_surcharge?: boolean;
  surcharge_parent_line_id?: string | null;
  surcharge_reason?: string | null;
  merged_into_line_id?: string | null;
  original_amount_uf?: number | null;
  is_ghost?: boolean;
  moved_to_line_id?: string | null;
  moved_at?: string | null;
  moved_by?: string | null;
  children?: BudgetLine[];
}

const ProgressStatusBadge = ({ lineId, currentStatusId, readOnly, isParent }: { lineId: string; currentStatusId?: string | null; readOnly?: boolean; isParent?: boolean }) => {
  const { statuses, reload } = useBudgetProgressStatuses();
  const [open, setOpen] = useState(false);
  const [localId, setLocalId] = useState<string | null>(currentStatusId ?? null);
  useEffect(() => { setLocalId(currentStatusId ?? null); }, [currentStatusId]);

  if (isParent) return null;
  const current = statuses.find(s => s.id === localId);
  const selectable = statuses.filter(s => s.is_selectable);

  const handleChange = async (newId: string | null) => {
    setLocalId(newId);
    setOpen(false);
    const { error } = await (supabase as any)
      .from("budget_lines")
      .update({ progress_status_id: newId })
      .eq("id", lineId);
    if (error) { toast.error("Error al cambiar estado"); setLocalId(currentStatusId ?? null); }
    else toast.success("Estado actualizado");
  };

  const badge = (
    <Badge className={cn("text-[10px] px-2 py-0 whitespace-nowrap", getProgressColorClass(current?.color), !readOnly && "cursor-pointer")}>
      {current?.name || "Sin estado"}
    </Badge>
  );

  if (readOnly) return badge;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><button type="button" onClick={e => e.stopPropagation()}>{badge}</button></PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="end">
        <div className="space-y-1">
          <button type="button" onClick={() => handleChange(null)} className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-accent text-muted-foreground">Sin estado</button>
          {selectable.map(s => (
            <button key={s.id} type="button" onClick={() => handleChange(s.id)} className="w-full text-left px-2 py-1.5 rounded hover:bg-accent">
              <Badge className={cn("text-[10px] px-2 py-0", getProgressColorClass(s.color))}>{s.name}</Badge>
            </button>
          ))}
          {selectable.length === 0 && <div className="text-xs text-muted-foreground px-2 py-1">No hay estados seleccionables</div>}
        </div>
      </PopoverContent>
    </Popover>
  );
};

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
  /** When true, show a checkbox at the start of every line for bulk move. */
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  /** Called after async operations that change line structure (e.g. surcharge add/authorize) */
  onReload?: () => void;
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
  selectionMode = false,
  selectedIds,
  onToggleSelect,
  onReload,
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
    // Hide surcharge requests (they render inline under their base line) and merged surcharges
    return [...lines]
      .filter(l => !l.is_surcharge && !l.merged_into_line_id)
      .sort((a, b) => {
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
        internalTransferSupplierIds={internalTransferSupplierIds}
        selectionMode={selectionMode}
        selectedIds={selectedIds}
        onToggleSelect={onToggleSelect}
        onReload={onReload}
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
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onReload?: () => void;
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
  selectionMode = false,
  selectedIds,
  onToggleSelect,
  onReload,
}: BudgetLineItemProps) => {
  const isSelected = !!(selectedIds && selectedIds.has(line.id));
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
  const [showSupplierPropagation, setShowSupplierPropagation] = useState(false);
  const [pendingSupplierChange, setPendingSupplierChange] = useState<{ supplierId: string | null; supplierName: string | null } | null>(null);
  const [showSurchargePanel, setShowSurchargePanel] = useState(false);
  const [surchargeType, setSurchargeType] = useState<"add" | "discount">("add");
  const [surchargeAmount, setSurchargeAmount] = useState("");
  const [surchargeCurrency, setSurchargeCurrency] = useState<"CLP" | "UF">("CLP");
  const [surchargeReason, setSurchargeReason] = useState("");
  const [savingSurcharge, setSavingSurcharge] = useState(false);
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
  const isSurchargeRow = !!line.is_surcharge;
  // Authorized lines are locked for non-admins. They can still request adicionales/descuentos
  // via the dedicated surcharge "+" button (kept accessible via originalReadOnly below).
  const isAuthorizedLockedForUser = line.status === "autorizado" && !isAdmin && !isSurchargeRow;
  const effectiveReadOnly = readOnly || isAuthorizedLockedForUser;

  // Pending surcharges for this line (sibling rows with surcharge_parent_line_id pointing here)
  const pendingSurcharges = useMemo(() => {
    if (isSurchargeRow || isParent) return [];
    const arr: BudgetLine[] = [];
    linesMap.forEach((l) => {
      if (l.is_surcharge && l.surcharge_parent_line_id === line.id && !l.merged_into_line_id) {
        arr.push(l);
      }
    });
    return arr;
  }, [linesMap, line.id, isSurchargeRow, isParent]);

  // Merged surcharges already folded into this line (for indicator)
  const mergedSurcharges = useMemo(() => {
    if (isSurchargeRow || isParent) return [];
    const arr: BudgetLine[] = [];
    linesMap.forEach((l) => {
      if (l.is_surcharge && l.merged_into_line_id === line.id) {
        arr.push(l);
      }
    });
    return arr;
  }, [linesMap, line.id, isSurchargeRow, isParent]);

  const mergedSurchargeTotalUf = useMemo(
    () => mergedSurcharges.reduce((sum, s) => sum + (s.amount_uf || 0), 0),
    [mergedSurcharges]
  );

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
    if (effectiveReadOnly) return;
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
    if (effectiveReadOnly) return;
    if (newUnit !== line.unit_type) {
      onUpdateLine(line.id, { unit_type: newUnit });
    }
    setEditUnit(newUnit);
    setIsEditingUnit(false);
  };

  const handleSavePrice = () => {
    if (effectiveReadOnly) return;
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
    if (effectiveReadOnly) return;
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
    if (effectiveReadOnly) return;
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
    if (effectiveReadOnly) return;
    const hasChildren = !!(line.children && line.children.length > 0);
    if (hasChildren) {
      // Ask user before propagating to descendants
      setPendingSupplierChange({ supplierId, supplierName });
      setShowSupplierPropagation(true);
      return;
    }
    onUpdateLine(line.id, {
      supplier_id: supplierId,
      supplier_name: supplierName,
    });
  };

  const collectDescendantIds = (l: BudgetLine): string[] => {
    if (!l.children || l.children.length === 0) return [];
    return l.children.flatMap(c => [c.id, ...collectDescendantIds(c)]);
  };

  const applySupplierChange = (propagate: boolean) => {
    if (!pendingSupplierChange) return;
    const { supplierId, supplierName } = pendingSupplierChange;
    onUpdateLine(line.id, { supplier_id: supplierId, supplier_name: supplierName });
    if (propagate) {
      const descendantIds = collectDescendantIds(line);
      descendantIds.forEach(id => {
        onUpdateLine(id, { supplier_id: supplierId, supplier_name: supplierName });
      });
    }
    setPendingSupplierChange(null);
    setShowSupplierPropagation(false);
  };

  const resetSurchargeForm = () => {
    setSurchargeAmount("");
    setSurchargeReason("");
    setSurchargeType("add");
    setSurchargeCurrency("CLP");
  };

  const handleSubmitSurcharge = async () => {
    if (savingSurcharge) return;
    const amt = parseFloat(surchargeAmount);
    if (!amt || amt <= 0) {
      toast.error("Ingrese un monto válido");
      return;
    }
    setSavingSurcharge(true);
    try {
      let amountUf = amt;
      if (surchargeCurrency === "CLP") {
        if (!ufValue || ufValue <= 0) throw new Error("Valor UF no disponible");
        amountUf = amt / ufValue;
      }
      const signedAmount = surchargeType === "discount" ? -amountUf : amountUf;
      const suffix = surchargeType === "discount" ? " (Descuento)" : " (Adicional)";
      const { error } = await (supabase as any).from("budget_lines").insert({
        budget_id: line.budget_id,
        parent_id: line.parent_id,
        name: line.name + suffix,
        amount_uf: signedAmount,
        status: "no_autorizado",
        quantity: 1,
        unit_type: line.unit_type || "Un",
        currency: "UF",
        unit_price: signedAmount,
        supplier_id: line.supplier_id ?? null,
        supplier_name: line.supplier_name ?? null,
        category_id: line.category_id ?? null,
        is_surcharge: true,
        surcharge_parent_line_id: line.id,
        surcharge_reason: surchargeReason.trim() || null,
      });
      if (error) throw error;
      toast.success(surchargeType === "discount" ? "Descuento solicitado" : "Adicional solicitado");
      resetSurchargeForm();
      setShowSurchargePanel(false);
      onReload?.();
    } catch (err: any) {
      toast.error(err?.message || "Error al solicitar adicional");
    } finally {
      setSavingSurcharge(false);
    }
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
    if (effectiveReadOnly) return;
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

  // Ghost placeholder: line was moved elsewhere; show a non-editable marker at the original position.
  if (line.is_ghost) {
    // Build readable destination path by walking up from the moved-to line via linesMap
    const buildPath = (id: string | null | undefined): string => {
      if (!id) return "—";
      const segments: string[] = [];
      let cursor: BudgetLine | undefined = linesMap.get(id);
      let safety = 0;
      while (cursor && safety < 50) {
        segments.unshift(cursor.name);
        cursor = cursor.parent_id ? linesMap.get(cursor.parent_id) : undefined;
        safety++;
      }
      return segments.length ? segments.join(" › ") : "(destino eliminado)";
    };
    const destinationPath = buildPath(line.moved_to_line_id);

    return (
      <div>
        <div
          className={cn(
            "flex items-center gap-2 py-1.5 px-2 rounded-md border border-dashed border-muted-foreground/30 bg-muted/10 opacity-60 italic",
            level === 0 && "ml-0",
          )}
        >
          <div className="h-3.5 w-3.5 flex-shrink-0" />
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-sm flex-shrink-0 max-w-[280px] truncate text-muted-foreground line-through">
            {line.name}
          </span>
          <span className="text-xs text-muted-foreground truncate">
            Movida a: <span className="font-medium not-italic">{destinationPath}</span>
          </span>
          {!effectiveReadOnly && isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-6 px-2 text-[10px] text-muted-foreground hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); onDeleteLine(line.id); }}
              title="Eliminar marca de movimiento"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  return <div>
      <div
        onClick={selectionMode ? (e) => {
          // Ignore clicks on interactive children (inputs, buttons, dropdowns, etc.)
          const target = e.target as HTMLElement;
          if (target.closest('button, a, input, textarea, select, [role="button"], [role="checkbox"], [role="combobox"], [role="menuitem"], [data-no-select]')) return;
          e.preventDefault();
          e.stopPropagation();
          onToggleSelect?.(line.id);
        } : undefined}
        className={cn(
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
        !hasChildren && isNotAuthorized && "opacity-70 bg-yellow-50 dark:bg-yellow-950/20",
        selectionMode && "cursor-pointer select-none",
        // Selection styles last so they win precedence
        selectionMode && isSelected && "!bg-primary/20 border-l-4 border-primary font-medium shadow-sm ring-1 ring-primary/40"
      )}>
        {selectionMode && (
          <div
            aria-label={`Seleccionar ${line.name}`}
            className={cn(
              "h-5 w-5 flex-shrink-0 rounded border-2 flex items-center justify-center transition-colors pointer-events-none",
              isSelected
                ? "bg-primary border-primary text-primary-foreground"
                : "bg-background border-muted-foreground/40"
            )}
          >
            {isSelected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
          </div>
        )}
        <button data-no-select onClick={(e) => { e.stopPropagation(); if (onToggleExpand) onToggleExpand(line.id); else setLocalExpanded(!localExpanded); }} className="p-0.5 hover:bg-accent rounded" disabled={!hasChildren}>
          {hasChildren ? isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" /> : <div className="h-3.5 w-3.5" />}
        </button>

        {/* Line name - editable on double click, click to view details */}
        {isEditingName && !effectiveReadOnly ? (
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
                     !effectiveReadOnly && "cursor-text hover:bg-accent/30 px-1 py-0.5 rounded"
                   )}
                   onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (!effectiveReadOnly) {
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
            {isEditingPercentage && !effectiveReadOnly ? (
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
                  !effectiveReadOnly && "cursor-text hover:bg-amber-200 dark:hover:bg-amber-900/50"
                )}
                onDoubleClick={() => {
                  if (!effectiveReadOnly) {
                    setEditPercentage((line.calc_percentage || 0).toString());
                    setIsEditingPercentage(true);
                  }
                }}
                title={!effectiveReadOnly ? "Doble clic para editar porcentaje" : undefined}
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
            {isEditingQuantity && !effectiveReadOnly ? (
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
                onDoubleClick={() => !effectiveReadOnly && setIsEditingQuantity(true)}
                title="Doble clic para editar"
              >
                {line.quantity || 0}
              </span>
            )}

            {/* Unit type - editable on double click */}
            {isEditingUnit && !effectiveReadOnly ? (
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
                onDoubleClick={() => !effectiveReadOnly && setIsEditingUnit(true)}
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
            {isEditingCurrency && !effectiveReadOnly ? (
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
                onDoubleClick={() => !effectiveReadOnly && setIsEditingCurrency(true)}
                title="Doble clic para editar"
              >
                {line.currency === "CLP" ? "$" : "UF"}/{line.unit_type || "m2"}
              </span>
            )}

            {/* Price - editable on double click */}
            {isEditingPrice && !effectiveReadOnly ? (
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
                    if (effectiveReadOnly) return;
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
              {isEditingQuantity && !effectiveReadOnly ? (
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
                  onDoubleClick={() => !effectiveReadOnly && setIsEditingQuantity(true)}
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
          {(
            (!isParent && mergedSurcharges.length > 0) ||
            (!isParent && !isSurchargeRow && line.status === "autorizado" && !effectiveReadOnly)
          ) && (
            <div className="flex flex-col items-center gap-0.5">
              {!isParent && mergedSurcharges.length > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="p-0.5 hover:bg-accent rounded"
                      title="Ver desglose original + adicionales"
                    >
                      <PlusCircle className="h-3.5 w-3.5 text-green-600" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-96 p-0">
                    <SurchargeBreakdownPopover
                      baseLine={line}
                      mergedSurcharges={mergedSurcharges}
                      ufValue={ufValue}
                      isAdmin={isAdmin}
                      readOnly={effectiveReadOnly}
                      onUpdateLine={onUpdateLine}
                      onDeleteLine={onDeleteLine}
                    />
                  </PopoverContent>
                </Popover>
              )}
              {!isParent && !isSurchargeRow && line.status === "autorizado" && !readOnly && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={(e) => { e.stopPropagation(); setShowSurchargePanel(v => !v); }}
                        className="h-5 w-5 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                      >
                        <PlusCircle className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Solicitar adicional o descuento</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          )}
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
          {!isParent && !effectiveReadOnly && onViewLineDetails && (
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
          {!effectiveReadOnly && (
            <SupplierSelect
              value={line.supplier_id || null}
              onChange={handleSupplierChange}
              templateLineId={line.template_line_id}
              categoryId={line.category_id || parentCategoryId}
              disabled={effectiveReadOnly}
            />
          )}
          {effectiveReadOnly && !compactView && line.supplier_name && (
            <span className="text-xs bg-muted/30 px-1.5 py-0.5 rounded truncate max-w-[140px]">
              {line.supplier_name}
            </span>
          )}
          {isInternalTransfer && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary text-primary whitespace-nowrap">
              Traslado
            </Badge>
          )}

          {/* Progress status badge - selectable for leaf lines */}
          {!isParent && !isInternalTransfer && (
            <ProgressStatusBadge
              lineId={line.id}
              currentStatusId={line.progress_status_id}
              readOnly={effectiveReadOnly}
              isParent={isParent}
            />
          )}

          {/* OC Request, OC and Invoice buttons - only for authorized leaf lines (not for internal transfers) */}
          {!isParent && line.status === "autorizado" && !effectiveReadOnly && !isInternalTransfer && (
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

          {!effectiveReadOnly && <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5">
              <Button size="sm" variant="ghost" onClick={() => onAddLine(line.id)} className="h-6 w-6 p-0">
                <Plus className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowDeleteConfirm(true)} className="h-6 w-6 p-0 text-destructive">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>}
        </div>
      </div>

      {hasChildren && isExpanded && <BudgetLineTree lines={line.children!} level={level + 1} onAddLine={onAddLine} onUpdateLine={onUpdateLine} onDeleteLine={onDeleteLine} onCreateOC={onCreateOC} onCreateOCRequest={onCreateOCRequest} onCreateInvoice={onCreateInvoice} onViewLineDetails={onViewLineDetails} readOnly={readOnly} compactView={compactView} parentCategoryId={line.category_id || parentCategoryId} globalExpandState={globalExpandState} templatePricesMap={templatePricesMap} collapsedIds={collapsedIds} onToggleExpand={onToggleExpand} linesMap={linesMap} internalTransferSupplierIds={internalTransferSupplierIds} selectionMode={selectionMode} selectedIds={selectedIds} onToggleSelect={onToggleSelect} onReload={onReload} />}

      {/* Inline surcharge request panel */}
      {showSurchargePanel && !readOnly && !isParent && !isSurchargeRow && (
        <div className="ml-8 mt-1 mb-1 p-3 rounded-md border border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={surchargeType} onValueChange={(v: "add" | "discount") => setSurchargeType(v)}>
              <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="add">Adicional (+)</SelectItem>
                <SelectItem value="discount">Descuento (–)</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="Monto"
              value={surchargeAmount}
              onChange={(e) => setSurchargeAmount(e.target.value)}
              className="h-8 w-32 text-xs"
            />
            <Select value={surchargeCurrency} onValueChange={(v: "CLP" | "UF") => setSurchargeCurrency(v)}>
              <SelectTrigger className="h-8 w-20 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CLP">$</SelectItem>
                <SelectItem value="UF">UF</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="text"
              placeholder="Motivo (opcional)"
              value={surchargeReason}
              onChange={(e) => setSurchargeReason(e.target.value)}
              className="h-8 flex-1 min-w-[180px] text-xs"
            />
            <Button size="sm" onClick={handleSubmitSurcharge} disabled={savingSurcharge} className="h-8 text-xs">
              {savingSurcharge ? "Guardando..." : "Solicitar"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowSurchargePanel(false); resetSurchargeForm(); }} className="h-8 text-xs">
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Pending surcharge requests rendered inline under their base line */}
      {pendingSurcharges.length > 0 && (
        <div className="ml-8 mt-1 space-y-1">
          {pendingSurcharges.map((sl) => (
            <PendingSurchargeRow
              key={sl.id}
              line={sl}
              readOnly={readOnly}
              isAdmin={isAdmin}
              ufValue={ufValue}
              onUpdateLine={onUpdateLine}
              onDeleteLine={onDeleteLine}
            />
          ))}
        </div>
      )}

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
      {/* Supplier Propagation Confirmation Dialog */}
      <AlertDialog open={showSupplierPropagation} onOpenChange={(open) => {
        if (!open) {
          setShowSupplierPropagation(false);
          setPendingSupplierChange(null);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cambiar proveedor</AlertDialogTitle>
            <AlertDialogDescription>
              La línea <strong>"{line.name}"</strong> tiene {descendantCount} sublínea{descendantCount > 1 ? 's' : ''}.
              ¿Quieres aplicar el proveedor <strong>{pendingSupplierChange?.supplierName || 'seleccionado'}</strong> también a sus sublíneas?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowSupplierPropagation(false);
              setPendingSupplierChange(null);
            }}>Cancelar</AlertDialogCancel>
            <Button variant="outline" onClick={() => applySupplierChange(false)}>
              Solo esta línea
            </Button>
            <AlertDialogAction onClick={() => applySupplierChange(true)}>
              Aplicar a todas
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
  // Selection mode toggling must re-render to show/hide the checkbox immediately
  if (prev.selectionMode !== next.selectionMode) return false;
  // Re-render when this line's selected state changes
  const prevSelected = prev.selectedIds?.has(prev.line.id) ?? false;
  const nextSelected = next.selectedIds?.has(next.line.id) ?? false;
  if (prevSelected !== nextSelected) return false;
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
// Returns 0 if the line's supplier is an internal-transfer supplier (e.g. Grupo Planet),
// so internal transfers are excluded from budget totals.
const getEffectiveAmount = (
  item: BudgetLine,
  templatePricesMap?: Record<string, number>,
  ufValue?: number,
  internalTransferSupplierIds?: Set<string>,
): number => {
  // Ghost placeholders left at original location after a move — never count
  if (item.is_ghost) return 0;
  // Merged surcharges have already been folded into their base line — skip to avoid double count
  if (item.merged_into_line_id) return 0;
  if (item.supplier_id && internalTransferSupplierIds?.has(item.supplier_id)) {
    return 0;
  }
  // Percentage-calculated lines use their stored amount_uf directly
  if (item.calc_type === "percentage") {
    return item.amount_uf || 0;
  }
  // Surcharge requests store their own signed amount in amount_uf
  if (item.is_surcharge) {
    return item.amount_uf || 0;
  }
  const qty = item.quantity || 0;
  const localPrice = item.unit_price || 0;
  const templatePrice = templatePricesMap && item.template_line_id ? (templatePricesMap[item.id] ?? 0) : 0;
  const price = localPrice > 0 ? localPrice : templatePrice;
  if (qty <= 0 || price <= 0) return 0;
  const total = qty * price;
  if (item.currency === "CLP" && ufValue && ufValue > 0) {
    return total / ufValue;
  }
  return total;
};

export const calculateGrandTotal = (items: BudgetLine[], templatePricesMap?: Record<string, number>, ufValue?: number, internalTransferSupplierIds?: Set<string>): number => {
  return items.reduce((sum, item) => {
    if (item.children && item.children.length > 0) {
      return sum + calculateGrandTotal(item.children, templatePricesMap, ufValue, internalTransferSupplierIds);
    }
    return sum + getEffectiveAmount(item, templatePricesMap, ufValue, internalTransferSupplierIds);
  }, 0);
};

export const calculateAuthorizedTotal = (items: BudgetLine[], templatePricesMap?: Record<string, number>, ufValue?: number, internalTransferSupplierIds?: Set<string>): number => {
  return items.reduce((sum, item) => {
    if (item.children && item.children.length > 0) {
      return sum + calculateAuthorizedTotal(item.children, templatePricesMap, ufValue, internalTransferSupplierIds);
    }
    return item.status === "autorizado" ? sum + getEffectiveAmount(item, templatePricesMap, ufValue, internalTransferSupplierIds) : sum;
  }, 0);
};
export const calculateUnauthorizedTotal = (items: BudgetLine[], templatePricesMap?: Record<string, number>, ufValue?: number, internalTransferSupplierIds?: Set<string>): number => {
  return items.reduce((sum, item) => {
    if (item.children && item.children.length > 0) {
      return sum + calculateUnauthorizedTotal(item.children, templatePricesMap, ufValue, internalTransferSupplierIds);
    }
    return item.status === "no_autorizado" ? sum + getEffectiveAmount(item, templatePricesMap, ufValue, internalTransferSupplierIds) : sum;
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

// ============== Pending surcharge inline editable row ==============
interface PendingSurchargeRowProps {
  line: BudgetLine;
  readOnly?: boolean;
  isAdmin: boolean;
  ufValue: number;
  onUpdateLine: (id: string, updates: Partial<BudgetLine>) => void;
  onDeleteLine: (id: string) => void;
}

const PendingSurchargeRow = ({ line, readOnly, isAdmin, ufValue, onUpdateLine, onDeleteLine }: PendingSurchargeRowProps) => {
  const isAdd = (line.amount_uf || 0) >= 0;
  const sign = isAdd ? 1 : -1;
  const absUf = Math.abs(line.amount_uf || 0);

  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(line.name);
  const [editingReason, setEditingReason] = useState(false);
  const [reason, setReason] = useState(line.surcharge_reason || "");
  const [editingAmount, setEditingAmount] = useState(false);
  const [amountCurrency, setAmountCurrency] = useState<"UF" | "CLP">((line.currency as "UF" | "CLP") || "UF");
  const [amountValue, setAmountValue] = useState<string>(
    amountCurrency === "CLP" && ufValue > 0
      ? Math.round(absUf * ufValue).toString()
      : absUf.toString()
  );

  useEffect(() => { setName(line.name); }, [line.name]);
  useEffect(() => { setReason(line.surcharge_reason || ""); }, [line.surcharge_reason]);

  const formatUFLocal = (n: number) => `UF ${n.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatCLPLocal = (n: number) => `$ ${Math.round(n).toLocaleString("es-CL")}`;

  const commitName = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== line.name) {
      onUpdateLine(line.id, { name: trimmed });
    } else {
      setName(line.name);
    }
    setEditingName(false);
  };
  const commitReason = () => {
    if (reason !== (line.surcharge_reason || "")) {
      onUpdateLine(line.id, { surcharge_reason: reason || null } as any);
    }
    setEditingReason(false);
  };
  const commitAmount = () => {
    const raw = parseLocalizedNumber(amountValue);
    if (isNaN(raw) || raw < 0) {
      setEditingAmount(false);
      return;
    }
    let uf = raw;
    if (amountCurrency === "CLP") {
      if (!ufValue || ufValue <= 0) {
        toast.error("Valor UF no disponible. Reintente en unos segundos.");
        setEditingAmount(false);
        return;
      }
      uf = raw / ufValue;
    }
    if (uf > MAX_REASONABLE_UF) {
      toast.error(`Monto fuera de rango (UF ${uf.toExponential(2)}). Revise el valor ingresado.`);
      setEditingAmount(false);
      return;
    }
    const signed = sign * uf;
    onUpdateLine(line.id, { amount_uf: signed, currency: amountCurrency } as any);
    setEditingAmount(false);
  };

  return (
    <div className="flex items-center gap-2 py-1 px-2 rounded-md bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900/50 text-xs">
      {isAdd ? (
        <PlusCircle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
      ) : (
        <MinusCircle className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />
      )}

      {editingName && !readOnly ? (
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitName();
            else if (e.key === "Escape") { setName(line.name); setEditingName(false); }
          }}
          className="h-6 text-xs max-w-[280px]"
        />
      ) : (
        <span
          className={cn("font-medium truncate max-w-[280px]", !readOnly && "cursor-text hover:bg-accent/50 rounded px-1")}
          onDoubleClick={() => !readOnly && setEditingName(true)}
          title={readOnly ? line.name : "Doble clic para editar nombre"}
        >
          {line.name}
        </span>
      )}

      {editingReason && !readOnly ? (
        <Input
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onBlur={commitReason}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitReason();
            else if (e.key === "Escape") { setReason(line.surcharge_reason || ""); setEditingReason(false); }
          }}
          placeholder="Motivo (opcional)"
          className="h-6 text-xs max-w-[220px]"
        />
      ) : (
        <span
          className={cn("text-muted-foreground italic truncate max-w-[200px]", !readOnly && "cursor-text hover:bg-accent/50 rounded px-1")}
          onDoubleClick={() => !readOnly && setEditingReason(true)}
          title={readOnly ? "" : "Doble clic para editar motivo"}
        >
          {line.surcharge_reason ? `— ${line.surcharge_reason}` : (!readOnly ? "— (agregar motivo)" : "")}
        </span>
      )}

      {editingAmount && amountCurrency === "UF" && !readOnly ? (
        <Input
          autoFocus
          type="text"
          inputMode="decimal"
          value={amountValue}
          onChange={(e) => setAmountValue(e.target.value)}
          onBlur={commitAmount}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commitAmount(); }
            else if (e.key === "Escape") setEditingAmount(false);
          }}
          className="ml-auto h-6 text-xs w-24 font-mono"
        />
      ) : (
        <span
          className={cn("ml-auto font-mono whitespace-nowrap text-destructive", !readOnly && "cursor-text hover:bg-accent/50 rounded px-1")}
          onDoubleClick={() => {
            if (readOnly) return;
            setAmountCurrency("UF");
            setAmountValue(absUf.toString());
            setEditingAmount(true);
          }}
          title={readOnly ? "" : "Doble clic para editar monto en UF"}
        >
          {isAdd ? "+" : "−"} {formatUFLocal(absUf)}
        </span>
      )}

      {editingAmount && amountCurrency === "CLP" && !readOnly ? (
        <Input
          autoFocus
          type="text"
          inputMode="numeric"
          value={amountValue}
          onChange={(e) => setAmountValue(e.target.value)}
          onBlur={commitAmount}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commitAmount(); }
            else if (e.key === "Escape") setEditingAmount(false);
          }}
          className="h-6 text-xs w-28 font-mono"
        />
      ) : (
        <span
          className={cn("font-mono whitespace-nowrap text-muted-foreground", !readOnly && "cursor-text hover:bg-accent/50 rounded px-1")}
          onDoubleClick={() => {
            if (readOnly) return;
            setAmountCurrency("CLP");
            setAmountValue(Math.round(absUf * (ufValue || 0)).toString());
            setEditingAmount(true);
          }}
          title={readOnly ? "" : "Doble clic para editar monto en $"}
        >
          {isAdd ? "+" : "−"} {formatCLPLocal(absUf * (ufValue || 0))}
        </span>
      )}

      <Badge
        className={cn(
          "text-[10px] px-2 py-0 whitespace-nowrap bg-yellow-500 hover:bg-yellow-600 text-white",
          isAdmin && "cursor-pointer"
        )}
        onClick={() => {
          if (!isAdmin) return;
          onUpdateLine(line.id, { status: "autorizado" });
        }}
      >
        No Autorizado
      </Badge>

      {!readOnly && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onDeleteLine(line.id)}
          className="h-6 w-6 p-0 text-destructive"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
};

// ============== Surcharge breakdown popover (original + adicionales) ==============
interface SurchargeBreakdownPopoverProps {
  baseLine: BudgetLine;
  mergedSurcharges: BudgetLine[];
  ufValue: number;
  isAdmin: boolean;
  readOnly?: boolean;
  onUpdateLine: (id: string, updates: Partial<BudgetLine>) => void;
  onDeleteLine: (id: string) => void;
}

const SurchargeBreakdownPopover = ({
  baseLine,
  mergedSurcharges,
  ufValue,
  isAdmin,
  readOnly,
  onUpdateLine,
  onDeleteLine,
}: SurchargeBreakdownPopoverProps) => {
  const fmtCompact = (n: number) => n.toExponential(2).replace("e+", "·10^").replace("e-", "·10^-");
  const fmtUF = (n: number) =>
    Math.abs(n) > MAX_REASONABLE_UF
      ? `UF ${fmtCompact(n)}`
      : `UF ${n.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtCLP = (n: number) =>
    Math.abs(n) > MAX_REASONABLE_UF * (ufValue || 1)
      ? `$ ${fmtCompact(n)}`
      : `$ ${Math.round(n).toLocaleString("es-CL")}`;

  const qty = baseLine.quantity || 0;
  const price = baseLine.unit_price || 0;
  const rawLineTotal = qty * price;
  const lineCurrency = baseLine.currency || "UF";
  const originalUf = baseLine.original_amount_uf != null
    ? baseLine.original_amount_uf
    : (lineCurrency === "CLP" && ufValue > 0 ? rawLineTotal / ufValue : rawLineTotal);

  const surchargesTotalUf = mergedSurcharges.reduce((s, x) => s + (x.amount_uf || 0), 0);
  const totalUf = originalUf + surchargesTotalUf;

  const canEdit = isAdmin && !readOnly;
  const totalCorrupt = Math.abs(totalUf) > MAX_REASONABLE_UF;

  return (
    <div className="text-xs">
      <div className="px-3 py-2 border-b">
        <div className="font-semibold truncate">{baseLine.name}</div>
        <div className="text-muted-foreground text-[11px]">Desglose de monto</div>
      </div>

      <div className="px-3 py-2 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Original</span>
          <div className="text-right font-mono">
            <div>{fmtUF(originalUf)}</div>
            <div className="text-muted-foreground text-[11px]">{fmtCLP(originalUf * (ufValue || 0))}</div>
          </div>
        </div>

        <div className="border-t pt-1.5 space-y-1.5">
          <div className="text-muted-foreground text-[11px] font-medium">
            Adicionales ({mergedSurcharges.length})
          </div>
          {mergedSurcharges.map((s) => (
            <SurchargeBreakdownRow
              key={s.id}
              surcharge={s}
              ufValue={ufValue}
              canEdit={canEdit}
              onUpdateLine={onUpdateLine}
              onDeleteLine={onDeleteLine}
            />
          ))}
        </div>

        <div className="border-t pt-1.5 flex items-center justify-between gap-2 font-semibold">
          <span className="flex items-center gap-1">
            Total
            {totalCorrupt && (
              <span title="Hay adicionales con valores inconsistentes — revíselos">
                <AlertTriangle className="h-3 w-3 text-destructive" />
              </span>
            )}
          </span>
          <div className="text-right font-mono">
            <div>{fmtUF(totalUf)}</div>
            <div className="text-muted-foreground text-[11px] font-normal">{fmtCLP(totalUf * (ufValue || 0))}</div>
          </div>
        </div>
      </div>

      {!canEdit && (
        <div className="px-3 py-2 border-t text-[11px] text-muted-foreground">
          {readOnly ? "Solo lectura" : "Solo administradores pueden editar adicionales"}
        </div>
      )}
    </div>
  );
};

interface SurchargeBreakdownRowProps {
  surcharge: BudgetLine;
  ufValue: number;
  canEdit: boolean;
  onUpdateLine: (id: string, updates: Partial<BudgetLine>) => void;
  onDeleteLine: (id: string) => void;
}

const SurchargeBreakdownRow = ({ surcharge, ufValue, canEdit, onUpdateLine, onDeleteLine }: SurchargeBreakdownRowProps) => {
  const isAdd = (surcharge.amount_uf || 0) >= 0;
  const sign = isAdd ? 1 : -1;
  const absUf = Math.abs(surcharge.amount_uf || 0);
  const isCorrupt = absUf > MAX_REASONABLE_UF;
  const savedCurrency: "UF" | "CLP" = (surcharge.currency as "UF" | "CLP") || "UF";

  const [editingReason, setEditingReason] = useState(false);
  const [reason, setReason] = useState(surcharge.surcharge_reason || "");
  const [editingAmount, setEditingAmount] = useState(false);
  const [amountCurrency, setAmountCurrency] = useState<"UF" | "CLP">(savedCurrency);
  const [amountValue, setAmountValue] = useState<string>(
    savedCurrency === "CLP" && ufValue > 0 && !isCorrupt
      ? Math.round(absUf * ufValue).toString()
      : absUf.toString()
  );

  useEffect(() => { setReason(surcharge.surcharge_reason || ""); }, [surcharge.surcharge_reason]);

  const fmtUF = (n: number) => `UF ${n.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtCLP = (n: number) => `$ ${Math.round(n).toLocaleString("es-CL")}`;
  const fmtCompact = (n: number) => n.toExponential(2).replace("e+", "·10^").replace("e-", "·10^-");

  const commitReason = () => {
    if (reason !== (surcharge.surcharge_reason || "")) {
      onUpdateLine(surcharge.id, { surcharge_reason: reason || null } as any);
    }
    setEditingReason(false);
  };

  const commitAmount = () => {
    const raw = parseLocalizedNumber(amountValue);
    if (isNaN(raw) || raw < 0) {
      setEditingAmount(false);
      return;
    }
    let uf = raw;
    if (amountCurrency === "CLP") {
      if (!ufValue || ufValue <= 0) {
        toast.error("Valor UF no disponible. Reintente en unos segundos.");
        setEditingAmount(false);
        return;
      }
      uf = raw / ufValue;
    }
    if (uf > MAX_REASONABLE_UF) {
      toast.error(`Monto fuera de rango (UF ${uf.toExponential(2)}). Revise el valor ingresado.`);
      setEditingAmount(false);
      return;
    }
    onUpdateLine(surcharge.id, { amount_uf: sign * uf, currency: amountCurrency } as any);
    setEditingAmount(false);
  };

  const openEditor = () => {
    if (!canEdit) return;
    const initialCurrency: "UF" | "CLP" = savedCurrency;
    setAmountCurrency(initialCurrency);
    if (initialCurrency === "CLP" && ufValue > 0 && !isCorrupt) {
      setAmountValue(Math.round(absUf * ufValue).toString());
    } else {
      setAmountValue(absUf.toString());
    }
    setEditingAmount(true);
  };

  return (
    <div className="flex items-start gap-2 py-1 rounded hover:bg-accent/40 px-1">
      <div className="flex-shrink-0 mt-0.5">
        {isAdd ? <PlusCircle className="h-3 w-3 text-green-600" /> : <MinusCircle className="h-3 w-3 text-red-600" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="truncate font-medium flex items-center gap-1">
          {surcharge.name}
          {isCorrupt && (
            <span title="Valor inconsistente — revisar">
              <AlertTriangle className="h-3 w-3 text-destructive flex-shrink-0" />
            </span>
          )}
        </div>
        {editingReason && canEdit ? (
          <Input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onBlur={commitReason}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitReason(); }
              else if (e.key === "Escape") { setReason(surcharge.surcharge_reason || ""); setEditingReason(false); }
            }}
            placeholder="Motivo"
            className="h-6 text-xs mt-0.5"
          />
        ) : (
          <div
            className={cn("text-muted-foreground italic text-[11px] truncate", canEdit && "cursor-text hover:bg-accent/50 rounded px-1")}
            onDoubleClick={() => canEdit && setEditingReason(true)}
            title={canEdit ? "Doble clic para editar motivo" : ""}
          >
            {surcharge.surcharge_reason ? surcharge.surcharge_reason : (canEdit ? "(agregar motivo)" : "")}
          </div>
        )}
      </div>
      <div className="text-right font-mono flex-shrink-0">
        {editingAmount && canEdit ? (
          <div className="flex items-center gap-1">
            <Input
              autoFocus
              type="text"
              inputMode="decimal"
              value={amountValue}
              onChange={(e) => setAmountValue(e.target.value)}
              onBlur={commitAmount}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); commitAmount(); }
                else if (e.key === "Escape") setEditingAmount(false);
              }}
              className="h-6 text-xs w-24"
            />
            <Select
              value={amountCurrency}
              onValueChange={(v: "UF" | "CLP") => {
                // When switching currency in editor, convert the current entered value
                const raw = parseLocalizedNumber(amountValue);
                if (!isNaN(raw) && ufValue > 0) {
                  if (v === "CLP" && amountCurrency === "UF") {
                    setAmountValue(Math.round(raw * ufValue).toString());
                  } else if (v === "UF" && amountCurrency === "CLP") {
                    setAmountValue((raw / ufValue).toFixed(4));
                  }
                }
                setAmountCurrency(v);
              }}
            >
              <SelectTrigger className="h-6 w-14 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="UF">UF</SelectItem>
                <SelectItem value="CLP">$</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div
            className={cn(canEdit && "cursor-text hover:bg-accent/50 rounded px-1")}
            onDoubleClick={openEditor}
            title={canEdit ? "Doble clic para editar monto" : ""}
          >
            <div className={isAdd ? "text-green-700 dark:text-green-400" : "text-destructive"}>
              {isAdd ? "+" : "−"} {isCorrupt ? `UF ${fmtCompact(absUf)}` : fmtUF(absUf)}
            </div>
            <div className="text-muted-foreground text-[11px]">
              {isAdd ? "+" : "−"} {isCorrupt ? `$ ${fmtCompact(absUf * (ufValue || 0))}` : fmtCLP(absUf * (ufValue || 0))}
            </div>
          </div>
        )}
      </div>
      {canEdit && !editingAmount && !editingReason && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onDeleteLine(surcharge.id)}
          className="h-6 w-6 p-0 text-destructive flex-shrink-0"
          title="Eliminar adicional"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
};

