import { useState, createContext, useContext, useMemo, useRef } from "react";
import { useEconomicIndicators } from "@/hooks/useEconomicIndicators";
import { ChevronRight, ChevronDown, Plus, Trash2, GripVertical, CornerDownRight, ArrowUp, ArrowDown, Ruler, Percent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CategorySelect } from "@/components/suppliers/CategorySelect";
import { SupplierSelect } from "@/components/suppliers/SupplierSelect";

// Surface source options that can be indexed from the contract
export const QUANTITY_SOURCE_OPTIONS: { value: string; label: string; unit: string }[] = [
  { value: "superficie_terreno", label: "Terreno", unit: "m²" },
  { value: "superficie_showroom", label: "Showroom", unit: "m²" },
  { value: "superficie_bodega_backoffice", label: "Bodega & Backoffice", unit: "m²" },
  { value: "superficie_edificada_local", label: "Edificada Local", unit: "m²" },
  { value: "superficie_exterior_cubierto", label: "Ext. Cubierto", unit: "m²" },
  { value: "superficie_exterior_descubierto", label: "Ext. Descubierto", unit: "m²" },
  { value: "num_estacionamientos", label: "Estacionamientos", unit: "un" },
  { value: "metros_lineales_frente", label: "mL Frente", unit: "mL" },
];
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  DragEndEvent,
  DragMoveEvent,
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
  quantity_source?: string | null;
  calc_type?: string | null;
  calc_source_line_id?: string | null;
  calc_percentage?: number | null;
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
  /** Mueve una línea a un nivel (padre) y posición concretos entre sus hermanos. */
  onMoveLine?: (activeId: string, newParentId: string | null, orderedSiblingIds: string[]) => void;
  level?: number;
  allLines?: TemplateLine[];
  isRoot?: boolean;
}

// Intención semántica del arrastre (para feedback visual claro):
//  - reorder-same: reordenar dentro del mismo padre
//  - change-hierarchy: mover a otro padre (into a otro, o before/after con padre distinto)
//  - new-root: soltar en la zona raíz para crear una jerarquía de primer nivel
type DragIntent = "reorder-same" | "change-hierarchy" | "new-root" | null;

// Id centinela del droppable de "nueva jerarquía de primer nivel"
const ROOT_END_ID = "__root_end__";

// Context for drag state
interface DragContextType {
  activeId: string | null;
  overId: string | null;
  activeLevel: number | null;
  overLevel: number | null;
  dropPosition: "before" | "into" | "after" | null;
  intent: DragIntent;
}

const DragStateContext = createContext<DragContextType>({
  activeId: null,
  overId: null,
  activeLevel: null,
  overLevel: null,
  dropPosition: null,
  intent: null,
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

// Zona de drop dedicada al final de la lista: soltar aquí promueve la línea a
// jerarquía de primer nivel (raíz). Solo visible mientras se arrastra.
const RootEndDropZone = ({ visible }: { visible: boolean }) => {
  const { setNodeRef, isOver } = useDroppable({ id: ROOT_END_ID });
  if (!visible) return null;
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "mt-2 rounded-lg border-2 border-dashed py-6 px-4 text-center text-sm flex items-center justify-center gap-2 transition-colors",
        isOver
          ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium"
          : "border-border/60 text-muted-foreground",
      )}
    >
      <CornerDownRight className="h-4 w-4" />
      Soltar aquí para crear una nueva jerarquía de primer nivel
    </div>
  );
};

