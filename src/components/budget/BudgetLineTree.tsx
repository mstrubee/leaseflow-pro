import { useState } from "react";
import { ChevronRight, ChevronDown, Plus, Trash2, Check, X, Edit2, ArrowRight } from "lucide-react";
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
  level?: number;
  readOnly?: boolean;
}

export const BudgetLineTree = ({ 
  lines, 
  onAddLine, 
  onUpdateLine, 
  onDeleteLine,
  level = 0,
  readOnly = false
}: BudgetLineTreeProps) => {
  return (
    <div className={cn("space-y-1", level > 0 && "ml-6 border-l border-border pl-4")}>
      {lines.map((line) => (
        <BudgetLineItem
          key={line.id}
          line={line}
          level={level}
          onAddLine={onAddLine}
          onUpdateLine={onUpdateLine}
          onDeleteLine={onDeleteLine}
          readOnly={readOnly}
        />
      ))}
      {level === 0 && !readOnly && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onAddLine(null)}
          className="text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-4 w-4 mr-1" />
          Agregar línea madre
        </Button>
      )}
    </div>
  );
};

interface BudgetLineItemProps {
  line: BudgetLine;
  level: number;
  onAddLine: (parentId: string | null) => void;
  onUpdateLine: (id: string, data: Partial<BudgetLine>) => void;
  onDeleteLine: (id: string) => void;
  readOnly?: boolean;
}

