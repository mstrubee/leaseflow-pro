import { useState, createContext, useContext } from "react";
import { ChevronRight, ChevronDown, Plus, Trash2, GripVertical, CornerDownRight, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CategorySelect } from "@/components/suppliers/CategorySelect";
import { SupplierSelect } from "@/components/suppliers/SupplierSelect";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface TemplateLine {
  id: string;
  template_id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  default_amount_uf: number;
  display_order: number;
  quantity?: number;
  unit_type?: string;
  currency?: string;
  supplier_name?: string;
  category_id?: string | null;
  children?: TemplateLine[];
}

export interface SupplierCategory {
  id: string;
  name: string;
}

interface BudgetTemplateLineTreeProps {
  lines: TemplateLine[];
  onAddLine: (parentId: string | null) => void;
  onUpdateLine: (id: string, data: Partial<TemplateLine>) => void;
  onDeleteLine: (id: string) => void;
  onReorder?: (lines: TemplateLine[]) => void;
  onReparent?: (lineId: string, newParentId: string | null) => void;
  level?: number;
  allLines?: TemplateLine[];
  isRoot?: boolean;
}

// Context for drag state
interface DragContextType {
  activeId: string | null;
  overId: string | null;
  activeLevel: number | null;
  overLevel: number | null;
}

const DragStateContext = createContext<DragContextType>({
  activeId: null,
  overId: null,
  activeLevel: null,
  overLevel: null,
});

// Helper to get all descendant IDs of a line
const getDescendantIds = (line: TemplateLine): string[] => {
  const ids: string[] = [];
  if (line.children) {
    for (const child of line.children) {
      ids.push(child.id);
      ids.push(...getDescendantIds(child));
    }
  }
  return ids;
};

// Helper to calculate subtotal of children recursively
const calculateChildrenSubtotal = (line: TemplateLine): number => {
  if (!line.children || line.children.length === 0) {
    // Leaf node: calculate its own total (qty * price, or 0 if either is missing)
    const qty = line.quantity || 0;
    const price = line.default_amount_uf || 0;
    return qty > 0 && price > 0 ? qty * price : 0;
  }
  // Parent node: sum of children subtotals
  return line.children.reduce((sum, child) => sum + calculateChildrenSubtotal(child), 0);
};

// Helper to find a line by ID in the tree
const findLineById = (lines: TemplateLine[], id: string): TemplateLine | null => {
  for (const line of lines) {
    if (line.id === id) return line;
    if (line.children) {
      const found = findLineById(line.children, id);
      if (found) return found;
    }
  }
  return null;
};

// Helper to find level of a line by ID
const findLevelById = (lines: TemplateLine[], id: string, currentLevel = 0): number | null => {
  for (const line of lines) {
    if (line.id === id) return currentLevel;
    if (line.children) {
      const found = findLevelById(line.children, id, currentLevel + 1);
      if (found !== null) return found;
    }
  }
  return null;
};

// Helper to flatten all lines for drag context
const flattenLines = (lines: TemplateLine[]): TemplateLine[] => {
  const result: TemplateLine[] = [];
  for (const line of lines) {
    result.push(line);
    if (line.children) {
      result.push(...flattenLines(line.children));
    }
  }
  return result;
};

// Helper to get siblings of a line
const getSiblings = (lines: TemplateLine[], lineId: string, parentId: string | null): TemplateLine[] => {
  if (parentId === null) {
    return lines.filter(l => l.parent_id === null);
  }
  const parent = findLineById(lines, parentId);
  return parent?.children || [];
};