export const BudgetTemplateLineTree = ({
  lines,
  onAddLine,
  onUpdateLine,
  onDeleteLine,
  onReorder,
  onReparent,
  onMoveLine,
  level = 0,
  allLines,
  isRoot = true,
}: BudgetTemplateLineTreeProps) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<"before" | "into" | "after" | null>(null);
  const [intent, setIntent] = useState<DragIntent>(null);
  // Y del puntero durante el arrastre = Y inicial + delta acumulado.
  const initialPointerYRef = useRef<number | null>(null);
  const pointerYRef = useRef<number | null>(null);

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
    // Captura la Y inicial del puntero (solo mouse/touch; teclado no la trae).
    const ae = event.activatorEvent as any;
    const y = typeof ae?.clientY === "number" ? ae.clientY : null;
    initialPointerYRef.current = y;
    pointerYRef.current = y;
  };

  const handleDragMove = (event: DragMoveEvent) => {
    if (initialPointerYRef.current != null) {
      pointerYRef.current = initialPointerYRef.current + event.delta.y;
    }
  };

  // Zona de drop según la posición vertical del PUNTERO sobre la fila destino:
  // tercio superior → "before", tercio inferior → "after", centro → "into".
  // Si no hay puntero (arrastre por teclado), cae al centro del elemento arrastrado.
  const resolveDropPosition = (event: DragOverEvent | DragEndEvent): "before" | "into" | "after" => {
    const overRect = event.over?.rect;
    if (!overRect) return "into";
    let refY = pointerYRef.current;
    if (refY == null) {
      const activeRect = event.active.rect.current.translated;
      if (!activeRect) return "into";
      refY = activeRect.top + activeRect.height / 2;
    }
    const rel = (refY - overRect.top) / overRect.height;
    if (rel < 0.25) return "before";
    if (rel > 0.75) return "after";
    return "into";
  };

  // Deriva la intención semántica para pintar y para el hint.
  const resolveDragIntent = (
    activeLine: TemplateLine | null,
    overLine: TemplateLine | null,
    position: "before" | "into" | "after",
    overIsRootZone: boolean,
  ): DragIntent => {
    if (overIsRootZone) return "new-root";
    if (!activeLine || !overLine) return null;
    if (position === "into") {
      return overLine.id === activeLine.parent_id ? "reorder-same" : "change-hierarchy";
    }
    const newParentId = overLine.parent_id;
    return newParentId === activeLine.parent_id ? "reorder-same" : "change-hierarchy";
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    const overIdValue = over ? (over.id as string) : null;
    setOverId(overIdValue);

    // Zona raíz: no tiene línea/rect de fila asociada; cortocircuito.
    if (overIdValue === ROOT_END_ID) {
      setDropPosition(null);
      setIntent("new-root");
      return;
    }
    if (!over) {
      setDropPosition(null);
      setIntent(null);
      return;
    }
    const position = resolveDropPosition(event);
    setDropPosition(position);
    const activeLine = findLineById(rootLines, active.id as string);
    const overLine = findLineById(rootLines, overIdValue!);
    setIntent(resolveDragIntent(activeLine, overLine, position, false));
  };

  const clearDragState = () => {
    setActiveId(null);
    setOverId(null);
    setDropPosition(null);
    setIntent(null);
    initialPointerYRef.current = null;
    pointerYRef.current = null;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const overIdValue = over ? (over.id as string) : null;
    const position = over && overIdValue !== ROOT_END_ID ? resolveDropPosition(event) : "into";
    const activeLineId = active.id as string;
    clearDragState();

    if (!over) return;

    const activeLine = findLineById(rootLines, activeLineId);
    if (!activeLine) return;
    const descendantIds = getDescendantIds(activeLine);

    // Nueva jerarquía de primer nivel (zona raíz dedicada).
    if (overIdValue === ROOT_END_ID) {
      const rootIds = rootLines
        .filter((l) => l.parent_id === null && l.id !== activeLineId)
        .map((l) => l.id);
      if (onMoveLine) onMoveLine(activeLineId, null, [...rootIds, activeLineId]);
      else if (onReparent) onReparent(activeLineId, null);
      return;
    }

    if (active.id === over.id) return;
    const overLineId = overIdValue!;
    const overLine = findLineById(rootLines, overLineId);
    if (!overLine) return;

    // Prevenir ciclos: no soltar una línea dentro/como hermana bajo su propio subárbol
    if (descendantIds.includes(overLineId)) return;

    if (position === "into") {
      // Mover DENTRO de la línea destino (reparentar como última hija, con
      // display_order reindexado de forma atómica vía onMoveLine).
      const childIds = getSiblings(rootLines, activeLineId, overLineId)
        .map((s) => s.id)
        .filter((id) => id !== activeLineId);
      if (onMoveLine) onMoveLine(activeLineId, overLineId, [...childIds, activeLineId]);
      else if (onReparent) onReparent(activeLineId, overLineId);
      return;
    }

    // before / after → reordenar como HERMANA de la línea destino, en su nivel.
    const newParentId = overLine.parent_id;
    // Evitar ciclo si el nuevo padre es la propia línea o un descendiente suyo
    if (newParentId === activeLineId || descendantIds.includes(newParentId ?? "")) return;

    const siblings = getSiblings(rootLines, overLineId, newParentId)
      .map((s) => s.id)
      .filter((id) => id !== activeLineId);
    const overIdx = siblings.indexOf(overLineId);
    if (overIdx === -1) return;
    const insertIdx = position === "before" ? overIdx : overIdx + 1;
    const orderedSiblingIds = [...siblings];
    orderedSiblingIds.splice(insertIdx, 0, activeLineId);

    const sameParent = activeLine.parent_id === newParentId;
    if (sameParent && onReorder) {
      // Reorden dentro del mismo nivel (usa el handler atómico existente)
      const orderedLines = orderedSiblingIds
        .map((id) => findLineById(rootLines, id))
        .filter((l): l is TemplateLine => !!l);
      onReorder(orderedLines);
    } else if (onMoveLine) {
      // Cambio de nivel (p. ej. reordenar entre madres, sacar una hija a raíz)
      onMoveLine(activeLineId, newParentId, orderedSiblingIds);
    } else if (onReparent) {
      onReparent(activeLineId, newParentId);
    }
  };

  const handleDragCancel = () => {
    clearDragState();
  };

  const activeLine = activeId ? findLineById(rootLines, activeId) : null;
  const overLine = overId && overId !== ROOT_END_ID ? findLineById(rootLines, overId) : null;
  // Padre destino (para el cartelito de "cambiar de jerarquía"):
  //  into → la propia línea destino; before/after → el padre de la línea destino.
  const destParent = overLine
    ? dropPosition === "into"
      ? overLine
      : overLine.parent_id
        ? findLineById(rootLines, overLine.parent_id)
        : null
    : null;

  // Only render the DndContext at the root level
  if (isRoot) {
    return (
      <DragStateContext.Provider value={{ activeId, overId, activeLevel, overLevel, dropPosition, intent }}>
        <div className={cn("space-y-1", level > 0 && "ml-6 border-l border-border pl-4")}>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
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

                  onMoveLine={onMoveLine}
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
                <div className={cn(
                  "flex items-center gap-3 py-2.5 px-3 rounded-lg bg-background border-2 shadow-xl animate-scale-in",
                  intent === "change-hierarchy" ? "border-violet-500"
                    : intent === "new-root" ? "border-emerald-500"
                    : "border-blue-500",
                )}>
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

            {/* Zona dedicada: soltar aquí para crear una jerarquía de primer nivel */}
            {level === 0 && <RootEndDropZone visible={!!activeId} />}
          </DndContext>

          {/* Cartelito flotante: 3 intenciones claras (color + ícono + texto) */}
          {activeId && intent && (intent === "new-root" || overLine) && (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
              <div className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full shadow-lg text-sm font-medium text-white",
                intent === "reorder-same" && "bg-blue-600",
                intent === "change-hierarchy" && "bg-violet-600",
                intent === "new-root" && "bg-emerald-600",
              )}>
                {intent === "new-root" ? (
                  <><CornerDownRight className="h-4 w-4" /> Crear nueva jerarquía de primer nivel</>
                ) : intent === "change-hierarchy" ? (
                  <>
                    <CornerDownRight className="h-4 w-4" />
                    {dropPosition === "into"
                      ? `Mover dentro de "${overLine!.name}"`
                      : `Mover a la jerarquía de "${destParent?.name ?? "raíz"}"`}
                  </>
                ) : (
                  <>
                    {dropPosition === "before" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                    Reordenar {dropPosition === "before" ? "antes" : "después"} de "{overLine!.name}"
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

          onMoveLine={onMoveLine}
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
  onMoveLine?: (activeId: string, newParentId: string | null, orderedSiblingIds: string[]) => void;
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
  onMoveLine,
  allLines,
}: SortableTemplateLineItemProps) => {
  const { activeId, overId, dropPosition, intent } = useContext(DragStateContext);
  const { ufValue } = useEconomicIndicators();
  
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useSortable({ id: line.id });

  // Con DragOverlay activo (la línea arrastrada se muestra siguiendo el cursor),
  // NO aplicamos el transform de "sorting": si lo hiciéramos, todas las líneas
  // se deslizarían para hacer espacio, lo que resulta confuso en un árbol.
  // Las filas quedan quietas y el destino se indica con el resaltado
  // (isReorderTarget / isReparentTarget) más abajo.
  const style = { opacity: isDragging ? 0.4 : undefined };

  const [isExpanded, setIsExpanded] = useState(true);
  const [isEditingName, setIsEditingName] = useState(false);
  const [hasBeenEdited, setHasBeenEdited] = useState(line.name !== "Nueva línea");
  const [isEditingQuantity, setIsEditingQuantity] = useState(false);
  const [isEditingUnit, setIsEditingUnit] = useState(false);
  const [isEditingAmount, setIsEditingAmount] = useState(false);
  const [isEditingCurrency, setIsEditingCurrency] = useState(false);
  const [isEditingPercentage, setIsEditingPercentage] = useState(false);
  const [editName, setEditName] = useState(line.name);
  const [editQuantity, setEditQuantity] = useState((line.quantity ?? 1).toString());
  const [editUnit, setEditUnit] = useState(line.unit_type || "m2");
  const [editAmount, setEditAmount] = useState(line.default_amount_uf.toString());
  const [editCurrency, setEditCurrency] = useState(line.currency || "UF");
  const [editPercentage, setEditPercentage] = useState((line.calc_percentage ?? 0).toString());

  const isCalcPercentage = line.calc_type === "percentage";

  const hasChildren = line.children && line.children.length > 0;
  const calculatedTotal = (parseFloat(editQuantity) || 0) * (parseFloat(editAmount) || 0);
  
  // Get root lines that have children (potential source lines for percentage calc)
  const rootParentLines = allLines.filter(l => l.id !== line.id && l.parent_id === null && l.children && l.children.length > 0);
  
  // Calculate percentage-based total
  const calcSourceLine = isCalcPercentage && line.calc_source_line_id 
    ? findLineById(allLines, line.calc_source_line_id) 
    : null;
  const sourceSubtotal = calcSourceLine ? calculateChildrenSubtotal(calcSourceLine) : 0;
  const calcPercentageTotal = isCalcPercentage ? sourceSubtotal * (line.calc_percentage || 0) / 100 : 0;
  
  // For parent lines: calculate children subtotal and apply multiplier
  const childrenSubtotal = hasChildren ? calculateChildrenSubtotal(line) : 0;
  const multiplier = line.quantity ?? 1;
  const parentTotal = childrenSubtotal * multiplier;

  // Determine if this is a drop target and which action per zone (before/into/after)
  const isDropTarget = overId === line.id && activeId !== line.id;
  const isReparentTarget = isDropTarget && dropPosition === "into";
  const isReorderBefore = isDropTarget && dropPosition === "before";
  const isReorderAfter = isDropTarget && dropPosition === "after";
  // Color por intención: azul = reordenar mismo nivel, violeta = cambiar de jerarquía.
  const isChangeHierarchy = intent === "change-hierarchy";
  const lineColor = isChangeHierarchy ? "bg-violet-500" : "bg-blue-500";
  const showInsertionLine = isReorderBefore || isReorderAfter;

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
    <div ref={setNodeRef} style={style} className={cn("relative", isDragging && "opacity-30")}>
      {/* Línea de inserción (reordenar / cambiar jerarquía) alineada al nivel destino */}
      {showInsertionLine && (
        <div
          className={cn(
            "absolute left-0 right-2 h-0.5 rounded-full z-20 pointer-events-none",
            lineColor,
            "before:content-[''] before:absolute before:-left-1 before:-top-[3px] before:h-2 before:w-2 before:rounded-full",
            isChangeHierarchy ? "before:bg-violet-500" : "before:bg-blue-500",
            isReorderBefore ? "-top-0.5" : "-bottom-0.5",
          )}
          style={{ marginLeft: `${level * 1.5}rem` }}
        />
      )}
      <div
        className={cn(
          "grid items-center py-2 px-2 rounded-md hover:bg-accent/50 group transition-all duration-200",
          // Grid columns depend on line type
          isCalcPercentage
            ? "grid-cols-[32px_28px_minmax(240px,1.2fr)_1fr_60px]"
            : !hasChildren 
              ? "grid-cols-[32px_28px_minmax(240px,1.2fr)_60px_40px_16px_60px_80px_100px_auto_60px]"
              : "grid-cols-[32px_28px_minmax(240px,1.2fr)_1fr_60px]",
          isCalcPercentage && "bg-amber-50/50 dark:bg-amber-950/20 border-l-2 border-amber-400",
          level === 0 && hasChildren && "bg-muted/60",
          level === 0 && !hasChildren && "bg-muted/20",
          level === 1 && hasChildren && "bg-muted/50",
          level === 1 && !hasChildren && "bg-muted/15",
          level === 2 && hasChildren && "bg-muted/40",
          level === 2 && !hasChildren && "bg-muted/10",
          level >= 3 && hasChildren && "bg-muted/35",
          level >= 3 && !hasChildren && "bg-muted/5",
          // "into": anillo violeta (cambiar de jerarquía) o azul (mismo padre, raro)
          isReparentTarget && (isChangeHierarchy
            ? "ring-2 ring-violet-500 ring-offset-2 bg-violet-500/10 scale-[1.02]"
            : "ring-2 ring-blue-500 ring-offset-2 bg-blue-500/10 scale-[1.02]")
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
        
        {/* Percentage-calculated line: show source selector + percentage */}
        {isCalcPercentage && (
          <div className="flex items-center gap-2 flex-1">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 border-amber-300 text-amber-700 dark:text-amber-300 whitespace-nowrap">
              <Percent className="h-3 w-3 mr-0.5" />
              Calculada
            </Badge>
            
            {/* Source line selector */}
            <span className="text-xs text-muted-foreground whitespace-nowrap">% de</span>
            <Select 
              value={line.calc_source_line_id || ""} 
              onValueChange={(val) => onUpdateLine(line.id, { calc_source_line_id: val || null })}
            >
              <SelectTrigger className="h-6 text-xs w-[180px]">
                <SelectValue placeholder="Seleccionar línea fuente" />
              </SelectTrigger>
              <SelectContent>
                {rootParentLines.map(rl => (
                  <SelectItem key={rl.id} value={rl.id}>
                    {rl.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {/* Percentage input */}
            <span className="text-xs text-muted-foreground">×</span>
            {isEditingPercentage ? (
              <Input
                type="number"
                value={editPercentage}
                onChange={(e) => setEditPercentage(e.target.value)}
                onBlur={() => {
                  const pct = parseFloat(editPercentage) || 0;
                  if (pct !== (line.calc_percentage || 0)) {
                    onUpdateLine(line.id, { calc_percentage: pct });
                  }
                  setIsEditingPercentage(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const pct = parseFloat(editPercentage) || 0;
                    onUpdateLine(line.id, { calc_percentage: pct });
                    setIsEditingPercentage(false);
                  } else if (e.key === "Escape") {
                    setEditPercentage((line.calc_percentage ?? 0).toString());
                    setIsEditingPercentage(false);
                  }
                }}
                className="h-6 w-16 text-xs"
                autoFocus
                min="0"
                step="0.1"
              />
            ) : (
              <span
                className="text-xs font-mono bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded cursor-text hover:bg-amber-200 dark:hover:bg-amber-900/50"
                onDoubleClick={() => {
                  setEditPercentage((line.calc_percentage ?? 0).toString());
                  setIsEditingPercentage(true);
                }}
                title="Doble clic para editar"
              >
                {line.calc_percentage || 0}%
              </span>
            )}
            
            {/* Calculated total */}
            <span className="text-xs text-muted-foreground">=</span>
            <span className="text-xs font-mono bg-primary/10 px-1.5 py-0.5 rounded font-semibold">
              UF {calcPercentageTotal.toLocaleString("es-CL", { minimumFractionDigits: 2 })}
            </span>
            {ufValue > 0 && calcPercentageTotal > 0 && (
              <span className="text-[9px] text-muted-foreground">
                ($ {Math.round(calcPercentageTotal * ufValue).toLocaleString("es-CL")})
              </span>
            )}
          </div>
        )}

        {/* Leaf node columns - only for normal (non-calculated) leaves */}
        {!hasChildren && !isCalcPercentage && (
          <>
            {/* Col 4: Quantity - manual or surface-indexed */}
            {line.quantity_source && line.quantity_source !== "manual" ? (
              <Popover>
                <PopoverTrigger asChild>
                  <button className="cursor-pointer" title="Cantidad indexada a superficie del contrato">
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 font-normal whitespace-nowrap">
                      <Ruler className="h-3 w-3 mr-0.5" />
                      {QUANTITY_SOURCE_OPTIONS.find(o => o.value === line.quantity_source)?.label || line.quantity_source}
                    </Badge>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-52 p-2 z-50" align="start">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Fuente de cantidad</p>
                    <button
                      className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-accent"
                      onClick={() => onUpdateLine(line.id, { quantity_source: null })}
                    >
                      Manual (valor fijo)
                    </button>
                    <div className="border-t my-1" />
                    <p className="text-[10px] text-muted-foreground px-2">Desde superficie</p>
                    {QUANTITY_SOURCE_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        className={cn(
                          "w-full text-left text-xs px-2 py-1.5 rounded hover:bg-accent",
                          line.quantity_source === opt.value && "bg-primary/10 font-medium"
                        )}
                        onClick={() => onUpdateLine(line.id, { quantity_source: opt.value })}
                      >
                        {opt.label} ({opt.unit})
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            ) : isEditingQuantity ? (
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
              <Popover>
                <PopoverTrigger asChild>
                  <span 
                    className={cn(
                      "text-xs font-mono px-1.5 py-0.5 rounded text-center cursor-pointer hover:bg-accent/50",
                      (line.quantity || 0) === 0 ? "bg-destructive/15 text-destructive" : "bg-muted/30"
                    )}
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setEditQuantity((line.quantity ?? 0) === 0 ? "" : (line.quantity ?? 0).toString());
                      setIsEditingQuantity(true);
                    }}
                    title="Clic para opciones, doble clic para editar"
                  >
                    {line.quantity || 0}
                  </span>
                </PopoverTrigger>
                <PopoverContent className="w-52 p-2 z-50" align="start">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Fuente de cantidad</p>
                    <button
                      className={cn("w-full text-left text-xs px-2 py-1.5 rounded hover:bg-accent", !line.quantity_source && "bg-primary/10 font-medium")}
                      onClick={() => {
                        setEditQuantity((line.quantity ?? 0) === 0 ? "" : (line.quantity ?? 0).toString());
                        setIsEditingQuantity(true);
                      }}
                    >
                      Manual (valor fijo)
                    </button>
                    <div className="border-t my-1" />
                    <p className="text-[10px] text-muted-foreground px-2">Desde superficie</p>
                    {QUANTITY_SOURCE_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-accent"
                        onClick={() => onUpdateLine(line.id, { quantity_source: opt.value })}
                      >
                        {opt.label} ({opt.unit})
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}
            
            {/* Col 5: Unit type */}
            {isEditingUnit ? (
              <Select value={editUnit} onValueChange={handleSaveUnit} defaultOpen>
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
            <Select value={line.currency || "UF"} onValueChange={(val) => onUpdateLine(line.id, { currency: val })}>
              <SelectTrigger className="h-6 w-[70px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="UF">UF/{line.unit_type || "m²"}</SelectItem>
                <SelectItem value="CLP">$/{line.unit_type || "m²"}</SelectItem>
              </SelectContent>
            </Select>
            
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
              <div className="text-center">
                <span 
                  className={cn(
                    "text-xs font-mono px-1.5 py-0.5 rounded cursor-text hover:bg-accent/50",
                    line.default_amount_uf === 0 ? "bg-destructive/15 text-destructive" : "bg-muted/50"
                  )}
                  onDoubleClick={() => { setEditAmount(line.default_amount_uf === 0 ? "" : line.default_amount_uf.toString()); setIsEditingAmount(true); }}
                  title="Doble clic para editar"
                >
                  {line.default_amount_uf.toLocaleString("es-CL", { minimumFractionDigits: 2 })}
                </span>
                {line.currency !== "CLP" && ufValue > 0 && line.default_amount_uf > 0 && (
                  <div className="text-[9px] text-muted-foreground mt-0.5">
                    $ {Math.round(line.default_amount_uf * ufValue).toLocaleString("es-CL")}
                  </div>
                )}
              </div>
            )}
            
            {/* Col 9: Calculated total */}
            <div className="text-center">
              <span className="text-xs font-mono bg-primary/10 px-1.5 py-0.5 rounded">
                = {line.currency === "CLP" ? "$" : "UF"} {((line.quantity || 0) * line.default_amount_uf).toLocaleString("es-CL", { minimumFractionDigits: 2 })}
              </span>
              {line.currency !== "CLP" && ufValue > 0 && ((line.quantity || 0) * line.default_amount_uf) > 0 && (
                <div className="text-[9px] text-muted-foreground mt-0.5">
                  $ {Math.round(((line.quantity || 0) * line.default_amount_uf) * ufValue).toLocaleString("es-CL")}
                </div>
              )}
            </div>
            
            {/* Col 10: Supplier */}
            <div className="flex items-center gap-1 border-l border-border pl-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Prov:</span>
              <SupplierSelect
                value={null}
                onChange={handleSupplierChange}
                categoryId={line.category_id}
                supplierName={line.supplier_name}
              />
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
                      onDoubleClick={() => {
                        const val = line.quantity ?? 1;
                        setEditQuantity(val === 0 ? "" : val.toString());
                        setIsEditingQuantity(true);
                      }}
                      title="Doble clic para editar"
                    >
                      {multiplier}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">un</span>
                </div>
                
                <div>
                  <span className="text-xs font-mono bg-primary/10 px-2 py-0.5 rounded font-semibold">
                    = UF {parentTotal.toLocaleString("es-CL", { minimumFractionDigits: 2 })}
                  </span>
                  {ufValue > 0 && parentTotal > 0 && (
                    <span className="text-[9px] text-muted-foreground ml-1">
                      ($ {Math.round(parentTotal * ufValue).toLocaleString("es-CL")})
                    </span>
                  )}
                </div>
                
                <span className="text-xs text-muted-foreground">
                  (Unit: UF {childrenSubtotal.toLocaleString("es-CL", { minimumFractionDigits: 2 })})
                </span>
              </>
            )}
          </div>
        )}
        
        {/* Last col: Actions */}
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity justify-end">
          {/* Toggle percentage calc - only for root lines without children */}
          {!hasChildren && line.parent_id === null && (
            <Button
              size="sm"
              variant={isCalcPercentage ? "secondary" : "ghost"}
              onClick={() => {
                if (isCalcPercentage) {
                  onUpdateLine(line.id, { calc_type: null, calc_source_line_id: null, calc_percentage: null });
                } else {
                  onUpdateLine(line.id, { calc_type: "percentage", calc_source_line_id: null, calc_percentage: 0 });
                }
              }}
              className={cn("h-6 w-6 p-0", isCalcPercentage && "text-amber-600")}
              title={isCalcPercentage ? "Desactivar cálculo por porcentaje" : "Activar cálculo por porcentaje"}
            >
              <Percent className="h-3 w-3" />
            </Button>
          )}
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
        <>
          <BudgetTemplateLineTree
            lines={line.children!}
            level={level + 1}
            onAddLine={onAddLine}
            onUpdateLine={onUpdateLine}
            onDeleteLine={onDeleteLine}
            onReorder={onReorder}

            onMoveLine={onMoveLine}
            onReparent={onReparent}
            allLines={allLines}
            isRoot={false}
          />
          <div className={cn("ml-6 border-l border-border pl-4")}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAddLine(line.id)}
              className="text-muted-foreground hover:text-foreground text-xs h-7"
            >
              <Plus className="h-3 w-3 mr-1" />
              Línea
            </Button>
          </div>
        </>
      )}
    </div>
  );
};