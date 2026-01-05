import { useState } from "react";
import { ChevronRight, ChevronDown, Plus, Trash2, ArrowRight, FileText, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useBudgetContext } from "./BudgetContext";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  children?: BudgetLine[];
}
interface BudgetLineTreeProps {
  lines: BudgetLine[];
  onAddLine: (parentId: string | null) => void;
  onUpdateLine: (id: string, data: Partial<BudgetLine>) => void;
  onDeleteLine: (id: string) => void;
  onCreateOC?: (budgetLineId: string, lineName: string) => void;
  onCreateInvoice?: (budgetLineId: string, lineName: string) => void;
  onViewLineDetails?: (budgetLineId: string, lineName: string) => void;
  level?: number;
  readOnly?: boolean;
}
export const BudgetLineTree = ({
  lines,
  onAddLine,
  onUpdateLine,
  onDeleteLine,
  onCreateOC,
  onCreateInvoice,
  onViewLineDetails,
  level = 0,
  readOnly = false
}: BudgetLineTreeProps) => {
  return <div className={cn("space-y-1", level > 0 && "ml-6 border-l border-border pl-4")}>
      {lines.map(line => <BudgetLineItem key={line.id} line={line} level={level} onAddLine={onAddLine} onUpdateLine={onUpdateLine} onDeleteLine={onDeleteLine} onCreateOC={onCreateOC} onCreateInvoice={onCreateInvoice} onViewLineDetails={onViewLineDetails} readOnly={readOnly} />)}
      {level === 0 && !readOnly && <Button variant="ghost" size="sm" onClick={() => onAddLine(null)} className="text-muted-foreground hover:text-foreground">
          <Plus className="h-4 w-4 mr-1" />
          Agregar línea madre
        </Button>}
    </div>;
};
interface BudgetLineItemProps {
  line: BudgetLine;
  level: number;
  onAddLine: (parentId: string | null) => void;
  onUpdateLine: (id: string, data: Partial<BudgetLine>) => void;
  onDeleteLine: (id: string) => void;
  onCreateOC?: (budgetLineId: string, lineName: string) => void;
  onCreateInvoice?: (budgetLineId: string, lineName: string) => void;
  onViewLineDetails?: (budgetLineId: string, lineName: string) => void;
  readOnly?: boolean;
}
const BudgetLineItem = ({
  line,
  level,
  onAddLine,
  onUpdateLine,
  onDeleteLine,
  onCreateOC,
  onCreateInvoice,
  onViewLineDetails,
  readOnly = false
}: BudgetLineItemProps) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isEditingQuantity, setIsEditingQuantity] = useState(false);
  const [isEditingUnit, setIsEditingUnit] = useState(false);
  const [isEditingPrice, setIsEditingPrice] = useState(false);
  const [isEditingCurrency, setIsEditingCurrency] = useState(false);
  const [editQuantity, setEditQuantity] = useState((line.quantity || 0).toString());
  const [editUnitPrice, setEditUnitPrice] = useState((line.unit_price || 0).toString());
  const [editCurrency, setEditCurrency] = useState(line.currency || "UF");
  const [editUnit, setEditUnit] = useState(line.unit_type || "m2");
  const {
    formatUF,
    formatCLP,
    convertUFToPesos,
    ufValue
  } = useBudgetContext();
  const hasChildren = line.children && line.children.length > 0;
  const isParent = hasChildren;

  // Calculate subtotal of children recursively (for parent lines)
  const calculateChildrenSubtotal = (children: BudgetLine[]): number => {
    return children.reduce((sum, child) => {
      if (child.children && child.children.length > 0) {
        // Child is a parent: get its total (subtotal * multiplier)
        const childSubtotal = calculateChildrenSubtotal(child.children);
        const childMultiplier = child.quantity || 1;
        return sum + (childSubtotal * childMultiplier);
      }
      // Leaf: qty * price
      const qty = child.quantity || 0;
      const price = child.unit_price || 0;
      if (qty <= 0 || price <= 0) return sum;
      return sum + (child.amount_uf || 0);
    }, 0);
  };

  // For leaf lines: show 0 if missing quantity or price
  const getLeafAmount = (): number => {
    const qty = line.quantity || 0;
    const price = line.unit_price || 0;
    if (qty <= 0 || price <= 0) return 0;
    return line.amount_uf || 0;
  };

  // For parents: subtotal * multiplier
  const childrenSubtotal = isParent ? calculateChildrenSubtotal(line.children!) : 0;
  const multiplier = line.quantity || 1;
  const parentTotal = childrenSubtotal * multiplier;
  const calculatedAmount = isParent ? parentTotal : getLeafAmount();

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
    const price = line.unit_price || 0;
    const currency = line.currency || "UF";
    const amountUf = calculateLineAmount(qty, price, currency);
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

  const toggleStatus = () => {
    if (readOnly) return;
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
        <button onClick={() => setIsExpanded(!isExpanded)} className="p-0.5 hover:bg-accent rounded" disabled={!hasChildren}>
          {hasChildren ? isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" /> : <div className="h-3.5 w-3.5" />}
        </button>

        {/* Line name - fixed width for alignment, clickeable para ver detalles */}
        <span 
          className={cn(
            "text-sm flex-shrink-0 min-w-[250px] cursor-pointer hover:text-primary hover:underline", 
            level === 0 ? "font-semibold" : "font-medium"
          )}
          onClick={() => onViewLineDetails?.(line.id, line.name)}
          title="Ver OC, Facturas y Notas de Crédito"
        >
          {line.name}
        </span>

        {/* For non-parent lines: show quantity/unit and price inputs - editable on double click */}
        {!isParent && <div className="flex items-center gap-1 min-w-[320px]">
            {/* Quantity - editable on double click */}
            {isEditingQuantity && !readOnly ? (
              <Input 
                type="number" 
                value={editQuantity} 
                onChange={e => setEditQuantity(e.target.value)} 
                onBlur={handleSaveQuantity}
                onKeyDown={handleQuantityKeyDown}
                className="h-6 w-14 text-xs" 
                autoFocus
                min="0"
              />
            ) : (
              <span 
                className="text-xs font-mono bg-muted/30 px-1.5 py-0.5 rounded min-w-[40px] text-center cursor-text hover:bg-accent/50"
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

            <span className="text-xs text-muted-foreground mx-0.5">×</span>

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
              <span 
                className="text-xs font-mono bg-muted/50 px-1.5 py-0.5 rounded min-w-[70px] text-center cursor-text hover:bg-accent/50"
                onDoubleClick={() => !readOnly && setIsEditingPrice(true)}
                title="Doble clic para editar"
              >
                {line.currency === "CLP" 
                  ? Math.round(line.unit_price || 0).toLocaleString("es-CL")
                  : (line.unit_price || 0).toLocaleString("es-CL", { minimumFractionDigits: 2 })
                }
              </span>
            )}

            {/* Calculated total - read only */}
            <span className="text-xs font-mono bg-primary/10 px-1.5 py-0.5 rounded min-w-[80px] text-center">
              = {line.currency === "CLP" ? "$" : "UF"} {((line.quantity || 0) * (line.unit_price || 0)).toLocaleString("es-CL", { minimumFractionDigits: 2 })}
            </span>
          </div>}

        {/* Parent line with children: show multiplier and subtotal */}
        {isParent && (
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
        <div className="flex items-center mx-[3px] gap-[50px] text-destructive">
          <span className="text-xs text-center font-sans font-medium whitespace-nowrap min-w-[80px]">{formatUF(calculatedAmount)}</span>
          <span className="text-[12px] text-muted-foreground font-mono whitespace-nowrap min-w-[100px] text-right">
            {formatCLP(convertUFToPesos(calculatedAmount))}
          </span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant={line.status === "autorizado" ? "default" : "secondary"} className={cn("cursor-pointer text-[10px] px-2.5 py-0 whitespace-nowrap", line.status === "autorizado" && "bg-green-500 hover:bg-green-600", line.status === "no_autorizado" && "bg-yellow-500 hover:bg-yellow-600 text-white")} onClick={toggleStatus}>
                  {line.status === "autorizado" ? "Autorizado" : "No Autorizado"}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                {line.status === "no_autorizado" ? "Este ítem se arrastrará al año siguiente hasta que sea autorizado o eliminado" : "Click para cambiar estado"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {isNotAuthorized && <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <ArrowRight className="h-3 w-3 text-yellow-600" />
                </TooltipTrigger>
                <TooltipContent>Se arrastrará al próximo año</TooltipContent>
              </Tooltip>
            </TooltipProvider>}
          
          {/* OC and Invoice buttons - only for authorized leaf lines */}
          {!isParent && line.status === "autorizado" && !readOnly && (
            <div className="flex items-center gap-1 ml-2">
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
              <Button size="sm" variant="ghost" onClick={() => onDeleteLine(line.id)} className="h-6 w-6 p-0 text-destructive">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>}
        </div>
      </div>

      {hasChildren && isExpanded && <BudgetLineTree lines={line.children!} level={level + 1} onAddLine={onAddLine} onUpdateLine={onUpdateLine} onDeleteLine={onDeleteLine} onCreateOC={onCreateOC} onCreateInvoice={onCreateInvoice} onViewLineDetails={onViewLineDetails} readOnly={readOnly} />}
    </div>;
};

// Helpers para cálculos
// Helper to get effective amount - only count lines with valid quantity AND unit_price
const getEffectiveAmount = (item: BudgetLine): number => {
  const qty = item.quantity || 0;
  const price = item.unit_price || 0;
  // Only return amount if both quantity and price are set
  if (qty <= 0 || price <= 0) return 0;
  return item.amount_uf || 0;
};

export const calculateAuthorizedTotal = (items: BudgetLine[]): number => {
  return items.reduce((sum, item) => {
    if (item.children && item.children.length > 0) {
      return sum + calculateAuthorizedTotal(item.children);
    }
    // Solo contar si está autorizado
    return item.status === "autorizado" ? sum + getEffectiveAmount(item) : sum;
  }, 0);
};
export const calculateUnauthorizedTotal = (items: BudgetLine[]): number => {
  return items.reduce((sum, item) => {
    if (item.children && item.children.length > 0) {
      return sum + calculateUnauthorizedTotal(item.children);
    }
    // Solo contar si NO está autorizado
    return item.status === "no_autorizado" ? sum + getEffectiveAmount(item) : sum;
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