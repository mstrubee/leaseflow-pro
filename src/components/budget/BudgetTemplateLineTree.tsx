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
  level?: number;
}

export const BudgetTemplateLineTree = ({
  lines,
  onAddLine,
  onUpdateLine,
  onDeleteLine,
  onReorder,
  level = 0,
}: BudgetTemplateLineTreeProps) => {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = lines.findIndex((item) => item.id === active.id);
      const newIndex = lines.findIndex((item) => item.id === over.id);
      const newOrder = arrayMove(lines, oldIndex, newIndex);
      
      // Update display_order for each line
      newOrder.forEach((line, index) => {
        onUpdateLine(line.id, { display_order: index });
      });
      
      if (onReorder) {
        onReorder(newOrder);
      }
    }
  };

  return (
    <div className={cn("space-y-1", level > 0 && "ml-6 border-l border-border pl-4")}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={lines.map(l => l.id)} strategy={verticalListSortingStrategy}>
          {lines.map((line) => (
            <SortableTemplateLineItem
              key={line.id}
              line={line}
              level={level}
              onAddLine={onAddLine}
              onUpdateLine={onUpdateLine}
              onDeleteLine={onDeleteLine}
              onReorder={onReorder}
            />
          ))}
        </SortableContext>
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
};

interface SortableTemplateLineItemProps {
  line: TemplateLine;
  level: number;
  onAddLine: (parentId: string | null) => void;
  onUpdateLine: (id: string, data: Partial<TemplateLine>) => void;
  onDeleteLine: (id: string) => void;
  onReorder?: (lines: TemplateLine[]) => void;
}

const SortableTemplateLineItem = ({
  line,
  level,
  onAddLine,
  onUpdateLine,
  onDeleteLine,
  onReorder,
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
    opacity: isDragging ? 0.5 : 1,
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
          "flex items-center gap-2 py-2 px-2 rounded-md hover:bg-accent/50 group",
          level === 0 && "bg-muted/30"
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
        />
      )}
    </div>
  );
};