const BudgetLineItem = ({ line, level, onAddLine, onUpdateLine, onDeleteLine, readOnly = false }: BudgetLineItemProps) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(line.name);
  const [editQuantity, setEditQuantity] = useState((line.quantity || 0).toString());
  const [editUnit, setEditUnit] = useState(line.unit_type || "m2");
  const [editUnitPrice, setEditUnitPrice] = useState((line.unit_price || 0).toString());
  const [editCurrency, setEditCurrency] = useState(line.currency || "UF");
  const { formatUF, formatCLP, convertUFToPesos, ufValue } = useBudgetContext();

  const hasChildren = line.children && line.children.length > 0;
  const isParent = hasChildren;
  
  // Calcular el total de hijos si es padre (solo autorizados)
  const calculateChildrenTotal = (children: BudgetLine[]): number => {
    return children.reduce((sum, child) => {
      if (child.children && child.children.length > 0) {
        return sum + calculateChildrenTotal(child.children);
      }
      return sum + (child.amount_uf || 0);
    }, 0);
  };

  const calculatedAmount = isParent 
    ? calculateChildrenTotal(line.children!)
    : line.amount_uf;

  // Calculate edit total based on inputs
  const editQty = parseFloat(editQuantity) || 0;
  const editPrice = parseFloat(editUnitPrice) || 0;
  const editTotal = editQty * editPrice;

  const handleSave = () => {
    const qty = parseFloat(editQuantity) || 0;
    const price = parseFloat(editUnitPrice) || 0;
    let amountUf = qty * price;
    
    // If currency is CLP, convert to UF
    if (editCurrency === "CLP" && ufValue > 0) {
      amountUf = amountUf / ufValue;
    }

    onUpdateLine(line.id, {
      name: editName,
      quantity: qty,
      unit_type: editUnit,
      unit_price: price,
      currency: editCurrency,
      amount_uf: amountUf,
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditName(line.name);
    setEditQuantity((line.quantity || 0).toString());
    setEditUnit(line.unit_type || "m2");
    setEditUnitPrice((line.unit_price || 0).toString());
    setEditCurrency(line.currency || "UF");
    setIsEditing(false);
  };

  const toggleStatus = () => {
    if (readOnly) return;
    onUpdateLine(line.id, {
      status: line.status === "autorizado" ? "no_autorizado" : "autorizado",
    });
  };

  const isNotAuthorized = line.status === "no_autorizado";

  return (
    <div>
      <div className={cn(
        "flex items-center gap-2 py-2 px-2 rounded-md hover:bg-accent/50 group",
        level === 0 && "bg-muted/30",
        isNotAuthorized && "opacity-70 bg-yellow-50 dark:bg-yellow-950/20"
      )}>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1 hover:bg-accent rounded"
          disabled={!hasChildren}
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
          ) : (
            <div className="h-4 w-4" />
          )}
        </button>

        {isEditing && !readOnly ? (
          <div className="flex items-center gap-2 flex-1 flex-wrap">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="h-7 w-40"
              autoFocus
              placeholder="Nombre"
            />
            {!isParent && (
              <>
                {/* Quantity and unit */}
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={editQuantity}
                    onChange={(e) => setEditQuantity(e.target.value)}
                    className="h-7 w-16"
                    placeholder="Cant."
                  />
                  <Select value={editUnit} onValueChange={setEditUnit}>
                    <SelectTrigger className="h-7 w-16">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="m2">m²</SelectItem>
                      <SelectItem value="mL">mL</SelectItem>
                      <SelectItem value="Un">Un</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {/* Price and currency */}
                <span className="text-muted-foreground">×</span>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={editUnitPrice}
                    onChange={(e) => setEditUnitPrice(e.target.value)}
                    className="h-7 w-20"
                    placeholder="Precio"
                  />
                  <Select value={editCurrency} onValueChange={setEditCurrency}>
                    <SelectTrigger className="h-7 w-16">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UF">UF</SelectItem>
                      <SelectItem value="CLP">$</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {/* Calculated total */}
                <div className="text-sm font-mono bg-muted/50 px-2 py-1 rounded">
                  = {editCurrency === "CLP" ? "$ " : "UF "}
                  {editTotal.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={handleSave} className="h-7 w-7 p-0">
              <Check className="h-4 w-4 text-green-600" />
            </Button>
            <Button size="sm" variant="ghost" onClick={handleCancel} className="h-7 w-7 p-0">
              <X className="h-4 w-4 text-red-600" />
            </Button>
          </div>
        ) : (
          <>
            <span className={cn("flex-1 font-medium", level === 0 && "font-semibold")}>
              {line.name}
            </span>
            {!isParent && (line.quantity || 0) > 0 && (
              <span className="text-xs text-muted-foreground">
                {line.quantity} {line.unit_type || "m2"} × {line.currency === "CLP" ? "$" : "UF "}{(line.unit_price || 0).toLocaleString("es-CL", { minimumFractionDigits: 2 })}
              </span>
            )}
            <div className="flex items-center gap-3">
              <span className="text-sm font-mono">{formatUF(calculatedAmount)}</span>
              <span className="text-xs text-muted-foreground font-mono">
                {formatCLP(convertUFToPesos(calculatedAmount))}
              </span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant={line.status === "autorizado" ? "default" : "secondary"}
                      className={cn(
                        "cursor-pointer text-xs",
                        line.status === "autorizado" && "bg-green-500 hover:bg-green-600",
                        line.status === "no_autorizado" && "bg-yellow-500 hover:bg-yellow-600 text-white"
                      )}
                      onClick={toggleStatus}
                    >
                      {line.status === "autorizado" ? "Autorizado" : "No Autorizado"}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    {line.status === "no_autorizado" 
                      ? "Este ítem se arrastrará al año siguiente hasta que sea autorizado o eliminado"
                      : "Click para cambiar estado"
                    }
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {isNotAuthorized && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <ArrowRight className="h-4 w-4 text-yellow-600" />
                    </TooltipTrigger>
                    <TooltipContent>Se arrastrará al próximo año</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {!readOnly && (
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setIsEditing(true)} className="h-7 w-7 p-0">
                    <Edit2 className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onAddLine(line.id)} className="h-7 w-7 p-0">
                    <Plus className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onDeleteLine(line.id)} className="h-7 w-7 p-0 text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {hasChildren && isExpanded && (
        <BudgetLineTree
          lines={line.children!}
          level={level + 1}
          onAddLine={onAddLine}
          onUpdateLine={onUpdateLine}
          onDeleteLine={onDeleteLine}
          readOnly={readOnly}
        />
      )}
    </div>
  );
};

// Helpers para cálculos
export const calculateAuthorizedTotal = (items: BudgetLine[]): number => {
  return items.reduce((sum, item) => {
    if (item.children && item.children.length > 0) {
      return sum + calculateAuthorizedTotal(item.children);
    }
    // Solo contar si está autorizado
    return item.status === "autorizado" ? sum + (item.amount_uf || 0) : sum;
  }, 0);
};

export const calculateUnauthorizedTotal = (items: BudgetLine[]): number => {
  return items.reduce((sum, item) => {
    if (item.children && item.children.length > 0) {
      return sum + calculateUnauthorizedTotal(item.children);
    }
    // Solo contar si NO está autorizado
    return item.status === "no_autorizado" ? sum + (item.amount_uf || 0) : sum;
  }, 0);
};

export const getUnauthorizedLines = (items: BudgetLine[]): BudgetLine[] => {
  const result: BudgetLine[] = [];
  items.forEach((item) => {
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
    children.forEach((child) => {
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