export const BudgetTemplateLineTree = ({
  lines,
  onAddLine,
  onUpdateLine,
  onDeleteLine,
  onReorder,
  onReparent,
  level = 0,
  allLines,
  isRoot = true,
}: BudgetTemplateLineTreeProps) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const rootLines = allLines || lines;
  const flatLines = flattenLines(rootLines);

  const activeLevel = activeId ? findLevelById(rootLines, activeId) : null;
  const overLevel = overId ? findLevelById(rootLines, overId) : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    setOverId(over ? (over.id as string) : null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverId(null);

    if (!over || active.id === over.id) return;

    const activeLineId = active.id as string;
    const overLineId = over.id as string;

    // Find the dragged line and target line
    const activeLine = findLineById(rootLines, activeLineId);
    const overLine = findLineById(rootLines, overLineId);

    if (!activeLine || !overLine) return;

    // Prevent dropping a parent onto its own descendant
    const descendantIds = getDescendantIds(activeLine);
    if (descendantIds.includes(overLineId)) return;

    // Check if they're siblings (same parent)
    const areSiblings = activeLine.parent_id === overLine.parent_id;

    if (areSiblings) {
      // Reorder within the same level - find the correct sibling list
      const siblings = getSiblings(rootLines, activeLineId, activeLine.parent_id);
      const oldIndex = siblings.findIndex((item) => item.id === activeLineId);
      const newIndex = siblings.findIndex((item) => item.id === overLineId);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(siblings, oldIndex, newIndex);
        newOrder.forEach((line, index) => {
          onUpdateLine(line.id, { display_order: index });
        });
        if (onReorder) {
          onReorder(newOrder);
        }
      }
    } else if (onReparent) {
      // Reparent: make the dragged line a child of the target line
      onReparent(activeLineId, overLineId);
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setOverId(null);
  };

  const activeLine = activeId ? findLineById(rootLines, activeId) : null;
  const overLine = overId ? findLineById(rootLines, overId) : null;

  // Determine action type for overlay
  const getActionType = (): "reorder" | "reparent" | null => {
    if (!activeLine || !overLine) return null;
    if (activeLine.parent_id === overLine.parent_id) return "reorder";
    return "reparent";
  };

  const actionType = getActionType();

  // Only render the DndContext at the root level
  if (isRoot) {
    return (
      <DragStateContext.Provider value={{ activeId, overId, activeLevel, overLevel }}>
        <div className={cn("space-y-1", level > 0 && "ml-6 border-l border-border pl-4")}>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext items={flatLines.map(l => l.id)} strategy={verticalListSortingStrategy}>
              {lines.map((line) => (
                <SortableTemplateLineItem
                  key={line.id}
                  line={line}
                  level={level}
                  onAddLine={onAddLine}
                  onUpdateLine={onUpdateLine}
                  onDeleteLine={onDeleteLine}
                  onReorder={onReorder}
                  onReparent={onReparent}
                  allLines={rootLines}
                />
              ))}
            </SortableContext>
            <DragOverlay dropAnimation={{
              duration: 200,
              easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
            }}>
              {activeLine ? (
                <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg bg-background border-2 border-primary shadow-xl animate-scale-in">
                  <GripVertical className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">{activeLine.name}</span>
                  {activeLine.children && activeLine.children.length > 0 && (
                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">
                      +{activeLine.children.length}
                    </span>
                  )}
                  {activeLevel !== null && (
                    <span className="ml-auto text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                      Nivel {activeLevel + 1}
                    </span>
                  )}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
          
          {/* Drop indicator hint */}
          {activeId && overId && overLine && (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
              <div className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full shadow-lg text-sm font-medium",
                actionType === "reparent" 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-muted text-foreground"
              )}>
                {actionType === "reparent" ? (
                  <>
                    <CornerDownRight className="h-4 w-4" />
                    Mover dentro de "{overLine.name}"
                  </>
                ) : (
                  <>
                    <ArrowRight className="h-4 w-4" />
                    Reordenar junto a "{overLine.name}"
                  </>
                )}
              </div>
            </div>
          )}
          
          {level === 0 && (
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
      </DragStateContext.Provider>
    );
  }

  // For nested levels, just render the items without a new DndContext
  return (
    <div className={cn("space-y-1", level > 0 && "ml-6 border-l border-border pl-4")}>
      {lines.map((line) => (
        <SortableTemplateLineItem
          key={line.id}
          line={line}
          level={level}
          onAddLine={onAddLine}
          onUpdateLine={onUpdateLine}
          onDeleteLine={onDeleteLine}
          onReorder={onReorder}
          onReparent={onReparent}
          allLines={rootLines}
        />
      ))}
    </div>
  );
};

interface SortableTemplateLineItemProps {
  line: TemplateLine;
  level: number;
  onAddLine: (parentId: string | null) => void;
  onUpdateLine: (id: string, data: Partial<TemplateLine>) => void;
  onDeleteLine: (id: string) => void;
  onReorder?: (lines: TemplateLine[]) => void;
  onReparent?: (lineId: string, newParentId: string | null) => void;
  allLines: TemplateLine[];
}

const SortableTemplateLineItem = ({
  line,
  level,
  onAddLine,
  onUpdateLine,
  onDeleteLine,
  onReorder,
  onReparent,
  allLines,
}: SortableTemplateLineItemProps) => {
  const { activeId, overId } = useContext(DragStateContext);
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: line.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const [isExpanded, setIsExpanded] = useState(true);
  const [isEditingName, setIsEditingName] = useState(false);
  const [hasBeenEdited, setHasBeenEdited] = useState(line.name !== "Nueva línea");
  const [isEditingQuantity, setIsEditingQuantity] = useState(false);
  const [isEditingUnit, setIsEditingUnit] = useState(false);
  const [isEditingAmount, setIsEditingAmount] = useState(false);
  const [isEditingCurrency, setIsEditingCurrency] = useState(false);
  const [editName, setEditName] = useState(line.name);
  const [editQuantity, setEditQuantity] = useState((line.quantity ?? 1).toString());
  const [editUnit, setEditUnit] = useState(line.unit_type || "m2");
  const [editAmount, setEditAmount] = useState(line.default_amount_uf.toString());
  const [editCurrency, setEditCurrency] = useState(line.currency || "UF");

  const hasChildren = line.children && line.children.length > 0;
  const calculatedTotal = (parseFloat(editQuantity) || 0) * (parseFloat(editAmount) || 0);
  
  // For parent lines: calculate children subtotal and apply multiplier
  const childrenSubtotal = hasChildren ? calculateChildrenSubtotal(line) : 0;
  const multiplier = line.quantity ?? 1;
  const parentTotal = childrenSubtotal * multiplier;

  // Determine if this is a drop target for reparenting
  const isDropTarget = overId === line.id && activeId !== line.id;
  const activeLine = activeId ? findLineById(allLines, activeId) : null;
  const isReparentTarget = isDropTarget && activeLine?.parent_id !== line.parent_id;
  const isReorderTarget = isDropTarget && activeLine?.parent_id === line.parent_id;

  const handleSaveQuantity = () => {
    const newQty = parseFloat(editQuantity) || 0;
    if (newQty !== (line.quantity ?? 0)) {
      onUpdateLine(line.id, { quantity: newQty });
    } else {
      setEditQuantity((line.quantity ?? 1).toString());
    }
    setIsEditingQuantity(false);
  };

  const handleSaveUnit = (value: string) => {
    if (value !== line.unit_type) {
      onUpdateLine(line.id, { unit_type: value });
    }
    setEditUnit(value);
    setIsEditingUnit(false);
  };

  const handleSaveAmount = () => {
    const newAmount = parseFloat(editAmount) || 0;
    if (newAmount !== line.default_amount_uf) {
      onUpdateLine(line.id, { default_amount_uf: newAmount });
    } else {
      setEditAmount(line.default_amount_uf.toString());
    }
    setIsEditingAmount(false);
  };

  const handleSaveCurrency = (value: string) => {
    if (value !== line.currency) {
      onUpdateLine(line.id, { currency: value });
    }
    setEditCurrency(value);
    setIsEditingCurrency(false);
  };

  const handleSupplierChange = (supplierId: string | null, supplierName: string | null) => {
    onUpdateLine(line.id, { supplier_name: supplierName });
  };

  const handleCancelAll = () => {
    setEditName(line.name);
    setEditQuantity((line.quantity ?? 1).toString());
    setEditUnit(line.unit_type || "m2");
    setEditAmount(line.default_amount_uf.toString());
    setEditCurrency(line.currency || "UF");
    setIsEditingName(false);
    setIsEditingQuantity(false);
    setIsEditingUnit(false);
    setIsEditingAmount(false);
    setIsEditingCurrency(false);
  };

  const handleSaveName = () => {
    if (editName.trim() && editName !== line.name) {
      onUpdateLine(line.id, { name: editName.trim() });
      setHasBeenEdited(true);
    } else if (!editName.trim()) {
      setEditName(line.name);
    } else {
      setEditName(line.name);
    }
    setIsEditingName(false);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveName();
    } else if (e.key === "Escape") {
      setEditName(line.name);
      setIsEditingName(false);
    }
  };

  const handleQuantityKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveQuantity();
    } else if (e.key === "Escape") {
      setEditQuantity((line.quantity ?? 1).toString());
      setIsEditingQuantity(false);
    }
  };

  const handleAmountKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveAmount();
    } else if (e.key === "Escape") {
      setEditAmount(line.default_amount_uf.toString());
      setIsEditingAmount(false);
    }
  };

  const handleDelete = () => {
    if (hasChildren) {
      if (!confirm("Esta línea tiene sublíneas. ¿Eliminar todas las sublíneas también?")) {
        return;
      }
    }
    onDeleteLine(line.id);
  };

  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && "opacity-30")}>
      <div
        className={cn(
          "grid items-center py-2 px-2 rounded-md hover:bg-accent/50 group transition-all duration-200",
          // Grid columns: drag(32px) expand(28px) name(minmax) qty(60px) unit(40px) x(16px) currency(60px) price(80px) total(100px) supplier(auto) actions(60px)
          !hasChildren 
            ? "grid-cols-[32px_28px_minmax(240px,1.2fr)_60px_40px_16px_60px_80px_100px_auto_60px]"
            : "grid-cols-[32px_28px_minmax(240px,1.2fr)_1fr_60px]",
          level === 0 && hasChildren && "bg-muted/60",
          level === 0 && !hasChildren && "bg-muted/20",
          level === 1 && hasChildren && "bg-muted/50",
          level === 1 && !hasChildren && "bg-muted/15",
          level === 2 && hasChildren && "bg-muted/40",
          level === 2 && !hasChildren && "bg-muted/10",
          level >= 3 && hasChildren && "bg-muted/35",
          level >= 3 && !hasChildren && "bg-muted/5",
          isReparentTarget && "ring-2 ring-primary ring-offset-2 bg-primary/10 scale-[1.02]",
          isReorderTarget && "border-t-2 border-primary"
        )}
      >
        {/* Col 1: Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className={cn(
            "p-1.5 rounded cursor-grab active:cursor-grabbing transition-colors",
            "hover:bg-accent hover:text-accent-foreground",
            "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
          )}
          title="Arrastrar para mover o reorganizar"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>

        {/* Col 2: Expand/collapse */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1 hover:bg-accent rounded transition-colors"
          disabled={!hasChildren}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )
          ) : (
            <div className="h-4 w-4" />
          )}
        </button>

        {/* Col 3: Line name - takes available space */}
        {isEditingName ? (
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleSaveName}
            onKeyDown={handleNameKeyDown}
            className="h-7 text-sm"
            placeholder="Nombre de la línea"
            autoFocus
          />
        ) : (
          <span 
            className={cn(
              "text-sm font-medium truncate cursor-text hover:bg-accent/50 px-1 py-0.5 rounded",
              level === 0 && "font-semibold"
            )}
            onDoubleClick={() => {
              if (!hasBeenEdited) {
                setEditName("");
              }
              setIsEditingName(true);
            }}
            title={line.name + " — Doble clic para editar"}
          >
            {line.name}
          </span>
        )}
        
        {/* Leaf node columns */}
        {!hasChildren && (
          <>
            {/* Col 4: Quantity */}
            {isEditingQuantity ? (
              <Input
                type="number"
                value={editQuantity}
                onChange={(e) => setEditQuantity(e.target.value)}
                onBlur={handleSaveQuantity}
                onKeyDown={handleQuantityKeyDown}
                className="h-6 text-xs"
                autoFocus
                min="0"
              />
            ) : (
              <span 
                className="text-xs font-mono bg-muted/30 px-1.5 py-0.5 rounded text-center cursor-text hover:bg-accent/50"
                onDoubleClick={() => setIsEditingQuantity(true)}
                title="Doble clic para editar"
              >
                {line.quantity || 0}
              </span>
            )}
            
            {/* Col 5: Unit type */}
            {isEditingUnit ? (
              <Select value={editUnit} onValueChange={handleSaveUnit} open={true}>
                <SelectTrigger className="h-6 text-xs">
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
                className="text-xs text-muted-foreground text-center cursor-pointer hover:bg-accent/50 px-1 py-0.5 rounded"
                onDoubleClick={() => setIsEditingUnit(true)}
                title="Doble clic para editar"
              >
                {line.unit_type || "m²"}
              </span>
            )}
            
            {/* Col 6: × separator */}
            <span className="text-xs text-muted-foreground text-center">×</span>
            
            {/* Col 7: Currency */}
            {isEditingCurrency ? (
              <Select value={editCurrency} onValueChange={handleSaveCurrency} open={true}>
                <SelectTrigger className="h-6 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UF">UF</SelectItem>
                  <SelectItem value="CLP">$</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <span 
                className="text-xs text-muted-foreground text-center cursor-pointer hover:bg-accent/50 px-0.5 py-0.5 rounded"
                onDoubleClick={() => setIsEditingCurrency(true)}
                title="Doble clic para editar"
              >
                {line.currency === "CLP" ? "$" : "UF"}/{line.unit_type || "m2"}
              </span>
            )}
            
            {/* Col 8: Price/Amount */}
            {isEditingAmount ? (
              <Input
                type="number"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                onBlur={handleSaveAmount}
                onKeyDown={handleAmountKeyDown}
                className="h-6 text-xs"
                autoFocus
                min="0"
                step="0.01"
              />
            ) : (
              <span 
                className="text-xs font-mono bg-muted/50 px-1.5 py-0.5 rounded text-center cursor-text hover:bg-accent/50"
                onDoubleClick={() => setIsEditingAmount(true)}
                title="Doble clic para editar"
              >
                {line.default_amount_uf.toLocaleString("es-CL", { minimumFractionDigits: 2 })}
              </span>
            )}
            
            {/* Col 9: Calculated total */}
            <span className="text-xs font-mono bg-primary/10 px-1.5 py-0.5 rounded text-center">
              = {line.currency === "CLP" ? "$" : "UF"} {((line.quantity || 0) * line.default_amount_uf).toLocaleString("es-CL", { minimumFractionDigits: 2 })}
            </span>
            
            {/* Col 10: Supplier */}
            <div className="flex items-center gap-1 border-l border-border pl-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Prov:</span>
              <SupplierSelect
                value={null}
                onChange={handleSupplierChange}
                categoryId={line.category_id}
              />
              {line.supplier_name && (
                <span className="text-xs text-muted-foreground truncate max-w-[80px]">
                  ({line.supplier_name})
                </span>
              )}
            </div>
          </>
        )}
        
        {/* Parent line with children: merged area for category, multiplier, subtotals */}
        {hasChildren && (
          <div className="flex items-center gap-3 flex-wrap">
            {level >= 1 && (
              <>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">Rubro:</span>
                  <CategorySelect
                    value={line.category_id}
                    onChange={(categoryId) => onUpdateLine(line.id, { category_id: categoryId })}
                    placeholder="Seleccionar"
                    size="sm"
                  />
                </div>
                
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">×</span>
                  {isEditingQuantity ? (
                    <Input
                      type="number"
                      value={editQuantity}
                      onChange={(e) => setEditQuantity(e.target.value)}
                      onBlur={handleSaveQuantity}
                      onKeyDown={handleQuantityKeyDown}
                      className="h-6 w-12 text-xs"
                      autoFocus
                      min="1"
                    />
                  ) : (
                    <span 
                      className="text-xs font-mono bg-muted/30 px-1.5 py-0.5 rounded min-w-[30px] text-center cursor-text hover:bg-accent/50"
                      onDoubleClick={() => setIsEditingQuantity(true)}
                      title="Doble clic para editar"
                    >
                      {multiplier}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">un</span>
                </div>
                
                <span className="text-xs font-mono bg-primary/10 px-2 py-0.5 rounded font-semibold">
                  = UF {parentTotal.toLocaleString("es-CL", { minimumFractionDigits: 2 })}
                </span>
                
                <span className="text-xs text-muted-foreground">
                  (Unit: UF {childrenSubtotal.toLocaleString("es-CL", { minimumFractionDigits: 2 })})
                </span>
              </>
            )}
          </div>
        )}
        
        {/* Last col: Actions */}
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onAddLine(line.id)}
            className="h-6 w-6 p-0"
            title="Agregar sublínea"
          >
            <Plus className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDelete}
            className="h-6 w-6 p-0 text-destructive"
            title="Eliminar"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {hasChildren && isExpanded && (
        <BudgetTemplateLineTree
          lines={line.children!}
          level={level + 1}
          onAddLine={onAddLine}
          onUpdateLine={onUpdateLine}
          onDeleteLine={onDeleteLine}
          onReorder={onReorder}
          onReparent={onReparent}
          allLines={allLines}
          isRoot={false}
        />
      )}
    </div>
  );
};