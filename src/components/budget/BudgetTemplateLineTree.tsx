import { useState } from "react";
import { ChevronRight, ChevronDown, Plus, Trash2, Check, X, Edit2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
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
  pointerWithin,
  rectIntersection,
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
  children?: TemplateLine[];
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
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const rootLines = allLines || lines;
  const flatLines = flattenLines(rootLines);

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
      // Reorder within the same level
      const oldIndex = lines.findIndex((item) => item.id === active.id);
      const newIndex = lines.findIndex((item) => item.id === over.id);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(lines, oldIndex, newIndex);
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

  // Only render the DndContext at the root level
  if (isRoot) {
    return (
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
                isDropTarget={overId === line.id && activeId !== line.id}
              />
            ))}
          </SortableContext>
          <DragOverlay>
            {activeLine ? (
              <div className="flex items-center gap-2 py-2 px-2 rounded-md bg-background border shadow-lg opacity-90">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{activeLine.name}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
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
          isDropTarget={overId === line.id && activeId !== line.id}
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
  isDropTarget?: boolean;
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
  isDropTarget,
}: SortableTemplateLineItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: line.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const [isExpanded, setIsExpanded] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(line.name);
  const [editQuantity, setEditQuantity] = useState((line.quantity || 0).toString());
  const [editUnit, setEditUnit] = useState(line.unit_type || "m2");
  const [editAmount, setEditAmount] = useState(line.default_amount_uf.toString());
  const [editCurrency, setEditCurrency] = useState(line.currency || "UF");

  const hasChildren = line.children && line.children.length > 0;
  const calculatedTotal = (parseFloat(editQuantity) || 0) * (parseFloat(editAmount) || 0);

  const handleSave = () => {
    onUpdateLine(line.id, {
      name: editName,
      quantity: parseFloat(editQuantity) || 0,
      unit_type: editUnit,
      default_amount_uf: parseFloat(editAmount) || 0,
      currency: editCurrency,
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditName(line.name);
    setEditQuantity((line.quantity || 0).toString());
    setEditUnit(line.unit_type || "m2");
    setEditAmount(line.default_amount_uf.toString());
    setEditCurrency(line.currency || "UF");
    setIsEditing(false);
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
    <div ref={setNodeRef} style={style}>
      <div
        className={cn(
          "flex items-center gap-2 py-2 px-2 rounded-md hover:bg-accent/50 group transition-all",
          (level === 0 || hasChildren) && "bg-muted/30",
          isDropTarget && "ring-2 ring-primary ring-offset-1 bg-primary/10"
        )}
      >
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="p-1 hover:bg-accent rounded cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1 hover:bg-accent rounded"
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

        {isEditing ? (
          <div className="flex items-center gap-2 flex-1">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="h-7 flex-1"
              autoFocus
              placeholder="Nombre de la línea"
            />
            {/* Quantity and unit */}
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={editQuantity}
                onChange={(e) => setEditQuantity(e.target.value)}
                className="h-7 w-16"
                placeholder="Cant."
                disabled={hasChildren}
              />
              <Select value={editUnit} onValueChange={setEditUnit} disabled={hasChildren}>
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
            {/* Amount and currency */}
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                className="h-7 w-20"
                placeholder="Monto"
                disabled={hasChildren}
              />
              <Select value={editCurrency} onValueChange={setEditCurrency} disabled={hasChildren}>
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
            {!hasChildren && (
              <div className="w-28 text-right font-mono text-sm bg-muted/50 px-2 py-1 rounded">
                = {editCurrency === "UF" ? "UF " : "$ "}
                {calculatedTotal.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
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
            {/* Line name - fixed width for alignment */}
            <span className={cn(
              "text-sm font-medium min-w-[180px] flex-shrink-0",
              level === 0 && "font-semibold"
            )}>
              {line.name}
            </span>
            
            {/* Inputs section - always visible, aligned */}
            {!hasChildren && (
              <div className="flex items-center gap-1">
                {/* Quantity display */}
                <span className="text-xs font-mono bg-muted/30 px-1.5 py-0.5 rounded min-w-[40px] text-center">
                  {line.quantity || 0}
                </span>
                {/* Unit type display */}
                <span className="text-xs text-muted-foreground min-w-[24px]">
                  {line.unit_type || "m²"}
                </span>
                
                <span className="text-xs text-muted-foreground mx-0.5">×</span>
                
                {/* Price display with /unit indicator */}
                <span className="text-xs font-mono bg-muted/50 px-1.5 py-0.5 rounded min-w-[80px] text-center">
                  {line.currency === "CLP" ? "$" : "UF"}/{line.unit_type || "m2"} {line.default_amount_uf.toLocaleString("es-CL", { minimumFractionDigits: 2 })}
                </span>
                
                {/* Calculated total */}
                <span className="text-xs font-mono bg-primary/10 px-1.5 py-0.5 rounded min-w-[70px] text-center">
                  = {line.currency === "CLP" ? "$" : "UF"} {((line.quantity || 0) * line.default_amount_uf).toLocaleString("es-CL", { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
            
            {/* Spacer for parent lines */}
            {hasChildren && <div className="flex-1" />}
            
            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsEditing(true)}
                className="h-6 w-6 p-0"
                title="Editar"
              >
                <Edit2 className="h-3 w-3" />
              </Button>
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
          </>
        )}
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