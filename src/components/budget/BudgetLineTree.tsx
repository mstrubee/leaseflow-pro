import { useState } from "react";
import { ChevronRight, ChevronDown, Plus, Trash2, Check, X, Edit2, ArrowRight, FileText, Receipt } from "lucide-react";
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
  const [isEditingPrice, setIsEditingPrice] = useState(false);
  const [editUnitPrice, setEditUnitPrice] = useState((line.unit_price || 0).toString());
  const [editCurrency, setEditCurrency] = useState(line.currency || "UF");
  const [localQuantity, setLocalQuantity] = useState((line.quantity || 0).toString());
  const {
    formatUF,
    formatCLP,
    convertUFToPesos,
    ufValue
  } = useBudgetContext();
  const hasChildren = line.children && line.children.length > 0;
  const isParent = hasChildren;

  // Calcular el total de hijos si es padre (solo autorizados)
  const calculateChildrenTotal = (children: BudgetLine[]): number => {
    return children.reduce((sum, child) => {
      if (child.children && child.children.length > 0) {
        return sum + calculateChildrenTotal(child.children);
      }
      // Para hojas: solo sumar si cantidad Y precio son > 0
      const qty = child.quantity || 0;
      const price = child.unit_price || 0;
      if (qty <= 0 || price <= 0) return sum;
      return sum + (child.amount_uf || 0);
    }, 0);
  };

  // Para líneas hoja: mostrar 0 si falta cantidad o precio
  const getLeafAmount = (): number => {
    const qty = line.quantity || 0;
    const price = line.unit_price || 0;
    if (qty <= 0 || price <= 0) return 0;
    return line.amount_uf || 0;
  };

  const calculatedAmount = isParent ? calculateChildrenTotal(line.children!) : getLeafAmount();

  // Calculate amount only if both quantity and price are > 0
  const calculateLineAmount = (qty: number, price: number, currency: string): number => {
    if (qty <= 0 || price <= 0) return 0;
    let amountUf = qty * price;
    if (currency === "CLP" && ufValue > 0) {
      amountUf = amountUf / ufValue;
    }
    return amountUf;
  };

  // Commit quantity on blur
  const handleQuantityBlur = () => {
    if (readOnly) return;
    const qty = parseFloat(localQuantity) || 0;
    if (qty === (line.quantity || 0)) return;
    const price = line.unit_price || 0;
    const currency = line.currency || "UF";
    const amountUf = calculateLineAmount(qty, price, currency);
    onUpdateLine(line.id, {
      quantity: qty,
      amount_uf: amountUf
    });
  };

  // Direct unit type update
  const handleUnitChange = (newUnit: string) => {
    if (readOnly) return;
    onUpdateLine(line.id, {
      unit_type: newUnit
    });
  };
  const handleSavePrice = () => {
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
  const handleCancelPrice = () => {
    setEditUnitPrice((line.unit_price || 0).toString());
    setEditCurrency(line.currency || "UF");
    setIsEditingPrice(false);
  };
  const toggleStatus = () => {
    if (readOnly) return;
    onUpdateLine(line.id, {
      status: line.status === "autorizado" ? "no_autorizado" : "autorizado"
    });
  };
  const isNotAuthorized = line.status === "no_autorizado";
  return <div>
      <div className={cn("flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-accent/50 group", hasChildren && "bg-muted/30", !hasChildren && isNotAuthorized && "opacity-70 bg-yellow-50 dark:bg-yellow-950/20")}>
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

        {/* For non-parent lines: show quantity/unit and price inputs - aligned in columns */}
        {!isParent && <div className="shadow-sm gap-[10px] flex items-center justify-start min-w-[280px]">
            {/* Quantity - local state for fast typing, commit on blur or Enter */}
            <Input type="number" value={localQuantity} onChange={e => setLocalQuantity(e.target.value)} onBlur={handleQuantityBlur} disabled={readOnly} className="h-6 w-[80px] text-xs" />
            {/* Unit type - directly editable */}
            <Select value={line.unit_type || "m2"} onValueChange={handleUnitChange} disabled={readOnly}>
              <SelectTrigger className="h-6 w-14 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="m2">m²</SelectItem>
                <SelectItem value="mL">mL</SelectItem>
                <SelectItem value="Un">Un</SelectItem>
              </SelectContent>
            </Select>

            <span className="text-xs text-muted-foreground mx-0.5">×</span>

            {/* Price - editable only via button */}
            {isEditingPrice && !readOnly ? <div className="flex items-center gap-1">
                <Input type="number" value={editUnitPrice} onChange={e => setEditUnitPrice(e.target.value)} className="h-6 w-16 text-xs" autoFocus />
                <Select value={editCurrency} onValueChange={setEditCurrency}>
                  <SelectTrigger className="h-6 w-20 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UF">UF/{line.unit_type || "m2"}</SelectItem>
                    <SelectItem value="CLP">$/{line.unit_type || "m2"}</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="ghost" onClick={handleSavePrice} className="h-6 w-6 p-0">
                  <Check className="h-3 w-3 text-green-600" />
                </Button>
                <Button size="sm" variant="ghost" onClick={handleCancelPrice} className="h-6 w-6 p-0">
                  <X className="h-3 w-3 text-red-600" />
                </Button>
              </div> : <div className="flex items-center gap-1">
                <span className="text-xs bg-muted/50 px-1.5 py-0.5 rounded w-[110px] text-center font-serif font-normal whitespace-nowrap">
                  {line.currency === "CLP" 
                    ? Math.round(line.unit_price || 0).toLocaleString("es-CL")
                    : (line.unit_price || 0).toLocaleString("es-CL", { minimumFractionDigits: 2 })
                  } {line.currency === "CLP" ? "$" : "UF"}/{line.unit_type || "m2"}
                </span>
                {!readOnly && <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="ghost" onClick={() => setIsEditingPrice(true)} className="h-5 w-5 p-0">
                          <Edit2 className="h-2.5 w-2.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Editar valor {line.unit_type || "m2"}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>}
              </div>}
          </div>}

        {/* Spacer for parent lines to align totals */}
        {isParent && <div className="flex-1" />}

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
// Helper to get effective amount - use amount_uf directly (already calculated)
const getEffectiveAmount = (item: BudgetLine): number => {
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